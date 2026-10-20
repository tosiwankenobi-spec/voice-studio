export const MAX_TAKES = 3;
export const PAUSES = [0, 0.25, 0.5, 1] as const;
export type Delivery = { pace: 'slower' | 'normal' | 'faster'; emphasis: string; pause: number };
export const DEFAULT_DELIVERY: Delivery = { pace: 'normal', emphasis: '', pause: 0 };
export function sentences(text: string): string[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return text.split(/\n+/).flatMap(line => [...segmenter.segment(line)].map(s => s.segment.trim())).filter(Boolean);
}
export function deliverySettings(input?: Partial<Delivery>): Delivery {
  const pace = input?.pace ?? 'normal';
  const pause = input?.pause ?? 0;
  if (!['slower', 'normal', 'faster'].includes(pace)) throw new Error('Choose a valid pace.');
  if (!(PAUSES as readonly number[]).includes(pause)) throw new Error('Choose a valid pause.');
  return { pace, pause, emphasis: String(input?.emphasis ?? '').slice(0, 80) };
}
export const deliverySpeed = (settings: Delivery) => settings.pace === 'slower' ? 0.85 : settings.pace === 'faster' ? 1.15 : 1;
export function deliveryPrompt(settings: Delivery) {
  return `Speak ${settings.pace === 'normal' ? 'at a natural pace' : settings.pace === 'slower' ? 'slowly' : 'briskly'}${settings.emphasis ? `, stressing the word "${settings.emphasis}"` : ''}. End with ${settings.pause} seconds of pause.`;
}
export function elevenText(text: string, settings: Delivery) {
  // ElevenLabs v2 supports break tags, not generic SSML emphasis. Uppercase is its supported stress cue.
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const emphasized = settings.emphasis ? escaped.split(/(\s+)/).map(w => w.replace(/[^\p{L}\p{N}']/gu, '').toLowerCase() === settings.emphasis.replace(/[^\p{L}\p{N}']/gu, '').toLowerCase() ? w.toUpperCase() : w).join('') : escaped;
  return settings.pause ? `${emphasized}<break time="${settings.pause}s"/>` : emphasized;
}
export function assertTakeCapacity(count: number) {
  if (count >= MAX_TAKES) throw new Error('Each line can have up to 3 takes.');
}
/** Join already-trimmed takes, inserting an exact silent pause after every chosen line. */
export function joinTakeSamples(takes: { channels: Float32Array[]; pause: number }[], sampleRate: number) {
  const count = Math.max(1, ...takes.map(t => t.channels.length));
  const length = takes.reduce((n, t) => n + (t.channels[0]?.length ?? 0) + Math.round(t.pause * sampleRate), 0);
  const channels = Array.from({ length: count }, () => new Float32Array(length));
  let offset = 0;
  for (const take of takes) {
    channels.forEach((c, i) => c.set(take.channels[Math.min(i, take.channels.length - 1)] ?? [], offset));
    offset += (take.channels[0]?.length ?? 0) + Math.round(take.pause * sampleRate);
  }
  return channels;
}