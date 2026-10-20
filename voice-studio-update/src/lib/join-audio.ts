import { encodeWav } from "./audio";
import { trimSilence } from "./patch";
import { joinTakeSamples } from "./take-delivery";

/** Decodes audio clips, trims their edge silence and joins them with the given pauses into one WAV. */
export async function joinAudio(items: { url: string; pause: number }[]): Promise<Blob> {
  if (!items.length) throw new Error("Nothing to join yet.");
  const context = new AudioContext({ sampleRate: 44100 });
  try {
    const decoded = [];
    for (const item of items) {
      const res = await fetch(item.url);
      const audio = await context.decodeAudioData(await res.arrayBuffer());
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
        audio.getChannelData(i),
      );
      decoded.push({
        channels: trimSilence(channels, context.sampleRate).channels,
        pause: item.pause,
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

/** Decoded length of an audio clip in seconds. */
export async function clipSeconds(url: string) {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
    return audio.duration;
  } finally {
    await context.close();
  }
}
