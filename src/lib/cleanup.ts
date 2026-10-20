import { type Word, type Segment, wordsOnTimeline, totalLength } from './audio';
export const CLEANUP_DEFAULTS = { threshold: 0.7, target: 0.35, noise: 'light' as const, loudness: -16 };
export const LOUDNESS_TARGETS = { YouTube: -14, Podcast: -16, 'Phone/voice note': -19 };
export type Filler = { id: string; indices: number[]; label: string; reason: string };
const normalized = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function detectFillers(words: Word[]): Filler[] {
  const out: Filler[] = [], used = new Set<number>();
  const add = (i: number, count: number, reason: string) => {
    const indices = Array.from({ length: count }, (_, k) => i + k);
    if (indices.some(k => used.has(k))) return;
    indices.forEach(k => used.add(k));
    out.push({ id: `${i}-${count}`, indices, label: words.slice(i, i + count).map(w => w.w).join(' '), reason });
  };
  words.forEach((w, i) => {
    const t = normalized(w.w), next = words[i + 1];
    if (['um', 'uh', 'er', 'ah', 'hmm'].includes(t)) add(i, 1, 'Filler');
    else if (next && ((t === 'you' && normalized(next.w) === 'know') || (t === 'i' && normalized(next.w) === 'mean')) && next.s - w.e < 0.5) add(i, 2, 'Filler phrase');
    else if (next && t && t === normalized(next.w) && next.s - w.e < 0.7) add(i, 1, 'Repeated word');
    else if (/[-–]$/.test(w.w) && next && normalized(next.w).startsWith(t) && next.s - w.e < 0.7) add(i, 1, 'False start');
  });
  return out;
}
export type PauseCut = { start: number; end: number; saved: number };
/** Gaps are found in placed timeline order, never across a removed/rearranged source range. */
export function pauseCuts(segs: Segment[], words: Word[], threshold = 0.7, target = 0.35, refine: (t: number, radius: number) => number = t => t): PauseCut[] {
  const placed = wordsOnTimeline(segs, words);
  const cuts: PauseCut[] = [];
  let cursor = 0;
  for (const seg of segs) {
    const inside = placed.filter(p => p.at >= cursor && p.at < cursor + seg.end - seg.start);
    for (let k = 1; k < inside.length; k++) {
      const left = words[inside[k - 1]?.i ?? -1], right = words[inside[k]?.i ?? -1];
      if (!left || !right) continue;
      const gap = right.s - left.e;
      if (gap <= threshold || gap <= target) continue;
      const a = left.e + target / 2, b = right.s - target / 2;
      const radius = Math.min(0.06, target / 4);
      const start = Math.max(left.e, Math.min(right.s, refine(a, radius)));
      // Preserve exact target length while refining the first cut to a quiet point.
      const end = Math.min(right.s, start + gap - target);
      if (end > start) cuts.push({ start, end, saved: end - start });
      void b;
    }
    cursor += seg.end - seg.start;
  }
  return cuts;
}
type Coeff = { b: number[]; a: number[] };
export function biquad(input: Float32Array, c: Coeff): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i] ?? 0;
    const y = (c.b[0] ?? 0) * x + (c.b[1] ?? 0) * x1 + (c.b[2] ?? 0) * x2 - (c.a[0] ?? 0) * y1 - (c.a[1] ?? 0) * y2;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}
