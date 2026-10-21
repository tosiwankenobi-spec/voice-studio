import { expect, it } from "vitest";
import { mouthLevel, splitNarration } from "./avatar";
it("keeps the mouth closed during silence and opens for speech energy", () => {
  expect(mouthLevel(new Float32Array(4800), 48000, 0)).toBe(0);
  expect(mouthLevel(new Float32Array(4800).fill(0.1), 48000, 0)).toBeGreaterThan(0.8);
});
it("splits unlimited narration into provider-safe chunks without losing text", () => {
  const text = Array(3000).fill("Vocalis").join(" ");
  const chunks = splitNarration(text);
  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks.every((c) => c.length <= 4500)).toBe(true);
  expect(chunks.join(" ")).toBe(text);
});
