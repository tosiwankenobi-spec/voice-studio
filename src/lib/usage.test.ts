import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (fn: unknown) => fn }));
import { recordAIUsage } from "./usage";

function setup(count: number | null = 0, readError: unknown = null, writeError: unknown = null) {
  const rows: { user_id: string; kind: string; units: number }[] = [];
  const gt = vi.fn(async () => ({ count, error: readError }));
  const eq = vi.fn(() => ({ gt }));
  const select = vi.fn(() => ({ eq }));
  const insert = vi.fn(async (row: (typeof rows)[number]) => {
    rows.push(row);
    return { error: writeError };
  });
  const supabase = {
    from: vi.fn(() => ({ select, insert })),
  } as unknown as SupabaseClient<Database>;
  return { context: { supabase, userId: "owner" }, rows, eq, gt, insert };
}

describe("AI usage reservations", () => {
  it("allows the 60th call but rejects the 61st", async () => {
    const allowed = setup(59);
    await recordAIUsage(allowed.context, "image", 1);
    expect(allowed.rows).toHaveLength(1);
    const blocked = setup(60);
    await expect(recordAIUsage(blocked.context, "image", 1)).rejects.toThrow("60 AI calls");
    expect(blocked.insert).not.toHaveBeenCalled();
  });
  it("counts only this user's calls within the last 10 minutes", async () => {
    const s = setup();
    await recordAIUsage(s.context, "claude", 1, Date.parse("2026-10-20T13:46:00Z"));
    expect(s.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(s.gt).toHaveBeenCalledWith("created_at", "2026-10-20T13:36:00.000Z");
  });
  it("stores TTS characters", async () => {
    const s = setup();
    await recordAIUsage(s.context, "tts", "Hello".length);
    expect(s.rows[0]).toEqual({ user_id: "owner", kind: "tts", units: 5 });
  });
  it("stores integer seconds for video and transcription", async () => {
    const s = setup();
    await recordAIUsage(s.context, "video", 8);
    await recordAIUsage(s.context, "transcription", 9.2);
    expect(s.rows.map(({ kind, units }) => ({ kind, units }))).toEqual([
      { kind: "video", units: 8 },
      { kind: "transcription", units: 10 },
    ]);
  });
  it("stores one unit for Claude and images", async () => {
    const s = setup();
    await recordAIUsage(s.context, "claude", 1);
    await recordAIUsage(s.context, "image", 1);
    expect(s.rows.map(({ kind, units }) => ({ kind, units }))).toEqual([
      { kind: "claude", units: 1 },
      { kind: "image", units: 1 },
    ]);
  });
  it("fails closed if counting or saving is unavailable", async () => {
    const s = setup(null, new Error("offline"));
    await expect(recordAIUsage(s.context, "image", 1)).rejects.toThrow("check AI usage");
    expect(s.insert).not.toHaveBeenCalled();
    await expect(
      recordAIUsage(setup(0, null, new Error("offline")).context, "image", 1),
    ).rejects.toThrow("record AI usage");
  });
  it("rejects invalid integer usage amounts", async () => {
    const s = setup();
    for (const value of [-1, NaN, Infinity, 2147483648]) {
      await expect(recordAIUsage(s.context, "tts", value)).rejects.toThrow("Invalid usage");
    }
    expect(s.insert).not.toHaveBeenCalled();
  });
});
