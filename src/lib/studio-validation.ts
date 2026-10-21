export function requireVoiceConsent(consent: unknown) {
  if (consent !== true && consent !== "true") {
    throw new Error("Confirm this is your voice or you have permission to copy it.");
  }
}

export function audioExtension(mime: string): string {
  const type = mime.split(";")[0]?.toLowerCase();
  if (type === "audio/mpeg" || type === "audio/mp3") return "mp3";
  if (type === "audio/mp4" || type === "audio/x-m4a") return "m4a";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/webm") return "webm";
  return "wav";
}
/** The sentence a speaker reads aloud to consent to their voice being copied. */
export function consentSentence(name: string) {
  return `I, ${name.trim() || "[your name]"}, confirm this is my voice and I consent to Vocalis creating a digital copy of it.`;
}

const consentTokens = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * True when a transcript of the consent recording matches the consent sentence closely enough.
 * Transcription isn't perfect (names especially), so at least 75% of the sentence's words must be
 * heard, and the key words "consent", "voice" and "copy" must all be present.
 */
export function consentMatches(transcript: string, name: string) {
  const heard = new Set(consentTokens(transcript));
  const want = consentTokens(consentSentence(name));
  if (!["consent", "voice", "copy"].every((w) => heard.has(w))) return false;
  const hits = want.filter((w) => heard.has(w)).length;
  return hits / want.length >= 0.75;
}
