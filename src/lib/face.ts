import type { MouthShape } from "./viseme";

export type AvatarFace = {
  faceWidth: number;
  faceHeight: number;
  roundness: number;
  jaw: number;
  hairVolume: number;
  hairSweep: number;
  eyeSize: number;
  eyeSpacing: number;
  eyeOpen: number;
  browTilt: number;
  noseSize: number;
  mouthWidth: number;
  mouthHeight: number;
  blush: number;
  earSize: number;
  lineWeight: number;
  faceColor: string;
  hairColor: string;
  eyeColor: string;
  lipColor: string;
  bodyColor: string;
  backgroundColor: string;
};

export type NumericFaceKey = {
  [K in keyof AvatarFace]: AvatarFace[K] extends number ? K : never;
}[keyof AvatarFace];
export type ColorFaceKey = {
  [K in keyof AvatarFace]: AvatarFace[K] extends string ? K : never;
}[keyof AvatarFace];

export const DEFAULT_FACE: AvatarFace = {
  faceWidth: 100,
  faceHeight: 100,
  roundness: 72,
  jaw: 64,
  hairVolume: 65,
  hairSweep: 15,
  eyeSize: 100,
  eyeSpacing: 100,
  eyeOpen: 80,
  browTilt: 15,
  noseSize: 70,
  mouthWidth: 100,
  mouthHeight: 100,
  blush: 35,
  earSize: 70,
  lineWeight: 100,
  faceColor: "#DDA37B",
  hairColor: "#27243A",
  eyeColor: "#27243A",
  lipColor: "#C95D70",
  bodyColor: "#7C3AED",
  backgroundColor: "#0B0B14",
};

export const FACE_CONTROLS: ReadonlyArray<{
  group: "Shape" | "Features";
  key: NumericFaceKey;
  label: string;
  min: number;
  max: number;
  unit?: string;
}> = [
  { group: "Shape", key: "faceWidth", label: "Face width", min: 75, max: 130, unit: "%" },
  { group: "Shape", key: "faceHeight", label: "Face height", min: 80, max: 125, unit: "%" },
  { group: "Shape", key: "roundness", label: "Round vs angular", min: 0, max: 100 },
  { group: "Shape", key: "jaw", label: "Jaw softness", min: 0, max: 100 },
  { group: "Shape", key: "hairVolume", label: "Hair volume", min: 0, max: 100 },
  { group: "Shape", key: "hairSweep", label: "Hair sweep", min: -50, max: 50 },
  { group: "Features", key: "eyeSize", label: "Eye size", min: 60, max: 150, unit: "%" },
  { group: "Features", key: "eyeSpacing", label: "Eye spacing", min: 70, max: 140, unit: "%" },
  { group: "Features", key: "eyeOpen", label: "Eye openness", min: 45, max: 120, unit: "%" },
  { group: "Features", key: "browTilt", label: "Eyebrow tilt", min: -40, max: 40 },
  { group: "Features", key: "noseSize", label: "Nose size", min: 40, max: 140, unit: "%" },
  { group: "Features", key: "mouthWidth", label: "Mouth width", min: 70, max: 150, unit: "%" },
  { group: "Features", key: "mouthHeight", label: "Mouth opening", min: 70, max: 150, unit: "%" },
  { group: "Features", key: "blush", label: "Cheek color", min: 0, max: 100 },
  { group: "Features", key: "earSize", label: "Ear size", min: 40, max: 140, unit: "%" },
  { group: "Features", key: "lineWeight", label: "Line weight", min: 50, max: 150, unit: "%" },
];

export const FACE_COLORS: ReadonlyArray<{ key: ColorFaceKey; label: string }> = [
  { key: "faceColor", label: "Face" },
  { key: "hairColor", label: "Hair" },
  { key: "eyeColor", label: "Eyes & lines" },
  { key: "lipColor", label: "Lips" },
  { key: "bodyColor", label: "Clothing" },
  { key: "backgroundColor", label: "Background" },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validColor = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

/** Treat saved faces as untrusted data: fill missing fields and clamp every control. */
export function normalizeFace(value: unknown): AvatarFace {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_FACE };
  for (const control of FACE_CONTROLS) {
    const candidate = source[control.key];
    if (typeof candidate === "number" && Number.isFinite(candidate))
      result[control.key] = clamp(candidate, control.min, control.max);
  }
  for (const { key } of FACE_COLORS) result[key] = validColor(source[key], DEFAULT_FACE[key]);
  return result;
}

export function parseFace(json: string | null): AvatarFace {
  if (!json) return { ...DEFAULT_FACE };
  try {
    return normalizeFace(JSON.parse(json));
  } catch {
    return { ...DEFAULT_FACE };
  }
}

const pick = <T,>(items: readonly T[], random: () => number) =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))] ?? items[0]!;

