import { describe, expect, it } from "vitest";
import { locate, move, splitAt, totalLength, type Segment } from "./audio";

let n = 0;
const id = () => `s${n++}`;
const base: Segment[] = [
  { id: "a", start: 0, end: 4 },
  { id: "b", start: 10, end: 12 },
];

describe("timeline edits", () => {
  it("splitting keeps total length and cuts at the playhead", () => {
    const out = splitAt(base, 1.5, id);
    expect(out).toHaveLength(3);
    expect(out[0]!.end).toBe(1.5);
    expect(out[1]!.start).toBe(1.5);
    expect(totalLength(out)).toBe(6);
  });
  it("splitting inside a later segment maps to source time", () => {
    const out = splitAt(base, 5, id);
    expect(out[1]).toMatchObject({ start: 10, end: 11 });
    expect(out[2]).toMatchObject({ start: 11, end: 12 });
  });
  it("rearranging moves a segment", () => {
    expect(move(base, 1, 0).map((s) => s.id)).toEqual(["b", "a"]);
  });
  it("locates timeline time after a reorder", () => {
    expect(locate(move(base, 1, 0), 3)).toMatchObject({ index: 1, offset: 1 });
  });
});
