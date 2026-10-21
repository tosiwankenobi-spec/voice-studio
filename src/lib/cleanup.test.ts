import { describe, expect, it } from "vitest";
import {
  CLEANUP_DEFAULTS,
  LOUDNESS_TARGETS,
  detectFillers,
  pauseCuts,
  integratedLoudness,
  normalizeLoudness,
  kWeightingCoefficients,
  reduceNoise,
} from "./cleanup";
const sine = (amp = 0.1, freq = 1000, seconds = 2, sr = 48000) =>
  Float32Array.from(
    { length: sr * seconds },
    (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / sr),
  );
describe("cleanup rules", () => {
  it("defaults to 0.7s gaps shortened to 0.35s, light noise and -16 LUFS", () =>
    expect(CLEANUP_DEFAULTS).toEqual({
      threshold: 0.7,
      target: 0.35,
      noise: "light",
      loudness: -16,
    }));
  it("saves 0.65s from a one-second pause, preserving word edges", () => {
    const cuts = pauseCuts(
      [{ id: "a", start: 0, end: 3 }],
      [
        { w: "hi", s: 0, e: 1 },
        { w: "there", s: 2, e: 3 },
      ],
    );
    expect(cuts[0]?.saved).toBeCloseTo(0.65);
    expect(cuts[0]?.start).toBeCloseTo(1.175);
    expect(cuts[0]?.end).toBeCloseTo(1.825);
  });
  it("does not cut across rearranged segments or gaps at threshold", () =>
    expect(
      pauseCuts(
        [
          { id: "a", start: 0, end: 1 },
          { id: "b", start: 2, end: 3 },
        ],
        [
          { w: "hi", s: 0, e: 0.8 },
          { w: "there", s: 2, e: 3 },
        ],
      ),
    ).toEqual([]));
  it("finds all filler types, repeats and marked false starts", () => {
    const texts = [
      "um",
      "uh",
      "er",
      "ah",
      "hmm",
      "you",
      "know",
      "I",
      "mean",
      "the",
      "the",
      "sta-",
      "start",
    ];
    const fillers = detectFillers(texts.map((w, i) => ({ w, s: i * 0.2, e: i * 0.2 + 0.15 })));
    expect(fillers.map((f) => f.label)).toEqual([
      "um",
      "uh",
      "er",
      "ah",
      "hmm",
      "you know",
      "I mean",
      "the",
      "sta-",
    ]);
  });
  it("uses requested loudness values", () =>
    expect(LOUDNESS_TARGETS).toEqual({ YouTube: -14, Podcast: -16, "Phone/voice note": -19 }));
});
describe("loudness and gate", () => {
  it("matches the 48kHz BS.1770 reference shelf coefficients", () => {
    const c = kWeightingCoefficients(48000);
    expect(c.shelf.b[0]).toBeCloseTo(1.53512485958697, 10);
    expect(c.highpass.a[0]).toBeCloseTo(-1.99004745483398, 10);
  });
  it("measures a -20dBFS 1kHz mono sine near -23 LUFS and stereo 3LU louder", () => {
    const ch = sine();
    expect(integratedLoudness([ch], 48000)).toBeCloseTo(-23.0, 1);
    expect(integratedLoudness([ch, ch], 48000) - integratedLoudness([ch], 48000)).toBeCloseTo(
      3.0103,
      3,
    );
  });
  it("normalizes to each target without exceeding -1dBFS", () => {
    for (const target of [-14, -16, -19]) {
      const out = normalizeLoudness([sine()], 48000, target);
      expect(integratedLoudness(out, 48000)).toBeCloseTo(target, 1);
      expect(out[0]?.every((v) => Math.abs(v) <= 10 ** (-1 / 20) + 1e-6)).toBe(true);
    }
  });
  it("gates silence out of integrated measurement", () => {
    const ch = sine(),
      padded = new Float32Array(ch.length * 2);
    padded.set(ch);
    expect(integratedLoudness([padded], 48000)).toBeGreaterThan(-24);
    expect(integratedLoudness([new Float32Array(48000)], 48000)).toBe(-Infinity);
  });
  it("strong noise reduction attenuates a steady low floor and off leaves audio unchanged", () => {
    const ch = sine(0.001, 200);
    const out = reduceNoise([ch], 48000, "strong")[0];
    expect(out?.at(-100)).not.toBe(ch.at(-100));
    expect(reduceNoise([ch], 48000, "off")[0]).toEqual(ch);
  });
});
