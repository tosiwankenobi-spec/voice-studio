import { encodeWav } from "./audio";
import { trimSilence } from "./patch";
import { joinTakeSamples } from "./take-delivery";
import type { ScriptTake } from "./takes";

export async function exportTakes(takes: ScriptTake[]) {
  if (!takes.length) throw new Error("Choose a take for every line.");
  const context = new AudioContext({ sampleRate: 44100 });
  try {
    const decoded = [];
    for (const take of takes) {
      const response = await fetch(take.url);
      if (!response.ok)
        throw new Error("Could not open a saved take. Reopen your script and try again.");
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
        audio.getChannelData(i),
      );
      decoded.push({
        channels: trimSilence(channels, context.sampleRate).channels,
        pause: take.settings.pause,
      });
    }
    const samples = joinTakeSamples(decoded, context.sampleRate);
    const buffer = context.createBuffer(
      samples.length,
      samples[0]?.length ?? 1,
      context.sampleRate,
    );
    samples.forEach((c, i) => buffer.getChannelData(i).set(c));
    return encodeWav(buffer);
  } finally {
    await context.close();
  }
}
