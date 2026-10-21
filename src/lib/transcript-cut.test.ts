import { describe, expect, it } from "vitest";
import { deletedTimelineWords } from "./audio";

const words = ["Hello", "there.", "Um,", "today", "we", "bake", "fresh", "bread."];
const text = "Hello there. Um, today we bake fresh bread.";

describe("deletedTimelineWords", () => {
  it("cuts a deleted word", () => {
    expect(deletedTimelineWords(text, "Hello there. Today we bake fresh bread.", words)).toEqual([
      2,
    ]);
  });
  it("cuts several deleted words", () => {
    expect(deletedTimelineWords(text, "Hello there. Today we bake bread.", words)).toEqual([2, 6]);
  });
  it("does not cut audio when a word is rewritten", () => {
    expect(deletedTimelineWords(text, "Hello there. Um, today we bake fresh cake.", words)).toEqual(
      [],
    );
  });
  it("does not cut audio when words are added", () => {
    expect(deletedTimelineWords(text, text + " Come visit.", words)).toEqual([]);
  });
});

describe("letter-by-letter deletion", () => {
  it("cuts the word once it is fully erased, compared with the last in-sync text", () => {
    expect(deletedTimelineWords(text, "Hello there. Um, today we bake fres bread.", words)).toEqual(
      [],
    );
    expect(deletedTimelineWords(text, "Hello there. Um, today we bake  bread.", words)).toEqual([
      6,
    ]);
  });
});
