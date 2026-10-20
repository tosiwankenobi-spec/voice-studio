import { describe, expect, it } from "vitest";
import { tagWav } from "./ai-tag";

describe("AI voice tag", () => {
  it("appends an INFO comment and fixes the RIFF size", async () => {
    const wav = new Uint8Array(20);
    wav.set(new TextEncoder().encode("RIFF"), 0);
    new DataView(wav.buffer).setUint32(4, 12, true);
    wav.set(new TextEncoder().encode("WAVEdata"), 8);
    const tagged = tagWav(wav);
    expect(tagged.length).toBeGreaterThan(wav.length);
    expect(new DataView(tagged.buffer).getUint32(4, true)).toBe(tagged.length - 8);
    expect(new TextDecoder().decode(tagged)).toContain("AI-generated voice");
  });
  it("leaves non-WAV data alone", () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(tagWav(mp3)).toBe(mp3);
  });
});
