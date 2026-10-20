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