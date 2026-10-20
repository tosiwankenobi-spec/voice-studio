import { describe, expect, it } from 'vitest';
import { changedSpan, patchRange, matchPatch, trimSilence, rms, CROSSFADE_SECONDS, NEIGHBOUR_SECONDS } from './patch';

describe('contextual LCS patches', () => {
  it('replaces a rewritten word with one context word on either side', () => {
    expect(changedSpan('We bake fresh bread today.', 'We bake tasty bread today.')).toEqual({ oldStart: 1, oldEnd: 4, newStart: 1, newEnd: 4, phrase: 'bake tasty bread' });
  });
  it('anchors additions between timed context words', () => {
    expect(changedSpan('We bake bread.', 'We bake fresh bread.')).toEqual({ oldStart: 1, oldEnd: 3, newStart: 1, newEnd: 4, phrase: 'bake fresh bread.' });
  });
  it('handles beginning and end insertions', () => {
    expect(changedSpan('Hello there', 'Well hello there')?.phrase).toBe('Well hello');
    expect(changedSpan('Hello there', 'Hello there friend')?.phrase).toBe('there friend');
  });
  it('does not patch a pure deletion', () => expect(changedSpan('Hello dear friend', 'Hello friend')).toBeNull());
  it('maps changed timeline words through rearranged source segments', () => {
    const segs = [{ id: 'b', start: 2, end: 4 }, { id: 'a', start: 0, end: 2 }];
    const words = [{ w: 'first', s: 0.2, e: 1 }, { w: 'second', s: 2.2, e: 3 }];
    const refined: number[] = [];
    const range = patchRange(segs, words, 0, 1, t => { refined.push(t); return t; });
    expect(range.start).toBeCloseTo(0.2); expect(range.end).toBeCloseTo(1.6);
    expect(refined).toEqual([2.2, 3.6]);
  });
});

describe('patch matching', () => {
  it('trims leading and trailing silence', () => {
    const data = Float32Array.from([...Array(30).fill(0), ...Array(100).fill(0.2), ...Array(40).fill(0)]);
    const trimmed = trimSilence([data], 1000);
    expect(trimmed.start).toBe(30); expect(trimmed.end).toBe(130);
  });
  it('rejects silent provider output', () => expect(() => trimSilence([new Float32Array(100)], 1000)).toThrow('silent'));
  it('matches patch RMS to two seconds of neighbouring audio', () => {
    const original = new Float32Array(10000).fill(0.2);
    const patch = new Float32Array(1000).fill(0.1);
    const result = matchPatch([original], [patch], 1000, 4, 5);
    expect(NEIGHBOUR_SECONDS).toBe(2);
    expect(result.gain).toBeCloseTo(2);
    expect(rms(result.channels[0] ?? new Float32Array())).toBeCloseTo(0.2);
  });
  it('overlaps both joins by exactly 15ms', () => {
    const original = new Float32Array(4000).fill(0.2);
    const result = matchPatch([original], [new Float32Array(1000).fill(-0.1)], 1000, 1, 2);
    expect(CROSSFADE_SECONDS).toBe(0.015);
    expect(result.start).toBe(0.985); expect(result.end).toBe(2.015);
    expect(result.channels[0]?.[0]).toBeCloseTo(0.2);
    expect(result.channels[0]?.[14]).toBeCloseTo(-0.2);
    expect(result.channels[0]?.[999]).toBeCloseTo(0.2);
  });
});