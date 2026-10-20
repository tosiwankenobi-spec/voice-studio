import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordAIUsage } from "@/lib/usage";
import { languageName } from "@/lib/dub";

/** Translates lines for dubbing, keeping one output line per input line and similar length. */
export const translateLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lines: string[]; language: string }) => {
    const language = languageName(String(d.language ?? ""));
    if (!language) throw new Error("Choose a language.");
    const lines = (Array.isArray(d.lines) ? d.lines : []).map((l) =>
      String(l ?? "")
        .trim()
        .slice(0, 5000),
    );
    if (!lines.length || lines.every((l) => !l))
      throw new Error("There's nothing to translate yet.");
    if (lines.length > 200) throw new Error("Translate at most 200 lines at a time.");
    const total = lines.reduce((a, l) => a + l.length, 0);
    if (total > 60000) throw new Error("Keep translations under 60,000 characters.");
    return { lines, language, total };
  })
  .handler(async ({ data, context }) => {
    const { callClaude, parseJsonReply } = await import("./claude.server");
    await recordAIUsage(context, "translation", data.total);
    const reply = await callClaude({
      maxTokens: Math.min(32000, Math.ceil(data.total / 2) + 2000),
      system:
        `You translate voiceover lines into ${data.language} for dubbing. Translate each line naturally, as a native speaker would say it aloud. ` +
        "Keep each translation close to the original's length so it fits the same timing — prefer shorter phrasing when the target language runs long. " +
        "Keep names, brand names and prices as they are. Spell out numbers the way they'd be spoken. " +
        `Return ONLY a JSON array of exactly ${data.lines.length} strings, one per input line, in order. Empty input lines stay empty strings.`,
      user: JSON.stringify(data.lines),
    });
    const out = parseJsonReply<unknown[]>(reply, "array").map((x) => String(x ?? "").trim());
    if (out.length !== data.lines.length)
      throw new Error("The translation came back with a different number of lines — try again.");
    return { lines: out };
  });
