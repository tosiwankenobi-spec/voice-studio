/** Adds an "AI-generated voice" note to WAV files (RIFF LIST/INFO comment chunk) so the label travels with the file. */
export const AI_TAG = "AI-generated voice (Vocalis)";

function chunk(id: string, body: Uint8Array) {
  const pad = body.length % 2;
  const out = new Uint8Array(8 + body.length + pad);
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

/** Returns WAV bytes with an INFO/ICMT + ISFT note appended; anything that isn't a RIFF/WAVE file is returned unchanged. */
export function tagWav(bytes: Uint8Array, note = AI_TAG): Uint8Array {
  const tag = (s: string) =>
    String.fromCharCode(...bytes.subarray(s === "RIFF" ? 0 : 8, s === "RIFF" ? 4 : 12));
  if (bytes.length < 12 || tag("RIFF") !== "RIFF" || tag("WAVE") !== "WAVE") return bytes;
  const enc = new TextEncoder();
  const text = (s: string) => {
    const b = enc.encode(s);
    const z = new Uint8Array(b.length + 1);
    z.set(b);
    return z;
  };
  const info = [enc.encode("INFO"), chunk("ICMT", text(note)), chunk("ISFT", text("Vocalis"))];
  const listBody = new Uint8Array(info.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const p of info) {
    listBody.set(p, o);
    o += p.length;
  }
  const list = chunk("LIST", listBody);
  const out = new Uint8Array(bytes.length + list.length);
  out.set(bytes);
  out.set(list, bytes.length);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

/** Data/blob URL in, tagged blob URL out (WAV only; other formats pass through). */
export async function taggedDownloadUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  if (!/wav/i.test(blob.type)) return url;
  const bytes = tagWav(new Uint8Array(await blob.arrayBuffer()));
  return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/wav" }));
}
