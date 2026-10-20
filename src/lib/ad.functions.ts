import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordAIUsage } from "@/lib/usage";
import { MAX_PRODUCT_IMAGES, type Product } from "@/lib/product";

export const AD_LENGTHS = [15, 30, 60] as const;
export const AD_TONES = ["friendly", "premium", "energetic", "funny"] as const;
export type AdTone = (typeof AD_TONES)[number];

/** A planned ad scene. `image` is the index of a product photo, or null when an AI lifestyle shot is wanted. */
export type AdScene = {
  narration: string;
  image: number | null;
  imagePrompt: string;
  motion: string;
};

const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Reads a product page (Shopify, Etsy or any store with product tags) and returns its details. */
export const fetchProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => {
    const url = String(d.url ?? "").trim();
    if (!url) throw new Error("Paste a product link first.");
    if (url.length > 2000) throw new Error("That link is too long.");
    return { url };
  })
  .handler(async ({ data, context }) => {
    const {
      checkPublicUrl,
      extractFromHtml,
      extractFromShopifyJson,
      looksLikeShopify,
      shopifyJsonUrl,
    } = await import("./product");
    const { safeFetch } = await import("./product.server");
    await recordAIUsage(context, "product_fetch", 1);
    const start = checkPublicUrl(data.url);
    const tryShopify = async (u: URL, store: string) => {
      const js = shopifyJsonUrl(u);
      if (!js) return null;
      try {
        const r = await safeFetch(js, { maxBytes: 1024 * 1024, accept: "application/json" });
        return extractFromShopifyJson(
          JSON.parse(new TextDecoder().decode(r.bytes)),
          u.toString(),
          store,
        );
      } catch {
        return null;
      }
    };
    // Shopify stores expose clean product JSON; try it first for /products/ URLs.
    let product: Product | null = await tryShopify(start, "");
    if (!product || !product.images.length) {
      const page = await safeFetch(start.toString(), { maxBytes: MAX_PAGE_BYTES });
      const html = new TextDecoder().decode(page.bytes);
      const fromHtml = extractFromHtml(html, page.url);
      if (!product && looksLikeShopify(html))
        product = await tryShopify(new URL(page.url), fromHtml.store);
      product = product
        ? {
            ...fromHtml,
            ...product,
            store: product.store || fromHtml.store,
            images: product.images.length ? product.images : fromHtml.images,
          }
        : fromHtml;
    }
    if (!product.title)
      throw new Error("Couldn't find a product on that page. Fill in the details by hand instead.");
    if (!product.store) product.store = new URL(product.url).hostname.replace(/^www\./, "");
    return { product: { ...product, images: product.images.slice(0, MAX_PRODUCT_IMAGES) } };
  });

/** Fetches a product photo through the server so the browser can draw it on a canvas (no CORS taint). */
export const proxyImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => {
    const url = String(d.url ?? "").trim();
    if (!/^https?:\/\//i.test(url) || url.length > 2000) throw new Error("Invalid image link.");
    return { url };
  })
  .handler(async ({ data }) => {
    const { safeFetch } = await import("./product.server");
    const r = await safeFetch(data.url, {
      maxBytes: MAX_IMAGE_BYTES,
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
    });
    const type = r.type.split(";")[0]!.trim().toLowerCase();
    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(type))
      throw new Error("That link isn't a supported image.");
    let bin = "";
    for (let i = 0; i < r.bytes.length; i += 0x8000)
      bin += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
    return { dataUrl: `data:${type};base64,${btoa(bin)}` };
  });

/** Claude writes a short ad as scenes that reuse the product photos. */
export const planAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product: Product; seconds: number; tone: string; imageCount: number }) => {
    const p = d.product ?? ({} as Product);
    const title = String(p.title ?? "")
      .trim()
      .slice(0, 200);
    if (!title) throw new Error("Add the product name first.");
    const seconds = (AD_LENGTHS as readonly number[]).includes(Number(d.seconds))
      ? Number(d.seconds)
      : 30;
    const tone = (AD_TONES as readonly string[]).includes(d.tone) ? (d.tone as AdTone) : "friendly";
    const imageCount = Math.max(
      0,
      Math.min(MAX_PRODUCT_IMAGES, Math.floor(Number(d.imageCount) || 0)),
    );
    return {
      product: {
        title,
        price: String(p.price ?? "").slice(0, 20),
        currency: String(p.currency ?? "").slice(0, 8),
        description: String(p.description ?? "").slice(0, 1500),
        store: String(p.store ?? "").slice(0, 80),
      },
      seconds,
      tone,
      imageCount,
    };
  })
  .handler(async ({ data, context }) => {
    const { callClaude, parseJsonReply } = await import("./claude.server");
    await recordAIUsage(context, "ad_planning", 1);
    const words = Math.round(data.seconds * 2.4);
    const scenes = Math.max(2, Math.round(data.seconds / 5));
    const { product: p } = data;
    const reply = await callClaude({
      maxTokens: 4000,
      system:
        `You write short vertical video ads for small online shops. Write about ${words} spoken words in a ${data.tone} tone, split into ${scenes} scenes. ` +
        "Scene 1 must open with a hook that grabs attention within 2 seconds. Then 2-3 concrete benefits drawn from the product details (never invent specs, materials or claims that aren't given). " +
        `The last scene is a call to action that says the price (if given) and tells viewers to tap the link in bio or visit ${p.store || "the shop"}. ` +
        "Write for the ear: short sentences, spelled-out numbers except the price. " +
        `There are ${data.imageCount} product photos, numbered 0 to ${Math.max(0, data.imageCount - 1)}. For each scene pick the best photo by its number in "image". ` +
        'You may set "image" to null for at most 2 scenes and instead describe a lifestyle shot in "imagePrompt" (product in use, setting, lighting; vertical framing; no text). ' +
        (data.imageCount === 0
          ? 'There are no photos, so every scene needs "image": null and an imagePrompt. '
          : "") +
        'Return ONLY a JSON array: [{"narration":"...","image":0,"imagePrompt":"","motion":"slow push-in"}]. No markdown.',
      user: `Product: ${p.title}\nPrice: ${p.price ? `${p.price} ${p.currency}`.trim() : "not given"}\nShop: ${p.store || "not given"}\nDetails:\n"""\n${p.description || "(none)"}\n"""`,
    });
    const raw = parseJsonReply<Partial<AdScene>[]>(reply, "array");
    let aiShots = 0;
    const out: AdScene[] = raw
      .filter((s) => s && typeof s.narration === "string" && s.narration.trim())
      .map((s, i) => {
        let image =
          typeof s.image === "number" &&
          Number.isInteger(s.image) &&
          s.image >= 0 &&
          s.image < data.imageCount
            ? s.image
            : null;
        if (
          image === null &&
          data.imageCount > 0 &&
          (aiShots >= 2 || !String(s.imagePrompt ?? "").trim())
        )
          image = i % data.imageCount;
        if (image === null) aiShots++;
        return {
          narration: s.narration!.trim(),
          image,
          imagePrompt:
            String(s.imagePrompt ?? "").trim() ||
            `${p.title}, lifestyle product photo, natural light, vertical framing`,
          motion: String(s.motion ?? "slow push-in").trim(),
        };
      });
    if (!out.length) throw new Error("Couldn't write the ad — try again.");
    return { scenes: out };
  });