/** Generate a complete new face while keeping every parameter editable afterward. */
export function randomFace(random: () => number = Math.random): AvatarFace {
  const next = { ...DEFAULT_FACE };
  for (const control of FACE_CONTROLS) {
    const span = control.max - control.min;
    next[control.key] = Math.round(control.min + random() * span);
  }
  next.faceColor = pick(["#F2C9A7", "#DDA37B", "#B97852", "#805036", "#533426", "#C9D1FF", "#A7E3D8"], random);
  next.hairColor = pick(["#171522", "#27243A", "#5B3827", "#8A5A36", "#D6C3A5", "#7C3AED", "#164E63"], random);
  next.eyeColor = pick(["#171522", "#27243A", "#164E63", "#3F2D20"], random);
  next.lipColor = pick(["#C95D70", "#A94A5E", "#8F4E46", "#7C3AED", "#0E7490"], random);
  next.bodyColor = pick(["#7C3AED", "#22D3EE", "#34D399", "#EEF0FF", "#C2410C"], random);
  next.backgroundColor = pick(["#0B0B14", "#14142A", "#102A2A", "#24152E", "#1C1C38"], random);
  return normalizeFace(next);
}

/** User mouth proportions scale the viseme geometry without replacing its speech timing. */
export function faceMouthGeometry(face: AvatarFace, mouth: MouthShape) {
  return {
    x: 0,
    y: 64 * (face.faceHeight / 100),
    width: 36 * (face.mouthWidth / 100) * mouth.width,
    height: 1.5 + mouth.open * 34 * (face.mouthHeight / 100),
    lineWidth: 3.5 * (face.lineWeight / 100),
  };
}

export type PhotoFaceSettings = {
  zoom: number;
  offsetX: number;
  offsetY: number;
  brightness: number;
  saturation: number;
  warmth: number;
  mouthX: number;
  mouthY: number;
};

export const DEFAULT_PHOTO_FACE: PhotoFaceSettings = {
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  brightness: 100,
  saturation: 100,
  warmth: 0,
  mouthX: 50,
  mouthY: 64,
};

export const PHOTO_CONTROLS = {
  portrait: [
    { key: "zoom", label: "Portrait zoom", min: 80, max: 180, unit: "%" },
    { key: "offsetX", label: "Horizontal position", min: -50, max: 50 },
    { key: "offsetY", label: "Vertical position", min: -50, max: 50 },
  ],
  mouth: [
    { key: "mouthX", label: "Mouth horizontal", min: 20, max: 80, unit: "%" },
    { key: "mouthY", label: "Mouth vertical", min: 30, max: 85, unit: "%" },
  ],
  style: [
    { key: "brightness", label: "Brightness", min: 70, max: 130, unit: "%" },
    { key: "saturation", label: "Color saturation", min: 0, max: 200, unit: "%" },
    { key: "warmth", label: "Warm vs cool", min: -50, max: 50 },
  ],
} as const satisfies Record<string, ReadonlyArray<{
  key: keyof PhotoFaceSettings;
  label: string;
  min: number;
  max: number;
  unit?: string;
}>>;

export function normalizePhotoFace(value: unknown): PhotoFaceSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_PHOTO_FACE };
  for (const group of Object.values(PHOTO_CONTROLS)) {
    for (const control of group) {
      const candidate: unknown = source[control.key];
      if (typeof candidate === "number" && Number.isFinite(candidate))
        result[control.key] = clamp(candidate, control.min, control.max);
    }
  }
  return result;
}

export function parsePhotoFace(json: string | null): PhotoFaceSettings {
  if (!json) return { ...DEFAULT_PHOTO_FACE };
  try {
    return normalizePhotoFace(JSON.parse(json));
  } catch {
    return { ...DEFAULT_PHOTO_FACE };
  }
}

export function photoLayout(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  settings: PhotoFaceSettings,
  face: AvatarFace,
) {
  const cover = Math.max(canvasWidth / Math.max(1, imageWidth), canvasHeight / Math.max(1, imageHeight));
  const scale = cover * (settings.zoom / 100);
  const width = imageWidth * scale * (face.faceWidth / 100);
  const height = imageHeight * scale * (face.faceHeight / 100);
  return {
    x: canvasWidth / 2 + (settings.offsetX / 100) * canvasWidth * 0.5 - width / 2,
    y: canvasHeight / 2 + (settings.offsetY / 100) * canvasHeight * 0.5 - height / 2,
    width,
    height,
  };
}

export function photoMouthGeometry(
  layout: ReturnType<typeof photoLayout>,
  settings: PhotoFaceSettings,
  face: AvatarFace,
  mouth: MouthShape,
) {
  const base = Math.min(layout.width, layout.height);
  return {
    x: layout.x + layout.width * (settings.mouthX / 100),
    y: layout.y + layout.height * (settings.mouthY / 100),
    width: base * 0.09 * (face.mouthWidth / 100) * mouth.width,
    height: 1.5 + mouth.open * base * 0.07 * (face.mouthHeight / 100),
    lineWidth: 3.5 * (face.lineWeight / 100),
  };
}
