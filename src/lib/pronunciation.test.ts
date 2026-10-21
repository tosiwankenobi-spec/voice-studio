import { describe, expect, it } from "vitest";
import { applyPronunciations, pronunciationSuggestions } from "./pronunciation";
describe("pronunciations", () => {
  it("matches whole terms case insensitively without changing substrings", () =>
    expect(
      applyPronunciations("ACME, Acme! Acmeology.", [{ term: "Acme", say_as: "ack mee" }]),
    ).toBe("ack mee, ack mee! Acmeology."));
  it("prefers longer terms without cascading replacements", () =>
    expect(
      applyPronunciations("New York and York", [
        { term: "York", say_as: "york" },
        { term: "New York", say_as: "York" },
      ]),
    ).toBe("York and york"));
  it("escapes special characters and respects Unicode word boundaries", () =>
    expect(
      applyPronunciations("C++ caféC++ C++!", [{ term: "C++", say_as: "see plus plus" }]),
    ).toBe("see plus plus caféC++ see plus plus!"));
  it("suggests unfamiliar capitalized terms but excludes saved entries", () =>
    expect(
      pronunciationSuggestions("Welcome to Vocalis in Regina", [
        { term: "Vocalis", say_as: "vo cal is" },
      ]),
    ).toEqual(["Regina"]));
});
