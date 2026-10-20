import { describe, expect, it } from "vitest";
import { consentMatches, consentSentence } from "./studio-validation";
import { cleanBrand, contrastText } from "./brand";

describe("spoken voice consent", () => {
  it("accepts a faithful reading even when the name is misheard", () => {
    expect(consentMatches(consentSentence("Jeff Tuttosi"), "Jeff Tuttosi")).toBe(true);
    expect(
      consentMatches(
        "I Jeff Tutosee confirm this is my voice and I consent to vocalists creating a digital copy of it",
        "Jeff Tuttosi",
      ),
    ).toBe(true);
  });
  it("rejects unrelated speech or missing key words", () => {
    expect(consentMatches("Hello, this is a test of the microphone.", "Jeff")).toBe(false);
    expect(
      consentMatches(
        "I Jeff confirm this is my voice and I agree to Vocalis creating a digital version of it",
        "Jeff",
      ),
    ).toBe(false);
  });
});

describe("brand kit", () => {
  it("keeps only safe values", () => {
    const k = cleanBrand({
      primary: "red",
      secondary: "#00ff00",
      font: "Comic Sans" as never,
      introText: "x".repeat(200),
    });
    expect(k.primary).toBe("#f5a524");
    expect(k.secondary).toBe("#00ff00");
    expect(k.font).toBe("Syne");
    expect(k.introText).toHaveLength(80);
  });
  it("picks readable text colours", () => {
    expect(contrastText("#ffffff")).toBe("#111111");
    expect(contrastText("#1a1410")).toBe("#ffffff");
  });
});
