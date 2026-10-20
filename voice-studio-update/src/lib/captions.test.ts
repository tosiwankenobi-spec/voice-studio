import { describe, expect, it } from "vitest";
import { buildCues, cueAt, estimateWordTimes, toSrt, wrapLines } from "./captions";

describe("captions", () => {
  it("spreads estimated word times across the clip in order", () => {
    const w = estimateWordTimes("Hello there, friend. How are you?", 3, 10);
    expect(w).toHaveLength(6);
    expect(w[0]!.s).toBeGreaterThanOrEqual(10);
    expect(w[5]!.e).toBeLessThanOrEqual(13);
    for (let i = 1; i < w.length; i++) expect(w[i]!.s).toBeGreaterThanOrEqual(w[i - 1]!.e - 1e-9);
    expect(estimateWordTimes("", 3)).toEqual([]);
  });
  it("breaks cues at sentence ends and style limits", () => {
    const words = estimateWordTimes("One two three four five six. Seven eight.", 4);
    const karaoke = buildCues(words, "karaoke");
    expect(karaoke.map((c) => c.text)).toEqual(["One two three four", "five six.", "Seven eight."]);
    expect(buildCues(words, "bold").every((c) => c.words.length <= 3)).toBe(true);
    expect(buildCues(words, "subtitle").map((c) => c.text)).toEqual([
      "One two three four five six.",
      "Seven eight.",
    ]);
    expect(buildCues(words, "none")).toEqual([]);
  });
  it("holds a cue briefly so captions don't flicker between words", () => {
    const cues = buildCues(estimateWordTimes("Hi. There.", 2), "karaoke");
    expect(cues[0]!.e).toBeGreaterThan(cues[0]!.words[0]!.e);
    expect(cueAt(cues, cues[1]!.s + 0.01)?.text).toBe("There.");
  });
  it("wraps lines and writes valid SRT", () => {
    expect(wrapLines("a b c d e f g h", 5)).toEqual(["a b c", "d e f g h"]);
    expect(
      toSrt([
        { text: "Hello world", s: 0, e: 1.5 },
        { text: "Again", s: 61.25, e: 62 },
      ]),
    ).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nHello world\n\n2\n00:01:01,250 --> 00:01:02,000\nAgain\n",
    );
  });
});
