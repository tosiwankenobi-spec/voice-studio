import { lcsPairs, isPureDeletion, type Segment, type Word } from './audio';

const normalize = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
/** Keep transcript identity and punctuation even when AI timings omit words or overshoot the file. */
export function alignTranscriptWords(text: string, timed: Word[], duration: number): Word[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!timed.length || !tokens.length || duration <= 0) return [];
  const scale = Math.min(1, duration / Math.max(duration, ...timed.map(w => w.e)));
  const matches = new Map(lcsPairs(tokens.map(normalize), timed.map(w => normalize(w.w))));
  const result: (Word | undefined)[] = tokens.map((w, i) => {
    const k = matches.get(i), source = k === undefined ? undefined : timed[k];
    return source ? { w, s: Math.max(0, source.s * scale), e: Math.min(duration, source.e * scale) } : undefined;
  });
  let index = 0;
  while (index < tokens.length) {
    if (result[index]) { index++; continue; }
    const startIndex = index;
    while (index < tokens.length && !result[index]) index++;
    const start = result[startIndex - 1]?.e ?? 0;
    const end = result[index]?.s ?? duration;
    for (let k = startIndex; k < index; k++) result[k] = { w: tokens[k] ?? '', s: start + (end - start) * (k - startIndex) / (index - startIndex), e: start + (end - start) * (k - startIndex + 1) / (index - startIndex) };
  }
  return result.filter((w): w is Word => !!w);
}
export function changedSpan(before: string, after: string) {
  const a = before.trim().split(/\s+/).filter(Boolean);
  const b = after.trim().split(/\s+/).filter(Boolean);
  if (!b.length || isPureDeletion(before, after)) return null;
  const pairs = lcsPairs(a.map(normalize), b.map(normalize));
  let left = 0;
  while (pairs.some(([i, j]) => i === left && j === left)) left++;
  let oldEnd = a.length, newEnd = b.length;
  while (oldEnd > left && newEnd > left && pairs.some(([i, j]) => i === oldEnd - 1 && j === newEnd - 1)) { oldEnd--; newEnd--; }
  const oldStart = Math.max(0, left - 1), newStart = Math.max(0, left - 1);
  oldEnd = Math.min(a.length, oldEnd + 1);
  newEnd = Math.min(b.length, newEnd + 1);
  return { oldStart, oldEnd, newStart, newEnd, phrase: b.slice(newStart, newEnd).join(' ') };
}

/** Map the contextual word span to timeline time, refining source-time gap cuts. */
export function patchRange(segs: Segment[], words: Word[], from: number, to: number, refine: (time: number) => number) {
  const placed: { word: Word; start: number; end: number; sourceStart: number; sourceEnd: number; offset: number }[] = [];
  let at = 0;
  for (const seg of segs) {
    for (const word of words) if ((word.s + word.e) / 2 >= seg.start && (word.s + word.e) / 2 < seg.end)
      placed.push({ word, start: at + Math.max(0, word.s - seg.start), end: at + Math.min(seg.end - seg.start, word.e - seg.start), sourceStart: seg.start, sourceEnd: seg.end, offset: at - seg.start });
    at += seg.end - seg.start;
  }
  const first = placed[from], last = placed[to - 1];
  if (!first || !last) throw new Error('Word timings are not ready for this patch.');
  const prev = placed[from - 1], next = placed[to];
  const startGuess = prev ? (prev.end + first.start) / 2 : first.start;
  const endGuess = next ? (last.end + next.start) / 2 : last.end;
  const start = Math.max(first.sourceStart + first.offset, Math.min(first.start, refine(startGuess - first.offset) + first.offset));
  const end = Math.min(last.sourceEnd + last.offset, Math.max(last.end, refine(endGuess - last.offset) + last.offset));
  if (!(end > start)) throw new Error('This word range is no longer on the timeline.');
  return { start, end };
}

export function sliceTimeline(segs: Segment[], start: number, end: number): Segment[] {
  let at = 0;
  return segs.flatMap(seg => {
    const a = Math.max(start, at), b = Math.min(end, at + seg.end - seg.start);
    const part = b > a ? [{ ...seg, id: crypto.randomUUID(), start: seg.start + a - at, end: seg.start + b - at }] : [];
    at += seg.end - seg.start;
    return part;
  });
}

export const CROSSFADE_SECONDS = 0.015;
export const NEIGHBOUR_SECONDS = 2;
export function rms(samples: Float32Array) {
  return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / Math.max(1, samples.length));
}
export function trimSilence(channels: Float32Array[], sampleRate: number) {
  const length = channels[0]?.length ?? 0;
  const peak = channels.reduce((p, c) => c.reduce((v, x) => Math.max(v, Math.abs(x)), p), 0);
  if (peak < 0.0001) throw new Error('The generated patch was silent.');
  const threshold = Math.max(0.0001, peak * 0.015);
  const window = Math.max(1, Math.round(sampleRate * 0.01));
  let start = 0, end = length;
  const active = (a: number, b: number) => channels.some(c => rms(c.subarray(a, b)) > threshold);
  while (start + window < end && !active(start, start + window)) start += window;
  while (end - window > start && !active(end - window, end)) end -= window;
  return { start, end, channels: channels.map(c => c.slice(start, end)) };
}

/** The returned patch overlaps 15ms of retained audio on both sides; no doubled context words. */
export function matchPatch(original: Float32Array[], patch: Float32Array[], sampleRate: number, start: number, end: number) {
  const trimmed = trimSilence(patch, sampleRate).channels;
  const n = trimmed[0]?.length ?? 0;
  const length = original[0]?.length ?? 0;
  const a = Math.round(start * sampleRate), b = Math.round(end * sampleRate);
  const neighbours = original.flatMap(c => [...c.subarray(Math.max(0, a - NEIGHBOUR_SECONDS * sampleRate), a), ...c.subarray(b, Math.min(length, b + NEIGHBOUR_SECONDS * sampleRate))]);
  const target = rms(Float32Array.from(neighbours));
  const level = Math.sqrt(trimmed.reduce((sum, c) => sum + rms(c) ** 2, 0) / trimmed.length);
  const gain = target > 0.00001 && level > 0 ? target / level : 1;
  const left = Math.min(Math.round(CROSSFADE_SECONDS * sampleRate), a, Math.floor(n / 2));
  const right = Math.min(Math.round(CROSSFADE_SECONDS * sampleRate), length - b, Math.floor(n / 2));
  let peak = 0;
  const channels = original.map((source, ch) => {
    const data = trimmed[Math.min(ch, trimmed.length - 1)];
    const out = Float32Array.from(data ?? [], x => x * gain);
    for (let i = 0; i < left; i++) { const mix = left > 1 ? i / (left - 1) : 1; out[i] = (source[a - left + i] ?? 0) * (1 - mix) + (out[i] ?? 0) * mix; }
    for (let i = 0; i < right; i++) { const mix = right > 1 ? i / (right - 1) : 1; const k = n - right + i; out[k] = (out[k] ?? 0) * (1 - mix) + (source[b + i] ?? 0) * mix; }
    for (const x of out) peak = Math.max(peak, Math.abs(x));
    return out;
  });
  if (peak > 1) channels.forEach(c => c.forEach((x, i) => { c[i] = x / peak; }));
  return { channels, gain, start: (a - left) / sampleRate, end: (b + right) / sampleRate };
}