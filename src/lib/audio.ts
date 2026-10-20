export type Segment = { id: string; start: number; end: number; patchId?: string };

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

/** A transcribed word, timed in seconds of the ORIGINAL recording. */
export type Word = { w: string; s: number; e: number; patchId?: string };

/** Convert timeline time to original-recording time. */
export function toSource(segs: Segment[], t: number) {
  const hit = locate(segs, t);
  if (!hit) return null;
  return { index: hit.index, src: segs[hit.index]!.start + hit.offset, startAt: hit.startAt };
}

/** Word boundaries (gap midpoints) in source time, including start of first and end of last word. */
export function wordBoundaries(words: Word[]) {
  const out: number[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    out.push(prev ? (prev.e + w.s) / 2 : w.s);
  });
  const last = words[words.length - 1];
  if (last) out.push(last.e);
  return out;
}

/** Quietest 10ms moment within ±radius seconds of t (source time). */
export function quietestNear(buffer: AudioBuffer, t: number, radius = 0.3) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.01));
  const from = Math.max(0, Math.floor((t - radius) * sr));
  const to = Math.min(data.length - win, Math.floor((t + radius) * sr));
  let best = t;
  let bestScore = Infinity;
  for (let i = from; i <= to; i += Math.floor(win / 2) || 1) {
    let sum = 0;
    for (let j = 0; j < win; j++) sum += data[i + j]! * data[i + j]!;
    // Prefer quiet, then closeness to the estimated boundary.
    const score = sum / win + Math.abs(i / sr - t) * 1e-6;
    if (score < bestScore) {
      bestScore = score;
      best = (i + win / 2) / sr;
    }
  }
  return best;
}

/** Split at the word gap nearest to timeline time t (falls back to exact time when no words). */
export function splitAtWord(segs: Segment[], t: number, words: Word[], makeId: () => string, refine?: (src: number) => number) {
  const loc = toSource(segs, t);
  if (!loc || !words.length) return splitAt(segs, t, makeId);
  const s = segs[loc.index]!;
  const inside = wordBoundaries(words).filter((b) => b > s.start + 0.05 && b < s.end - 0.05);
  if (!inside.length) return splitAt(segs, t, makeId);
  let b = inside.reduce((a, x) => (Math.abs(x - loc.src) < Math.abs(a - loc.src) ? x : a));
  if (refine) b = Math.min(s.end - 0.05, Math.max(s.start + 0.05, refine(b)));
  return splitAt(segs, loc.startAt + (b - s.start), makeId);
}

/** Remove the source-time range [a, b) wherever it appears on the timeline. */
export function cutSource(segs: Segment[], a: number, b: number, makeId: () => string): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    if (b <= s.start || a >= s.end) { out.push(s); continue; }
    if (a - s.start > 0.01) out.push({ id: makeId(), start: s.start, end: a });
    if (s.end - b > 0.01) out.push({ id: makeId(), start: b, end: s.end });
  }
  return out;
}

/** Source-time range a word occupies, extended to the midpoints of its neighbouring gaps. */
export function wordRange(words: Word[], i: number) {
  const bounds = wordBoundaries(words);
  return { a: bounds[i]!, b: bounds[i + 1]! };
}

/** Words in timeline order: each word appears where its midpoint is kept. */
export function wordsOnTimeline(segs: Segment[], words: Word[]) {
  const out: { i: number; at: number }[] = [];
  let acc = 0;
  for (const s of segs) {
    words.forEach((w, i) => {
      const mid = (w.s + w.e) / 2;
      if (mid >= s.start && mid < s.end) out.push({ i, at: acc + Math.max(0, w.s - s.start) });
    });
    acc += segLen(s);
  }
  return out;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
const tokens = (t: string) => t.split(/\s+/).map(norm).filter(Boolean);

/** Pairs of matching positions (i in a, j in b) from a longest common subsequence. */
export function lcsPairs(a: string[], b: string[]) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/**
 * When an edit only deletes words from the transcript, returns the indices (into `timelineWords`,
 * the timed words in timeline order) whose audio should be cut. Rewrites/additions return [].
 */
/** True when `newText` only removes whole words from `oldText`. */
export function isPureDeletion(oldText: string, newText: string) {
  const a = tokens(oldText), b = tokens(newText);
  return lcsPairs(a, b).length === b.length;
}

export function deletedTimelineWords(oldText: string, newText: string, timelineWords: string[]): number[] {
  const a = tokens(oldText), b = tokens(newText);
  if (b.length >= a.length) return [];
  const keep = lcsPairs(a, b);
  if (keep.length !== b.length) return []; // something was added or rewritten
  const kept = new Set(keep.map(([i]) => i));
  const toWord = new Map(lcsPairs(a, timelineWords.map(norm)));
  const out: number[] = [];
  a.forEach((_, i) => { if (!kept.has(i) && toWord.has(i)) out.push(toWord.get(i)!); });
  return out;
}
