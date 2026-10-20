/** Dubbing helpers: supported languages and timing fit. */
export const DUB_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese (Mandarin)" },
] as const;
export type DubLanguage = (typeof DUB_LANGUAGES)[number]["code"];

export function languageName(code: string) {
  return DUB_LANGUAGES.find((l) => l.code === code)?.name ?? null;
}

/** ElevenLabs speed range. */
export const MIN_SPEED = 0.7;
export const MAX_SPEED = 1.2;

/**
 * Speed to regenerate at so a dubbed line lasts about as long as the original.
 * Returns null when the first take already fits (within 8%).
 */
export function fitSpeed(
  originalSeconds: number,
  dubbedSeconds: number,
  currentSpeed = 1,
): number | null {
  if (!(originalSeconds > 0) || !(dubbedSeconds > 0)) return null;
  const ratio = dubbedSeconds / originalSeconds;
  if (Math.abs(ratio - 1) <= 0.08) return null;
  const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, currentSpeed * ratio));
  return Math.abs(next - currentSpeed) < 0.02 ? null : Math.round(next * 100) / 100;
}

/** Stock voices take a pace word instead of a number. */
export function paceFor(speed: number): "slower" | "normal" | "faster" {
  return speed >= 1.08 ? "faster" : speed <= 0.92 ? "slower" : "normal";
}
