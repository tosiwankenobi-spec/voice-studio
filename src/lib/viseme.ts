import type { Word } from "./audio";

export const VISEME_SHAPES = {
  rest: { open: 0, width: 0.72, round: 0, teeth: 0, tongue: 0, closed: 1 },
  closed: { open: 0, width: 0.72, round: 0.2, teeth: 0, tongue: 0, closed: 1 },
  teeth: { open: 0.08, width: 0.82, round: 0, teeth: 1, tongue: 0, closed: 0 },
  tongue: { open: 0.18, width: 0.82, round: 0, teeth: 0.45, tongue: 1, closed: 0 },
  "tongue-up": { open: 0.12, width: 0.76, round: 0, teeth: 0.25, tongue: 0.7, closed: 0 },
  sibilant: { open: 0.1, width: 0.9, round: 0, teeth: 1, tongue: 0.15, closed: 0 },
  wide: { open: 0.22, width: 1.18, round: 0, teeth: 0.7, tongue: 0, closed: 0 },
  smile: { open: 0.46, width: 1.08, round: 0, teeth: 0.4, tongue: 0, closed: 0 },
  open: { open: 1, width: 0.9, round: 0.1, teeth: 0.1, tongue: 0.25, closed: 0 },
  round: { open: 0.58, width: 0.62, round: 1, teeth: 0.1, tongue: 0, closed: 0 },
  pout: { open: 0.3, width: 0.5, round: 1, teeth: 0, tongue: 0, closed: 0 },
  r: { open: 0.26, width: 0.66, round: 0.75, teeth: 0.1, tongue: 0.35, closed: 0 },
} as const;
export type Viseme = keyof typeof VISEME_SHAPES;
export type MouthShape = {
  open: number;
  width: number;
  round: number;
  teeth: number;
  tongue: number;
  closed: number;
};
export type VisemeFrame = {
  id: string;
  viseme: Exclude<Viseme, "rest">;
  start: number;
  end: number;
  word: string;
};

const COMMON: Record<string, Exclude<Viseme, "rest">[]> = {
  a: ["smile"],
  i: ["wide"],
  me: ["closed", "wide"],
  he: ["open", "wide"],
  she: ["sibilant", "wide"],
  we: ["pout", "wide"],
  you: ["wide", "pout"],
  your: ["wide", "round", "r"],
  to: ["tongue-up", "pout"],
  too: ["tongue-up", "pout"],
  two: ["tongue-up", "pout"],
  the: ["tongue", "smile"],
  this: ["tongue", "wide", "sibilant"],
  that: ["tongue", "open", "tongue-up"],
  through: ["tongue", "r", "pout"],
  though: ["tongue", "round"],
  thought: ["tongue", "round", "tongue-up"],
  people: ["closed", "wide", "closed", "tongue-up"],
};

/** A compact English grapheme-to-viseme pass. Timing comes from the recording, never its volume. */
export function wordVisemes(word: string): Exclude<Viseme, "rest">[] {
  const text = word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
  if (!text) return [];
  if (COMMON[text]) return COMMON[text];
  const out: Exclude<Viseme, "rest">[] = [];
  for (let i = 0; i < text.length; i++) {
    const rest = text.slice(i);
    const three = rest.slice(0, 3);
    const two = rest.slice(0, 2);
    const c = text[i];
    if (three === "tch") {
      out.push("sibilant");
      i += 2;
    } else if (["sch", "shr"].includes(three)) {
      out.push("sibilant");
      if (three === "shr") out.push("r");
      i += 2;
    } else if (["ch", "sh", "zh"].includes(two)) {
      out.push("sibilant");
      i++;
    } else if (two === "th") {
      out.push("tongue");
      i++;
    } else if (two === "ph") {
      out.push("teeth");
      i++;
    } else if (["ee", "ea", "ie"].includes(two)) {
      out.push("wide");
      i++;
    } else if (["oo", "ue", "ew", "ui"].includes(two)) {
      out.push("pout");
      i++;
    } else if (["ow", "ou"].includes(two)) {
      out.push("open", "pout");
      i++;
    } else if (["oi", "oy"].includes(two)) {
      out.push("round", "wide");
      i++;
    } else if (["ai", "ay", "ei", "ey"].includes(two)) {
      out.push("smile", "wide");
      i++;
    } else if (two === "ng") {
      out.push("tongue-up");
      i++;
    } else if (two === "qu") {
      out.push("tongue-up", "pout");
      i++;
    } else if (c === "e" && i === text.length - 1 && text.length > 3) {
      continue;
    } else if (c && "mbp".includes(c)) out.push("closed");
    else if (c && "fv".includes(c)) out.push("teeth");
    else if (c && "szj".includes(c)) out.push("sibilant");
    else if (c && "tdnlgkx".includes(c)) out.push("tongue-up");
    else if (c === "c") out.push(/[eiy]/.test(text[i + 1] ?? "") ? "sibilant" : "tongue-up");
    else if (c === "r") out.push("r");
    else if (c === "w") out.push("pout");
    else if (c === "y") out.push("wide");
    else if (c === "h") out.push("open");
    else if (c === "a" || c === "u") out.push("open");
    else if (c === "e" || c === "i") out.push(c === "e" ? "smile" : "wide");
    else if (c === "o") out.push("round");
  }
  return out.length ? out : ["open"];
}

