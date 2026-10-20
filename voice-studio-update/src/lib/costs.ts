import type { UsageKind } from "./usage";

/**
 * Credit prices shown to users before they generate anything. Credits are Vocalis's own unit,
 * set to roughly track provider cost. Change the numbers here and every cost hint, the Usage page
 * and the monthly allowance warning follow.
 */
export const MONTHLY_ALLOWANCE = 2000;
export const WARN_AT = 0.8;
export const FREE_PREVIEW_CHARS = 200;
export const FREE_PREVIEWS_PER_DAY = 30;

type Price = { per: number; credits: number; unit: string; label: string };

export const PRICES: Record<UsageKind, Price> = {
  tts: { per: 1000, credits: 1, unit: "characters", label: "Stock voice speech" },
  cloned_tts: { per: 1000, credits: 3, unit: "characters", label: "Your-voice speech" },
  tts_preview: { per: 1000, credits: 0, unit: "characters", label: "Free previews" },
  claude: { per: 1, credits: 1, unit: "requests", label: "Claude writing help" },
  scene_planning: { per: 1, credits: 2, unit: "requests", label: "Scene planning" },
  ad_planning: { per: 1, credits: 2, unit: "requests", label: "Ad scripts" },
  translation: { per: 2000, credits: 1, unit: "characters", label: "Translation" },
  transcription: { per: 60, credits: 1, unit: "seconds", label: "Transcription" },
  word_timings_elevenlabs: {
    per: 60,
    credits: 2,
    unit: "seconds",
    label: "Word timing (ElevenLabs)",
  },
  word_timings_ai: { per: 60, credits: 1, unit: "seconds", label: "Word timing (AI)" },
  voice_clone: { per: 1, credits: 10, unit: "voices", label: "Voice copies" },
  video: { per: 1, credits: 5, unit: "seconds", label: "Animated video" },
  image: { per: 1, credits: 4, unit: "images", label: "AI images" },
  product_fetch: { per: 1, credits: 0, unit: "pages", label: "Product page reads" },
};

/** Credits for `units` of `kind`. Any paid use costs at least 1 credit. */
export function creditsFor(kind: UsageKind | string, units: number): number {
  const p = PRICES[kind as UsageKind];
  if (!p || p.credits === 0 || !(units > 0)) return 0;
  return Math.max(1, Math.ceil((units / p.per) * p.credits));
}

/** Short label like "≈ 3 credits" or "Free". */
export function costLabel(credits: number) {
  return credits === 0 ? "Free" : `≈ ${credits} credit${credits === 1 ? "" : "s"}`;
}

export type UsageRow = { kind: string; units: number; created_at: string };

/** Totals for a set of usage rows: per kind, per day (YYYY-MM-DD, local time), and overall. */
export function summarizeUsage(rows: UsageRow[]) {
  const byKind = new Map<string, { units: number; credits: number; count: number }>();
  const byDay = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const c = creditsFor(r.kind, r.units);
    total += c;
    const k = byKind.get(r.kind) ?? { units: 0, credits: 0, count: 0 };
    byKind.set(r.kind, { units: k.units + r.units, credits: k.credits + c, count: k.count + 1 });
    const d = new Date(r.created_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(day, (byDay.get(day) ?? 0) + c);
  }
  return { total, byKind, byDay };
}

export function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
