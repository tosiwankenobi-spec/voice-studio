/** Product details pulled from a store page (Shopify, Etsy or any page with JSON-LD / Open Graph tags). */
export type Product = {
  title: string;
  price: string;
  currency: string;
  description: string;
  images: string[];
  store: string;
  url: string;
};

export const EMPTY_PRODUCT: Product = {
  title: "",
  price: "",
  currency: "",
  description: "",
  images: [],
  store: "",
  url: "",
};
export const MAX_PRODUCT_IMAGES = 6;

// ---------- URL safety (SSRF) ----------

/** True for IPv4/IPv6 addresses that must never be fetched server-side (private, loopback, link-local, metadata, etc). */
export function isBlockedIp(ip: string): boolean {
  const v = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (v.includes(":")) {
    if (v === "::" || v === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped?.[1]) return isBlockedIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v)) return true; // hex-mapped IPv4: refuse rather than decode
    const first = parseInt(v.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (v.startsWith("64:ff9b:") || v.startsWith("2001:db8:") || v.startsWith("100::")) return true;
    return false;
  }
  const parts = v.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return true;
  const [a, b] = parts.map(Number) as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Validates a user-supplied URL before any DNS lookup. Returns the parsed URL or throws a friendly error. */
export function checkPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only http and https links are supported.");
  if (url.username || url.password) throw new Error("Links with passwords aren't supported.");
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (!host.includes(".") && !host.includes(":"))
  ) {
    throw new Error("That address isn't a public website.");
  }
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) {
    if (isBlockedIp(host)) throw new Error("That address isn't a public website.");
  }
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port))
    throw new Error("That address isn't a public website.");
  return url;
}

// ---------- Extraction ----------

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ");

/** Strips HTML tags and collapses whitespace. */
export function plainText(html: string, max = 1500) {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, max);
}

function absolute(src: unknown, base: string): string | null {
  if (typeof src !== "string" || !src.trim()) return null;
  try {
    const u = new URL(src.trim().replace(/^\/\//, "https://"), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function uniqImages(list: unknown[], base: string) {
  const out: string[] = [];
  for (const x of list) {
    const raw =
      typeof x === "string"
        ? x
        : ((x as { url?: unknown; src?: unknown; contentUrl?: unknown } | null)?.url ??
          (x as { src?: unknown })?.src ??
          (x as { contentUrl?: unknown })?.contentUrl);
    const u = absolute(raw, base);
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= MAX_PRODUCT_IMAGES) break;
  }
  return out;
}

function formatPrice(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2).replace(/\.00$/, "") : "";
}

function findJsonLdProduct(html: string): Record<string, unknown> | null {
  const blocks =
    html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const hit = visit(n);
        if (hit) return hit;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return o;
    return visit(o["@graph"]) ?? visit(o["mainEntity"]);
  };
  for (const b of blocks) {
    const json = b
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();
    try {
      const hit = visit(JSON.parse(json));
      if (hit) return hit;
    } catch {
      /* ignore malformed blocks */
    }
  }
  return null;
}

function meta(html: string, key: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = re.exec(html)?.[0];
  const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? decode(content).trim() : "";
}

function metaAll(html: string, key: string): string[] {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*>`,
    "gi",
  );
  return (html.match(re) ?? [])
    .map((t) => /content=["']([^"']*)["']/i.exec(t)?.[1] ?? "")
    .filter(Boolean)
    .map(decode);
}

/** Pulls product details from a page's HTML: JSON-LD Product first, then Open Graph / product meta tags. */
export function extractFromHtml(html: string, pageUrl: string): Product {
  const p: Product = { ...EMPTY_PRODUCT, url: pageUrl, images: [] };
  const ld = findJsonLdProduct(html);
  if (ld) {
    p.title = typeof ld["name"] === "string" ? decode(ld["name"]).trim() : "";
    p.description = typeof ld["description"] === "string" ? plainText(ld["description"]) : "";
    const imgs = ld["image"];
    p.images = uniqImages(Array.isArray(imgs) ? imgs : imgs ? [imgs] : [], pageUrl);
    const offers = ld["offers"];
    const offer = (Array.isArray(offers) ? offers[0] : offers) as
      Record<string, unknown> | undefined;
    if (offer) {
      p.price = formatPrice(
        offer["price"] ??
          offer["lowPrice"] ??
          (offer["priceSpecification"] as Record<string, unknown> | undefined)?.["price"],
      );
      p.currency = typeof offer["priceCurrency"] === "string" ? offer["priceCurrency"] : "";
    }
    const brand = ld["brand"];
    p.store =
      typeof brand === "string"
        ? brand
        : typeof (brand as { name?: unknown } | undefined)?.name === "string"
          ? String((brand as { name: string }).name)
          : "";
  }
  if (!p.title)
    p.title =
      meta(html, "og:title") ||
      plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "", 200);
  if (!p.description) p.description = meta(html, "og:description") || meta(html, "description");
  if (!p.price)
    p.price = formatPrice(meta(html, "product:price:amount") || meta(html, "og:price:amount"));
  if (!p.currency)
    p.currency = meta(html, "product:price:currency") || meta(html, "og:price:currency");
  if (!p.images.length)
    p.images = uniqImages(
      [...metaAll(html, "og:image"), ...metaAll(html, "og:image:secure_url")],
      pageUrl,
    );
  if (!p.store) p.store = meta(html, "og:site_name");
  p.title = p.title.slice(0, 200);
  p.description = p.description.slice(0, 1500);
  return p;
}

/** Parses Shopify's `/products/<handle>.js` (or `.json`) response. */
export function extractFromShopifyJson(json: unknown, pageUrl: string, store = ""): Product | null {
  const wrapped = !!json && typeof json === "object" && "product" in json; // `.json` shape: { product: {...} }
  const root = (wrapped ? (json as { product: unknown }).product : json) as Record<
    string,
    unknown
  > | null;
  if (!root || typeof root !== "object" || typeof root["title"] !== "string") return null;
  const variants = Array.isArray(root["variants"])
    ? (root["variants"] as Record<string, unknown>[])
    : [];
  // `.js` prices are integer cents; `.json` prices are decimal strings.
  const rawPrice = root["price"] ?? variants[0]?.["price"];
  const price =
    !wrapped && typeof rawPrice === "number" ? formatPrice(rawPrice / 100) : formatPrice(rawPrice);
  const imgs = Array.isArray(root["images"]) ? root["images"] : [];
  return {
    title: String(root["title"]).slice(0, 200),
    price,
    currency: "",
    description: plainText(String(root["description"] ?? root["body_html"] ?? "")),
    images: uniqImages(imgs, pageUrl),
    store,
    url: pageUrl,
  };
}

/** For a Shopify product URL, the matching `.js` endpoint (or null if it isn't a /products/ URL). */
export function shopifyJsonUrl(url: URL): string | null {
  const m = /^(.*\/products\/[^/?#.]+)/.exec(url.pathname);
  return m ? `${url.origin}${m[1]}.js` : null;
}

export function looksLikeShopify(html: string) {
  return /cdn\.shopify\.com|Shopify\.shop|shopify-section/i.test(html);
}

export function priceLabel(p: Pick<Product, "price" | "currency">) {
  if (!p.price) return "";
  const sym: Record<string, string> = {
    USD: "$",
    CAD: "$",
    AUD: "$",
    NZD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    INR: "₹",
  };
  const s = sym[p.currency.toUpperCase()];
  return s
    ? `${s}${p.price}`
    : p.currency
      ? `${p.price} ${p.currency.toUpperCase()}`
      : `$${p.price}`;
}