export function kWeightingCoefficients(sr: number): { shelf: Coeff; highpass: Coeff } {
  const K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
  const d = 1 + K / Q + K * K;
  const H = Math.tan(Math.PI * 38.13547087602444 / sr), q = 0.5003270373238773, dh = 1 + H / q + H * H;
  return {
    shelf: { b: [(Vh + Vb * K / Q + K * K) / d, 2 * (K * K - Vh) / d, (Vh - Vb * K / Q + K * K) / d], a: [2 * (K * K - 1) / d, (1 - K / Q + K * K) / d] },
    highpass: { b: [1, -2, 1], a: [2 * (H * H - 1) / dh, (1 - H / q + H * H) / dh] },
  };
}
/** BS.1770 K-weighting, 400ms blocks, -70 LUFS absolute / -10 LU relative gating. Mono/stereo. */
export function integratedLoudness(channels: Float32Array[], sr: number): number {
  if (!channels.length || !channels[0]?.length) return -Infinity;
  const c = kWeightingCoefficients(sr);
  const weighted = channels.map(ch => biquad(biquad(ch, c.shelf), c.highpass));
  const n = channels[0].length, block = Math.min(n, Math.round(sr * 0.4)), step = Math.max(1, Math.round(sr * 0.1));
  const energy = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) energy[i + 1] = (energy[i] ?? 0) + weighted.reduce((sum, ch, k) => sum + (k === 3 ? 0 : k > 3 ? 1.41 : 1) * (ch[i] ?? 0) ** 2, 0);
  const blocks: number[] = [];
  for (let i = 0; i + block <= n; i += step) {
    const e = ((energy[i + block] ?? 0) - (energy[i] ?? 0)) / block;
    if (-0.691 + 10 * Math.log10(e) >= -70) blocks.push(e);
  }
  if (!blocks.length) return -Infinity;
  const mean = blocks.reduce((a, b) => a + b, 0) / blocks.length;
  const kept = blocks.filter(e => e >= mean / 10);
  return -0.691 + 10 * Math.log10(kept.reduce((a, b) => a + b, 0) / kept.length);
}
export function normalizeLoudness(channels: Float32Array[], sr: number, target: number) {
  const measured = integratedLoudness(channels, sr);
  if (!Number.isFinite(measured)) return channels.map(c => c.slice());
  const gain = Math.min(10 ** (24 / 20), 10 ** ((target - measured) / 20));
  const ceiling = 10 ** (-1 / 20);
  // Linked 5ms lookahead limiter with immediate attack and 80ms release.
  const n = channels[0]?.length ?? 0, look = Math.max(1, Math.round(sr * 0.005));
  const peak = new Float32Array(n);
  for (let i = 0; i < n; i++) peak[i] = Math.max(...channels.map(c => Math.abs(c[i] ?? 0))) * gain;
  const maxima = new Float32Array(n), queue: number[] = []; let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (head < queue.length && (queue[head] ?? 0) >= i + look) head++;
    while (queue.length > head && (peak[queue.at(-1) ?? 0] ?? 0) <= (peak[i] ?? 0)) queue.pop();
    queue.push(i); maxima[i] = peak[queue[head] ?? i] ?? 0;
  }
  const out = channels.map(c => new Float32Array(c.length)); let limiter = 1;
  const release = Math.exp(-1 / (sr * 0.08));
  for (let i = 0; i < n; i++) {
    const desired = Math.min(1, ceiling / Math.max(1e-9, maxima[i] ?? 0));
    limiter = desired < limiter ? desired : desired + release * (limiter - desired);
    channels.forEach((ch, k) => { const dst = out[k]; if (dst) dst[i] = Math.max(-ceiling, Math.min(ceiling, (ch[i] ?? 0) * gain * limiter)); });
  }
  return out;
}
export function reduceNoise(channels: Float32Array[], sr: number, level: 'off' | 'light' | 'strong') {
  if (level === 'off') return channels.map(c => c.slice());
  const K = Math.tan(Math.PI * 80 / sr), q = Math.SQRT1_2, d = 1 + K / q + K * K;
  const hp = { b: [1 / d, -2 / d, 1 / d], a: [2 * (K * K - 1) / d, (1 - K / q + K * K) / d] };
  const filtered = channels.map(c => biquad(c, hp));
  const n = filtered[0]?.length ?? 0, window = Math.min(n, Math.round(sr * 0.5));
  if (!window) return filtered;
  const energy = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) energy[i + 1] = (energy[i] ?? 0) + filtered.reduce((s, ch) => s + (ch[i] ?? 0) ** 2 / filtered.length, 0);
  let floor = Infinity;
  for (let i = 0; i + window <= n; i += Math.max(1, Math.round(sr * 0.01))) floor = Math.min(floor, ((energy[i + window] ?? 0) - (energy[i] ?? 0)) / window);
  const threshold = Math.max(1e-6, Math.sqrt(floor) * (level === 'light' ? 2 : 3));
  const minGain = level === 'light' ? 0.35 : 0.1, out = filtered.map(c => new Float32Array(c.length));
  let gain = 1;
  const frame = Math.round(sr * 0.02), attack = Math.exp(-1 / (sr * 0.003)), release = Math.exp(-1 / (sr * 0.12));
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + frame);
    const rms = Math.sqrt(((energy[end] ?? 0) - (energy[i] ?? 0)) / Math.max(1, end - i));
    const desired = Math.min(1, Math.max(minGain, (rms / threshold) ** 2));
    const smooth = desired > gain ? attack : release;
    gain = desired + smooth * (gain - desired);
    filtered.forEach((ch, k) => { const dst = out[k]; if (dst) dst[i] = (ch[i] ?? 0) * gain; });
  }
  return out;
}
export function placedCleanupWords(segs: Segment[], words: Word[]) {
  return wordsOnTimeline(segs, words).map(p => ({ ...(words[p.i] ?? { w: '', s: 0, e: 0 }), s: p.at, e: Math.min(totalLength(segs), p.at + Math.max(0, (words[p.i]?.e ?? 0) - (words[p.i]?.s ?? 0))) }));
}