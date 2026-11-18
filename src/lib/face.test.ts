import { describe, expect, it } from "vitest";
import {
  DEFAULT_FACE,
  FACE_COLORS,
  FACE_CONTROLS,
  faceMouthGeometry,
  normalizeFace,
  parseFace,
  randomFace,
  normalizePhotoFace,
  photoLayout,
  photoMouthGeometry,
  DEFAULT_PHOTO_FACE,
} from "./face";
import { VISEME_SHAPES } from "./viseme";

describe("face editor model", () => {
  it("clamps shape controls and fills missing values", () => {
    const face = normalizeFace({ faceWidth: 900, mouthHeight: -20, eyeSize: 112 });
    expect(face.faceWidth).toBe(130);
    expect(face.mouthHeight).toBe(70);
    expect(face.eyeSize).toBe(112);
    expect(face.hairVolume).toBe(DEFAULT_FACE.hairVolume);
  });

  it("rejects malformed saved colors and broken JSON", () => {
    const face = normalizeFace({ faceColor: "red", hairColor: "#A1b2C3" });
    expect(face.faceColor).toBe(DEFAULT_FACE.faceColor);
    expect(face.hairColor).toBe("#A1b2C3");
    expect(parseFace("not json")).toEqual(DEFAULT_FACE);
  });

  it("round-trips a customized face through local persistence", () => {
    const custom = { ...DEFAULT_FACE, jaw: 12, hairSweep: -44, lipColor: "#123ABC" };
    expect(parseFace(JSON.stringify(custom))).toEqual(custom);
  });

  it("randomizes independent geometry rather than selecting a fixed face", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const a = randomFace(random);
    const b = randomFace(random);
    expect(a).not.toEqual(b);
    expect(a.faceWidth).not.toBe(a.eyeSize);
    for (const control of FACE_CONTROLS) {
      expect(a[control.key]).toBeGreaterThanOrEqual(control.min);
      expect(a[control.key]).toBeLessThanOrEqual(control.max);
    }
    for (const { key } of FACE_COLORS) expect(a[key]).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("scales custom mouth proportions while preserving viseme opening", () => {
    const face = normalizeFace({ faceHeight: 125, mouthWidth: 150, mouthHeight: 150, lineWeight: 150 });
    const closed = faceMouthGeometry(face, VISEME_SHAPES.closed);
    const open = faceMouthGeometry(face, VISEME_SHAPES.open);
    expect(closed.y).toBe(80);
    expect(closed.width).toBeCloseTo(54 * VISEME_SHAPES.closed.width);
    expect(open.height).toBeCloseTo(1.5 + 51 * VISEME_SHAPES.open.open);
    expect(open.height).toBeGreaterThan(closed.height);
    expect(open.lineWidth).toBeCloseTo(5.25);
  });

  it("clamps photo controls and places the mouth in transformed portrait coordinates", () => {
    const settings = normalizePhotoFace({ zoom: 500, mouthX: 60, mouthY: 70, warmth: -200 });
    expect(settings.zoom).toBe(180);
    expect(settings.warmth).toBe(-50);
    const face = normalizeFace({ faceWidth: 100, faceHeight: 100, mouthWidth: 100 });
    const layout = photoLayout(600, 800, 600, 800, settings, face);
    const mouth = photoMouthGeometry(layout, settings, face, VISEME_SHAPES.open);
    expect(layout.width).toBe(1080);
    expect(layout.height).toBe(1440);
    expect(mouth.x).toBeCloseTo(layout.x + layout.width * 0.6);
    expect(mouth.y).toBeCloseTo(layout.y + layout.height * 0.7);
    expect(mouth.height).toBeGreaterThan(1.5);
    expect(DEFAULT_PHOTO_FACE.mouthX).toBe(50);
  });
});
