/** Multi-voice scripts: lines tagged with a speaker, e.g. `HOST: Hello` or `[Sam] Hi there`. */
export type DialogueLine = { speaker: string; text: string };

const TAG =
  /^\s*(?:\[([^\]\n]{1,40})\]\s*:?|([\p{L}\p{N}][\p{L}\p{N} _.'-]{0,39}?)\s*:(?!\/\/|\d))\s*(.*)$/u;
const NOT_SPEAKERS = new Set([
  "note",
  "notes",
  "http",
  "https",
  "ps",
  "p.s",
  "re",
  "eg",
  "ie",
  "example",
  "warning",
  "tip",
]);
export const NARRATOR = "Narrator";

function canonical(name: string) {
  const n = name.trim().replace(/\s+/g, " ");
  return n === n.toUpperCase() && /\p{L}/u.test(n) ? n.charAt(0) + n.slice(1).toLowerCase() : n;
}

/**
 * Parses a script into speaker lines. Untagged lines continue the previous speaker (or the
 * narrator if nobody has spoken yet). Speaker names are matched case-insensitively.
 */
export function parseDialogue(script: string): DialogueLine[] {
  const out: DialogueLine[] = [];
  const names = new Map<string, string>();
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = TAG.exec(line);
    const tag = m ? (m[1] ?? m[2] ?? "").trim() : "";
    if (m && tag && !NOT_SPEAKERS.has(tag.toLowerCase()) && tag.split(" ").length <= 3) {
      const key = tag.toLowerCase();
      if (!names.has(key)) names.set(key, canonical(tag));
      const text = (m[3] ?? "").trim();
      out.push({ speaker: names.get(key)!, text });
    } else if (out.length && out[out.length - 1]!.text === "") {
      out[out.length - 1]!.text = line;
    } else {
      const speaker = out.length ? out[out.length - 1]!.speaker : NARRATOR;
      out.push({ speaker, text: line });
    }
  }
  return out.filter((l) => l.text);
}

/** Speakers in order of first appearance. */
export function speakersOf(lines: DialogueLine[]) {
  return [...new Set(lines.map((l) => l.speaker))];
}

/** Default voices for each speaker, cycling through the given list so neighbours differ. */
export function defaultCast(speakers: string[], voices: readonly string[]) {
  return Object.fromEntries(speakers.map((s, i) => [s, voices[i % voices.length]!]));
}

/** Pause after a line: a little longer when the speaker changes. */
export function gapAfter(lines: DialogueLine[], i: number) {
  const next = lines[i + 1];
  if (!next) return 0;
  return next.speaker === lines[i]!.speaker ? 0.25 : 0.45;
}

/** Groups consecutive diarized words into speaker turns. */
export function speakerTurns(words: { w: string; s: number; e: number; sp?: string }[]) {
  const turns: { speaker: string; text: string; s: number; e: number }[] = [];
  for (const w of words) {
    const sp = w.sp ?? "speaker_0";
    const last = turns[turns.length - 1];
    if (last && last.speaker === sp) {
      last.text += ` ${w.w}`;
      last.e = w.e;
    } else turns.push({ speaker: sp, text: w.w, s: w.s, e: w.e });
  }
  return turns;
}

/** "speaker_0" → "Speaker 1". */
export function speakerLabel(id: string) {
  const n = /(\d+)$/.exec(id)?.[1];
  return n !== undefined ? `Speaker ${Number(n) + 1}` : id;
}
