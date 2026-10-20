export type Segment = { id: string; start: number; end: number };

export const segLen = (s: Segment) => s.end - s.start;
export const totalLength = (segs: Segment[]) => segs.reduce((a, s) => a + segLen(s), 0);

/** Find which segment covers timeline time t, and the offset inside it. */
export function locate(segs: Segment[], t: number) {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const len = segLen(s);
    if (t < acc + len || i === segs.length - 1) return { index: i, offset: Math.min(Math.max(t - acc, 0), len), startAt: acc };
    acc += len;
  }
  return null;
}

/** Split the segment under timeline time t into two. Ignores cuts within 50ms of an edge. */
export function splitAt(segs: Segment[], t: number, makeId: () => string): Segment[] {
  const hit = locate(segs, t);
  if (!hit) return segs;
  const s = segs[hit.index]!;
  if (hit.offset < 0.05 || segLen(s) - hit.offset < 0.05) return segs;
  const cut = s.start + hit.offset;
  const out = segs.slice();
  out.splice(hit.index, 1, { id: makeId(), start: s.start, end: cut }, { id: makeId(), start: cut, end: s.end });
  return out;
}

export function move(segs: Segment[], from: number, to: number): Segment[] {
  if (from === to || to < 0 || to >= segs.length) return segs;
  const out = segs.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item!);
  return out;
}

export async function renderSegments(buffer: AudioBuffer, segs: Segment[]): Promise<AudioBuffer> {
  const len = Math.max(1, Math.ceil(totalLength(segs) * buffer.sampleRate));
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, len, buffer.sampleRate);
  let at = 0;
  for (const s of segs) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(at, s.start, segLen(s));
    at += segLen(s);
  }
  return ctx.startRendering();
}

export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  data.setUint32(4, 36 + n * ch * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, "data");
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c]![i]!));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data], { type: "audio/wav" });
}
