import { expect, it } from "vitest";
import { splitNarration } from "./avatar";
it("splits unlimited narration into provider-safe chunks without losing text", () => {
  const text = Array(3000).fill("Vocalis").join(" ");
  const chunks = splitNarration(text);
  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks.every((c) => c.length <= 4500)).toBe(true);
  expect(chunks.join(" ")).toBe(text);
});
