import { describe, expect, it, vi } from "vitest";
import {
  checkPublicUrl,
  extractFromHtml,
  extractFromShopifyJson,
  isBlockedIp,
  priceLabel,
  shopifyJsonUrl,
} from "./product";
import { assertPublicHost, safeFetch } from "./product.server";

describe("product extraction", () => {
  it("reads JSON-LD Product data first", () => {
    const html = `<html><head><meta property="og:title" content="OG name">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Cozy Mug &amp; Lid","description":"<p>Keeps tea <b>hot</b>.</p>","image":["/img/a.jpg","https://cdn.x/b.png"],"brand":{"name":"Verolane"},"offers":{"@type":"Offer","price":"24.00","priceCurrency":"CAD"}}]}</script>
      </head></html>`;
    const p = extractFromHtml(html, "https://shop.example.com/p/mug");
    expect(p).toMatchObject({
      title: "Cozy Mug & Lid",
      description: "Keeps tea hot .",
      price: "24",
      currency: "CAD",
      store: "Verolane",
    });
    expect(p.images).toEqual(["https://shop.example.com/img/a.jpg", "https://cdn.x/b.png"]);
  });
  it("falls back to Open Graph and product meta tags (Etsy style)", () => {
    const html = `<title>ignored</title><meta property="og:title" content="Handmade Candle"><meta property="og:description" content="Soy wax, 40 hours.">
      <meta property="og:image" content="https://i.etsystatic.com/1.jpg"><meta property="product:price:amount" content="18.50"><meta property="product:price:currency" content="USD"><meta property="og:site_name" content="Etsy">`;
    expect(extractFromHtml(html, "https://www.etsy.com/listing/1")).toMatchObject({
      title: "Handmade Candle",
      price: "18.50",
      currency: "USD",
      images: ["https://i.etsystatic.com/1.jpg"],
      store: "Etsy",
    });
  });
  it("ignores malformed JSON-LD and non-http images", () => {
    const html = `<script type="application/ld+json">{bad json</script><meta property="og:title" content="X"><meta property="og:image" content="javascript:alert(1)">`;
    const p = extractFromHtml(html, "https://a.com/");
    expect(p.title).toBe("X");
    expect(p.images).toEqual([]);
  });
  it("parses Shopify .js (cents) and .json (decimal) shapes", () => {
    expect(
      extractFromShopifyJson(
        {
          title: "Tee",
          handle: "tee",
          price: 2500,
          description: "<p>Soft</p>",
          images: ["//cdn.shopify.com/t.jpg"],
        },
        "https://s.com/products/tee",
      ),
    ).toMatchObject({
      title: "Tee",
      price: "25",
      images: ["https://cdn.shopify.com/t.jpg"],
      description: "Soft",
    });
    expect(
      extractFromShopifyJson(
        {
          product: {
            title: "Tee",
            body_html: "Hi",
            variants: [{ price: "19.99" }],
            images: [{ src: "https://cdn.shopify.com/a.jpg" }],
          },
        },
        "https://s.com/products/tee",
      ),
    ).toMatchObject({ price: "19.99", images: ["https://cdn.shopify.com/a.jpg"] });
    expect(extractFromShopifyJson({ nope: 1 }, "https://s.com")).toBeNull();
  });
  it("builds Shopify JSON URLs only for product pages", () => {
    expect(shopifyJsonUrl(new URL("https://s.com/collections/x/products/tee?variant=1"))).toBe(
      "https://s.com/collections/x/products/tee.js",
    );
    expect(shopifyJsonUrl(new URL("https://s.com/pages/about"))).toBeNull();
  });
  it("formats prices", () => {
    expect(priceLabel({ price: "24", currency: "CAD" })).toBe("$24");
    expect(priceLabel({ price: "9.5", currency: "SEK" })).toBe("9.5 SEK");
    expect(priceLabel({ price: "", currency: "USD" })).toBe("");
  });
});

describe("SSRF protection", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "999.1.1.1",
    ])
      expect(isBlockedIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.1", "2606:4700::1111"])
      expect(isBlockedIp(ip), ip).toBe(false);
  });
  it("rejects non-http schemes, credentials, local hostnames and odd ports", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://a.com",
      "http://user:pw@a.com",
      "http://localhost/",
      "http://printer.local/",
      "http://10.0.0.1/",
      "http://[::1]/",
      "https://a.com:22/",
      "http://intranet/",
    ])
      expect(() => checkPublicUrl(u), u).toThrow();
    expect(checkPublicUrl("https://shop.example.com/products/x").hostname).toBe("shop.example.com");
  });
  it("rejects hosts whose DNS points inside the network", async () => {
    await expect(
      assertPublicHost(new URL("https://evil.example"), async () => ["93.184.216.34", "10.0.0.5"]),
    ).rejects.toThrow("public");
    await expect(
      assertPublicHost(new URL("https://ok.example"), async () => ["93.184.216.34"]),
    ).resolves.toBeUndefined();
  });
  it("re-checks every redirect and caps redirects", async () => {
    const lookup = vi.fn(async (h: string) =>
      h === "inside.example" ? ["192.168.0.10"] : ["93.184.216.34"],
    );
    const fetchMock = vi.fn(async (u: URL | string) => {
      const url = String(u);
      if (url.startsWith("https://start.example"))
        return new Response(null, {
          status: 302,
          headers: { location: "https://inside.example/admin" },
        });
      return new Response("secret");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://start.example/p", { maxBytes: 1000, lookup })).rejects.toThrow(
      "public",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const loop = vi.fn(
      async () =>
        new Response(null, { status: 301, headers: { location: "https://loop.example/again" } }),
    );
    vi.stubGlobal("fetch", loop);
    await expect(safeFetch("https://loop.example/", { maxBytes: 1000, lookup })).rejects.toThrow(
      "too many",
    );
    expect(loop).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  });
  it("stops reading oversized responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(5000))),
    );
    await expect(
      safeFetch("https://big.example/", { maxBytes: 1000, lookup: async () => ["93.184.216.34"] }),
    ).rejects.toThrow("too large");
    vi.unstubAllGlobals();
  });
});
