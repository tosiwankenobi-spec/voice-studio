import { createServerOnlyFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const AI_CALL_LIMIT = 60;
export const AI_WINDOW_MS = 10 * 60 * 1000;
export const AI_LIMIT_MESSAGE =
  "You've made 60 AI calls in 10 minutes. Wait a few minutes, then try again.";
export class UsageLimitError extends Error {}
export type UsageKind =
  | "tts"
  | "cloned_tts"
  | "claude"
  | "scene_planning"
  | "transcription"
  | "word_timings_elevenlabs"
  | "word_timings_ai"
  | "voice_clone"
  | "video"
  | "image"
  | "product_fetch"
  | "ad_planning"
  | "translation"
  | "tts_preview";

/** Reservations count attempts, including provider failures; they are not billing records. */
export const recordAIUsage = createServerOnlyFn(
  async (
    context: { supabase: SupabaseClient<Database>; userId: string },
    kind: UsageKind,
    units: number,
    now = Date.now(),
  ) => {
    if (!Number.isFinite(units) || units < 0 || units > 2147483647)
      throw new Error("Invalid usage amount.");
    const { count, error } = await context.supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gt("created_at", new Date(now - AI_WINDOW_MS).toISOString());
    if (error || count === null) throw new Error("Couldn't check AI usage. Please try again.");
    if (count >= AI_CALL_LIMIT) throw new UsageLimitError(AI_LIMIT_MESSAGE);
    // Deliberately not atomic: a small concurrent overshoot is accepted.
    const saved = await context.supabase.from("usage_events").insert({
      user_id: context.userId,
      kind,
      units: Math.ceil(units),
    });
    if (saved.error) throw new Error("Couldn't record AI usage. Please try again.");
  },
);
