import { describe, expect, it } from "vitest";
import {
  defaultCast,
  gapAfter,
  parseDialogue,
  speakerLabel,
  speakerTurns,
  speakersOf,
} from "./dialogue";
import { fitSpeed, paceFor } from "./dub";

describe("multi-voice scripts", () => {
  it("parses NAME: and [Name] tags, continuing untagged lines", () => {
    const lines = parseDialogue(
      "Welcome to the show.\nHOST: Hi everyone!\n[Sam] Thanks for having me.\nIt's great to be here.\nhost: Let's begin.",
    );
    expect(lines).toEqual([
      { speaker: "Narrator", text: "Welcome to the show." },
      { speaker: "Host", text: "Hi everyone!" },
      { speaker: "Sam", text: "Thanks for having me." },
      { speaker: "Sam", text: "It's great to be here." },
      { speaker: "Host", text: "Let's begin." },
    ]);
    expect(speakersOf(lines)).toEqual(["Narrator", "Host", "Sam"]);
  });
  it("does not treat URLs, notes or long phrases as speakers", () => {
    const lines = parseDialogue(
      "Visit https://example.com today.\nNote: this is a note.\nThe thing I want to say is this: hello",
    );
    expect(speakersOf(lines)).toEqual(["Narrator"]);
  });
  it("puts a tag on its own line together with the next line", () => {
    expect(parseDialogue("GUEST:\nHello there")).toEqual([
      { speaker: "Guest", text: "Hello there" },
    ]);
  });
  it("casts different voices and pauses longer between speakers", () => {
    expect(defaultCast(["A", "B", "C"], ["Kore", "Puck"])).toEqual({
      A: "Kore",
      B: "Puck",
      C: "Kore",
    });
    const lines = parseDialogue("A: one\nA: two\nB: three");
    expect([gapAfter(lines, 0), gapAfter(lines, 1), gapAfter(lines, 2)]).toEqual([0.25, 0.45, 0]);
  });
  it("groups diarized words into speaker turns", () => {
    expect(
      speakerTurns([
        { w: "Hi", s: 0, e: 0.3, sp: "speaker_0" },
        { w: "there", s: 0.3, e: 0.6, sp: "speaker_0" },
        { w: "Hello", s: 1, e: 1.4, sp: "speaker_1" },
      ]),
    ).toEqual([
      { speaker: "speaker_0", text: "Hi there", s: 0, e: 0.6 },
      { speaker: "speaker_1", text: "Hello", s: 1, e: 1.4 },
    ]);
    expect(speakerLabel("speaker_1")).toBe("Speaker 2");
  });
});

describe("dub timing", () => {
  it("speeds up long dubs and slows short ones within ElevenLabs limits", () => {
    expect(fitSpeed(10, 10.5)).toBeNull();
    expect(fitSpeed(10, 11.5)).toBe(1.15);
    expect(fitSpeed(10, 20)).toBe(1.2);
    expect(fitSpeed(10, 5)).toBe(0.7);
    expect(fitSpeed(0, 5)).toBeNull();
    expect([paceFor(1.15), paceFor(1), paceFor(0.8)]).toEqual(["faster", "normal", "slower"]);
  });
});