const weight = (v: Viseme) =>
  ["open", "round", "pout"].includes(v) ? 1.25 : ["wide", "smile"].includes(v) ? 1 : 0.65;

/** Place every speech-sound shape inside its transcribed word's actual audio timing. */
export function visemeTimeline(words: Word[]): VisemeFrame[] {
  const frames: VisemeFrame[] = [];
  words.forEach((word, wordIndex) => {
    if (!Number.isFinite(word.s) || !Number.isFinite(word.e) || word.e <= word.s) return;
    const visemes = wordVisemes(word.w);
    const total = visemes.reduce((sum, v) => sum + weight(v), 0);
    let at = word.s;
    visemes.forEach((viseme, index) => {
      const end =
        index === visemes.length - 1 ? word.e : at + ((word.e - word.s) * weight(viseme)) / total;
      frames.push({ id: `${wordIndex}-${index}-${viseme}`, viseme, start: at, end, word: word.w });
      at = end;
    });
  });
  return frames;
}

function visemeIndexAt(frames: VisemeFrame[], time: number) {
  let low = 0,
    high = frames.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const frame = frames[mid];
    if (!frame) return -1;
    if (time < frame.start) high = mid - 1;
    else if (time >= frame.end) low = mid + 1;
    else return mid;
  }
  return -1;
}
export function visemeFrameAt(frames: VisemeFrame[], time: number) {
  return frames[visemeIndexAt(frames, time)] ?? null;
}

const mix = (a: MouthShape, b: MouthShape, t: number): MouthShape => ({
  open: a.open + (b.open - a.open) * t,
  width: a.width + (b.width - a.width) * t,
  round: a.round + (b.round - a.round) * t,
  teeth: a.teeth + (b.teeth - a.teeth) * t,
  tongue: a.tongue + (b.tongue - a.tongue) * t,
  closed: a.closed + (b.closed - a.closed) * t,
});

/** Blend 35ms at shape changes for coarticulation; silence always returns to closed lips. */
export function mouthShapeAt(frames: VisemeFrame[], time: number): MouthShape {
  const index = visemeIndexAt(frames, time);
  const frame = frames[index];
  if (!frame) return { ...VISEME_SHAPES.rest };
  const current: MouthShape = { ...VISEME_SHAPES[frame.viseme] };
  const blend = Math.min(0.035, (frame.end - frame.start) / 3);
  const previous = frames[index - 1];
  const next = frames[index + 1];
  if (previous && time - frame.start < blend)
    return mix(
      { ...VISEME_SHAPES[previous.viseme] },
      current,
      (time - frame.start) / (2 * blend) + 0.5,
    );
  if (next && frame.end - time < blend)
    return mix(
      current,
      { ...VISEME_SHAPES[next.viseme] },
      (blend - (frame.end - time)) / (2 * blend) + 0.5,
    );
  return current;
}
