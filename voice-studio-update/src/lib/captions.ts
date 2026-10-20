/** Caption timing and layout helpers. Timings are in seconds. */
export type TimedWord = { w: string; s: number; e: number };
export type CaptionStyle = "none" | "karaoke" | "subtitle" | "bold";
export type Cue = { text: string; s: number; e: number; words: TimedWord[] };

export const CAPTION_STYLES: { value: CaptionStyle; label: string }[] = [
  { value: "none", label: "No captions" },
  { value: "karaoke", label: "Word-by-word highlight" },
  { value: "subtitle", label: "Two-line subtitles" },
  { value: "bold", label: "Big bold centre" },
];

/**
 * Estimates when each word is spoken inside a clip of `seconds`, weighting by word length and
 * adding small pauses after punctuation. Used when the TTS provider gives no word timings.
 */
export function estimateWordTimes(text: string, seconds: number, offset = 0): TimedWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || !(seconds > 0)) return [];
  const weight = (w: string) =>
    Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length) +
    (/[.!?]$/.test(w) ? 4 : /[,;:—-]$/.test(w) ? 2 : 0);
  const total = words.reduce((a, w) => a + weight(w), 0);
  const lead = Math.min(0.15, seconds * 0.03); // TTS clips usually start with a short breath
  const span = Math.max(0.01, seconds - lead * 2);
  let t = offset + lead;
  return words.map((w) => {
    const d = (weight(w) / total) * span;
    const pause = /[.!?]$/.test(w)
      ? (4 / weight(w)) * d
      : /[,;:]$/.test(w)
        ? (2 / weight(w)) * d
        : 0;
    const out = { w, s: t, e: t + d - pause };
    t += d;
    return out;
  });
}

const limits: Record<Exclude<CaptionStyle, "none">, { words: number; chars: number }> = {
  karaoke: { words: 4, chars: 26 },
  subtitle: { words: 14, chars: 80 },
  bold: { words: 3, chars: 18 },
};

/** Groups timed words into on-screen cues, breaking at sentence ends and size limits. */
export function buildCues(words: TimedWord[], style: CaptionStyle): Cue[] {
  if (style === "none" || !words.length) return [];
  const lim = limits[style];
  const cues: Cue[] = [];
  let cur: TimedWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({
      text: cur.map((w) => w.w).join(" "),
      s: cur[0]!.s,
      e: cur[cur.length - 1]!.e,
      words: cur,
    });
    cur = [];
  };
  for (const w of words) {
    const len = cur.map((x) => x.w).join(" ").length + w.w.length + 1;
    if (cur.length && (cur.length >= lim.words || len > lim.chars)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.w)) flush();
  }
  flush();
  // Hold each cue until the next starts so captions don't flicker off between words.
  for (let i = 0; i < cues.length - 1; i++)
    cues[i]!.e = Math.max(cues[i]!.e, Math.min(cues[i + 1]!.s, cues[i]!.e + 0.6));
  return cues;
}

/** Splits text into at most `maxLines` lines of roughly `maxChars`, balancing line lengths. */
export function wrapLines(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > maxChars && lines.length < maxLines - 1) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

const srtTime = (t: number) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

/** SubRip (.srt) text for a list of cues. */
export function toSrt(cues: { text: string; s: number; e: number }[]) {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(c.s)} --> ${srtTime(Math.max(c.e, c.s + 0.3))}\n${wrapLines(c.text, 42).join("\n")}\n`,
    )
    .join("\n");
}

/** Cue visible at time t (or null). */
export function cueAt(cues: Cue[], t: number) {
  return cues.find((c) => t >= c.s && t < c.e) ?? null;
}
