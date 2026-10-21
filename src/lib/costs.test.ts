import { describe, expect, it } from "vitest";
import { costLabel, creditsFor, summarizeUsage, requestCredits, speechUnits } from "./costs";

it("rounds each batch request separately, just like the recorded usage", () => {
  expect(requestCredits("tts", Array(20).fill(20))).toBe(20);
  expect(requestCredits("tts", [1001, 1])).toBe(3);
  expect(requestCredits("cloned_tts", [1001, 1])).toBe(5);
  expect(requestCredits("tts", [])).toBe(0);
  expect(requestCredits("tts_preview", [100, 100])).toBe(0);
  expect(speechUnits("Hello", "Warm")).toBe("Warm: Hello".length);
});

describe("credit costs", () => {
  it("prices by unit with a 1-credit minimum and free kinds", () => {
    expect(creditsFor("tts", 1)).toBe(1);
    expect(creditsFor("tts", 2500)).toBe(3);
    expect(creditsFor("cloned_tts", 1000)).toBe(3);
    expect(creditsFor("video", 8)).toBe(40);
    expect(creditsFor("tts_preview", 150)).toBe(0);
    expect(creditsFor("unknown", 5)).toBe(0);
    expect(creditsFor("image", 0)).toBe(0);
  });
  it("labels costs", () => {
    expect(costLabel(0)).toBe("Free");
    expect(costLabel(1)).toBe("≈ 1 credit");
    expect(costLabel(7)).toBe("≈ 7 credits");
  });
  it("summarises usage by kind and day", () => {
    const s = summarizeUsage([
      { kind: "image", units: 1, created_at: "2026-10-20T12:00:00" },
      { kind: "image", units: 1, created_at: "2026-10-20T13:00:00" },
      { kind: "tts", units: 500, created_at: "2026-10-21T09:00:00" },
    ]);
    expect(s.total).toBe(9);
    expect(s.byKind.get("image")).toEqual({ units: 2, credits: 8, count: 2 });
    expect([...s.byDay.entries()]).toEqual([
      ["2026-10-20", 8],
      ["2026-10-21", 1],
    ]);
  });
});
