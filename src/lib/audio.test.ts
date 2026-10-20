import { describe, expect, it } from "vitest";
import { locate, move, splitAt, totalLength, type Segment } from "./audio";

let n = 0;
const id = () => `s${n++}`;
const base: Segment[] = [
  { id: "a", start: 0, end: 4 },
  { id: "b", start: 10, end: 12 },
];

describe("timeline edits", () => {
  it('keeps patch identity after splitting or cutting a patched region', () => {
    const patch = [{ id: 'patch', start: 0, end: 4, patchId: 'p1' }];
    expect(splitAt(patch, 2, id).map(s => s.patchId)).toEqual(['p1', 'p1']);
    expect(cutSource(patch, 1, 2, id).map(s => s.patchId)).toEqual(['p1', 'p1']);
  });
  it("splitting keeps total length and cuts at the playhead", () => {
    const out = splitAt(base, 1.5, id);
    expect(out).toHaveLength(3);
    expect(out[0]!.end).toBe(1.5);
    expect(out[1]!.start).toBe(1.5);
    expect(totalLength(out)).toBe(6);
  });
  it("splitting inside a later segment maps to source time", () => {
    const out = splitAt(base, 5, id);
    expect(out[1]).toMatchObject({ start: 10, end: 11 });
    expect(out[2]).toMatchObject({ start: 11, end: 12 });
  });
  it("rearranging moves a segment", () => {
    expect(move(base, 1, 0).map((s) => s.id)).toEqual(["b", "a"]);
  });
  it("locates timeline time after a reorder", () => {
    expect(locate(move(base, 1, 0), 3)).toMatchObject({ index: 1, offset: 1 });
  });
});

import { cutSource, splitAtWord, wordsOnTimeline, wordRange, type Word } from "./audio";

const words: Word[] = [
  { w: "hello", s: 0.2, e: 0.6 },
  { w: "um", s: 1.0, e: 1.2 },
  { w: "world", s: 1.6, e: 2.0 },
];
const whole: Segment[] = [{ id: "w", start: 0, end: 3 }];

describe("word-aware edits", () => {
  it("split snaps to the nearest gap between words", () => {
    const out = splitAtWord(whole, 1.1, words, id); // inside "um", nearer the um|world gap? 1.1 → gaps at 0.8 and 1.4
    expect(out[0]!.end).toBe(1.4);
  });
  it("cutting a word removes exactly its gap-to-gap range", () => {
    const { a, b } = wordRange(words, 1);
    expect([a, b]).toEqual([0.8, 1.4]);
    const out = cutSource(whole, a, b, id);
    expect(out.map((s) => [s.start, s.end])).toEqual([[0, 0.8], [1.4, 3]]);
    expect(wordsOnTimeline(out, words).map((x) => words[x.i]!.w)).toEqual(["hello", "world"]);
  });
  it("words follow the timeline after rearranging", () => {
    const parts = splitAtWord(whole, 1.5, words, id);
    expect(wordsOnTimeline(move(parts, 1, 0), words).map((x) => words[x.i]!.w)).toEqual(["world", "hello", "um"]);
  });
});
