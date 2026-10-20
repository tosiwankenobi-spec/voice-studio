import { describe, expect, it } from 'vitest';
import { sentences, MAX_TAKES, assertTakeCapacity, PAUSES, deliverySettings, deliverySpeed, elevenText, deliveryPrompt, joinTakeSamples } from './take-delivery';
describe('line takes', () => {
  it('splits sentences and explicit lines in order', () => expect(sentences('Hello world. Welcome back!\nOne more line.')).toEqual(['Hello world.', 'Welcome back!', 'One more line.']));
  it('allows three takes but rejects a fourth', () => { expect(MAX_TAKES).toBe(3); expect(() => assertTakeCapacity(2)).not.toThrow(); expect(() => assertTakeCapacity(3)).toThrow('3 takes'); });
  it('only accepts the four requested pauses', () => {
    expect(PAUSES).toEqual([0, 0.25, 0.5, 1]);
    for (const pause of PAUSES) expect(deliverySettings({ pause }).pause).toBe(pause);
    expect(() => deliverySettings({ pause: 0.75 })).toThrow('pause');
  });
  it('maps all three pace controls to provider speed', () => {
    expect(deliverySpeed(deliverySettings({ pace: 'slower' }))).toBe(0.85);
    expect(deliverySpeed(deliverySettings({ pace: 'normal' }))).toBe(1);
    expect(deliverySpeed(deliverySettings({ pace: 'faster' }))).toBe(1.15);
  });
  it('expresses pace and stressed word for stock speech', () => expect(deliveryPrompt(deliverySettings({ pace: 'slower', emphasis: 'hello', pause: 0.5 }))).toContain('slowly, stressing the word "hello"'));
  it('adds ElevenLabs break tags and stress without allowing arbitrary SSML', () => {
    expect(elevenText('Hello friend.', deliverySettings({ emphasis: 'friend', pause: 0.5 }))).toBe('Hello FRIEND.<break time="0.5s"/>');
    expect(elevenText('<break time="20s"/>', deliverySettings())).toContain('&lt;break');
  });
  it('joins selected audio in order with exact silent pauses', () => {
    const audio = joinTakeSamples([{ channels: [Float32Array.from([1, 2])], pause: 0.25 }, { channels: [Float32Array.from([3])], pause: 0.5 }], 4);
    expect([...audio[0] ?? []]).toEqual([1, 2, 0, 3, 0, 0]);
  });
});