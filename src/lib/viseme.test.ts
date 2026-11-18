import { describe, expect, it } from "vitest";
import { mouthShapeAt, visemeFrameAt, visemeTimeline, wordVisemes } from "./viseme";

describe("phoneme lip-sync", () => {
  it("maps digraphs and consonants to distinct speech mouth shapes", () => {
    expect(wordVisemes("she")).toEqual(["sibilant", "wide"]);
    expect(wordVisemes("mouth")).toEqual(["closed", "open", "pout", "tongue"]);
    expect(wordVisemes("cat")).toEqual(["tongue-up", "open", "tongue-up"]);
  });

  it("places shapes inside real word timings and closes between words", () => {
    const frames = visemeTimeline([
      { w: "she", s: 0.2, e: 0.8 },
      { w: "mouth", s: 1.4, e: 2.2 },
    ]);
    expect(frames[0]?.start).toBe(0.2);
    expect(frames.at(-1)?.end).toBe(2.2);
    expect(visemeFrameAt(frames, 1)?.viseme).toBeUndefined();
    expect(mouthShapeAt(frames, 1).open).toBe(0);
    expect(mouthShapeAt(frames, 1).closed).toBe(1);
  });

  it("uses different geometry for open vowels, rounded vowels and closed lips", () => {
    const frames = visemeTimeline([{ w: "ma", s: 0, e: 1 }]);
    const closed = mouthShapeAt(frames, 0.15);
    const open = mouthShapeAt(frames, 0.8);
    expect(closed.open).toBeLessThan(0.2);
    expect(open.open).toBeGreaterThan(0.8);
    const rounded = visemeTimeline([{ w: "you", s: 0, e: 1 }]);
    expect(mouthShapeAt(rounded, 0.9).round).toBeGreaterThan(0.8);
  });

  it("does not use audio energy and handles empty or invalid timings safely", () => {
    expect(visemeTimeline([])).toEqual([]);
    expect(visemeTimeline([{ w: "test", s: 1, e: 1 }])).toEqual([]);
    expect(mouthShapeAt([], 10)).toMatchObject({ open: 0, closed: 1 });
  });
});
