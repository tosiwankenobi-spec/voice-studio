import { checkPublicUrl, isBlockedIp } from "./product";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const UA = "Mozilla/5.0 (compatible; VocalisBot/1.0; +https://vocalis.app)";

type Lookup = (host: string) => Promise<string[]>;

/** Resolves a hostname through DNS-over-HTTPS (works on Cloudflare Workers, which have no node:dns). */
export const dohLookup: Lookup = async (host) => {
  const ask = async (type: "A" | "AAAA") => {
    const r = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!r.ok) throw new Error("Couldn't look up that website.");
    const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
    return (j.Answer ?? []).filter((a) => a.type === (type === "A" ? 1 : 28)).map((a) => a.data);
  };
  const [a, aaaa] = await Promise.all([ask("A"), ask("AAAA").catch(() => [] as string[])]);
  return [...a, ...aaaa];
};

/** Throws unless every address the host resolves to is public. */
export async function assertPublicHost(url: URL, lookup: Lookup = dohLookup) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isBlockedIp(host)) throw new Error("That address isn't a public website.");
    return;
  }
  const ips = await lookup(host);
  if (!ips.length) throw new Error("Couldn't find that website.");
  if (ips.some(isBlockedIp)) throw new Error("That address isn't a public website.");
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("That page is too large.");
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("That page is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/**
 * Fetches a public URL with SSRF protection: http(s) only, public DNS answers only, every redirect
 * re-checked (max 3), 10 s timeout and a byte cap.
 */
export async function safeFetch(
  raw: string,
  opts: { maxBytes: number; accept?: string; lookup?: Lookup },
) {
  let url = checkPublicUrl(raw);
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url, opts.lookup);
    const res = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: {
        "user-agent": UA,
        accept: opts.accept ?? "text/html,application/json;q=0.9,*/*;q=0.5",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("That page redirected nowhere.");
      url = checkPublicUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`That page answered with an error (${res.status}).`);
    const bytes = await readCapped(res, opts.maxBytes);
    return {
      url: url.toString(),
      status: res.status,
      type: res.headers.get("content-type") ?? "",
      bytes,
    };
  }
  throw new Error("That page redirected too many times.");
}
