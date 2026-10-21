import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { consentMatches, requireVoiceConsent } from "@/lib/studio-validation";
import { FREE_PREVIEW_CHARS, FREE_PREVIEWS_PER_DAY } from "@/lib/costs";
import { recordAIUsage, UsageLimitError } from "@/lib/usage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  deliverySettings,
  deliveryPrompt,
  deliverySpeed,
  elevenText,
  type Delivery,
} from "@/lib/take-delivery";

const GATEWAY = "https://ai.gateway.lovable.dev";
const TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
const CLAUDE_MODEL = "anthropic/claude-sonnet-5";

export const VOICES = [
  "Kore",
  "Puck",
  "Charon",
  "Fenrir",
  "Aoede",
  "Leda",
  "Orus",
  "Zephyr",
] as const;

function key() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("AI is not configured.");
  return k;
}

async function failure(res: Response) {
  const body = await res.text();
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j?.error?.message ?? j?.message ?? body;
  } catch {
    /* Keep the provider response when it is not JSON. */
  }
  if (res.status === 402) return new Error("Out of AI credits. Please top up to continue.");
  if (res.status === 429) return new Error("Too many requests — wait a moment and try again.");
  return new Error(`AI request failed (${res.status}): ${String(msg).slice(0, 300)}`);
}

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

/** Free previews: short (first-sentence) clips that cost no credits, capped per day. */
async function reservePreview(context: Ctx, text: string) {
  if (text.length > FREE_PREVIEW_CHARS)
    throw new Error(`Free previews are limited to ${FREE_PREVIEW_CHARS} characters.`);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await context.supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.userId)
    .eq("kind", "tts_preview")
    .gt("created_at", since.toISOString());
  if (error || count === null)
    throw new Error("Couldn't check your free previews. Please try again.");
  if (count >= FREE_PREVIEWS_PER_DAY)
    throw new Error(
      `You've used today's ${FREE_PREVIEWS_PER_DAY} free previews. Generate the full clip instead.`,
    );
  await recordAIUsage(context, "tts_preview", text.length);
}

export const generateSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      text: string;
      voice: string;
      style?: string;
      delivery?: Partial<Delivery>;
      preview?: boolean;
    }) => {
      const text = String(d.text ?? "").trim();
      if (!text) throw new Error("Write something first.");
      if (text.length > 5000) throw new Error("Keep scripts under 5,000 characters.");
      const voice = (VOICES as readonly string[]).includes(d.voice) ? d.voice : "Kore";
      return {
        text,
        voice,
        style: String(d.style ?? "").slice(0, 200),
        delivery: d.delivery ? deliverySettings(d.delivery) : null,
        preview: d.preview === true,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const style = [data.style, data.delivery ? deliveryPrompt(data.delivery) : ""]
      .filter(Boolean)
      .join(". ");
    if (data.preview) await reservePreview(context, data.text);
    else await recordAIUsage(context, "tts", (style ? `${style}: ${data.text}` : data.text).length);
    const { spokenPronunciation } = await import("./pronunciation.server");
    const pronounced = await spokenPronunciation(context.supabase, context.userId, data.text);
    const spoken = style ? `${style}: ${pronounced}` : pronounced;
    const res = await fetch(`${GATEWAY}/v1/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TTS_MODEL,
        contents: [{ role: "user", parts: [{ text: spoken }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: data.voice } } },
        },
        stream_format: "audio",
      }),
    });
    if (!res.ok) throw await failure(res);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), mime: res.headers.get("content-type") || "audio/wav" };
  });

export const askClaude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; instruction: string }) => {
    const instruction = String(d.instruction ?? "").trim();
    if (!instruction) throw new Error("Tell Claude what to do.");
    return { text: String(d.text ?? "").slice(0, 8000), instruction: instruction.slice(0, 1000) };
  })
  .handler(async ({ data, context }) => {
    await recordAIUsage(context, "claude", 1);
    const res = await fetch(`${GATEWAY}/v1/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        stream: true,
        system:
          "You are a voiceover script writer inside a voice studio. Return ONLY the finished script text that will be read aloud — no titles, notes, markdown, or commentary. Write for the ear: natural rhythm, clear sentences, spelled-out numbers.",
        messages: [
          {
            role: "user",
            content: `Current script:\n"""\n${data.text || "(empty)"}\n"""\n\nRequest: ${data.instruction}`,
          },
        ],
      }),
    });
    if (!res.ok || !res.body) throw await failure(res);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta")
            out += ev.delta.text;
          if (ev.type === "message_delta" && ev.delta?.stop_reason === "refusal") refused = true;
          if (ev.type === "error") throw new Error(ev.error?.message ?? "Claude failed.");
        } catch (e) {
          if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
        }
      }
    }
    if (refused) throw new Error("Claude declined this request.");
    if (!out.trim()) throw new Error("Claude returned nothing.");
    return { text: out.trim() };
  });

const MAX_UPLOAD = 25 * 1024 * 1024;

export const transcribeRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Upload a recording.");
    const file = d.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Upload a recording.");
    if (file.size > MAX_UPLOAD) throw new Error("Recordings must be under 25 MB.");
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/"))
      throw new Error("That file isn't audio or video.");
    const seconds = Number(d.get("seconds") ?? 0);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2147483647)
      throw new Error("Invalid recording duration.");
    return { file, seconds };
  })
  .handler(async ({ data, context }) => {
    await recordAIUsage(context, "transcription", data.seconds);
    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", data.file, data.file.name);
    form.append("response_format", "json");
    const [res, words] = await Promise.all([
      fetch(`${GATEWAY}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}` },
        body: form,
      }),
      wordTimings(data.file, context, data.seconds).catch((e) => {
        if (e instanceof UsageLimitError) throw e;
        console.error("word timings failed", e);
        return [] as TimedWord[];
      }),
    ]);
    if (!res.ok) throw await failure(res);
    const j = (await res.json()) as { text?: string };
    const text = (j.text ?? "").trim();
    if (!text) throw new Error("No speech was found in that recording.");
    return { text, words };
  });

/** A timed word. `sp` is a speaker label ("speaker_0", …) when the recording was diarized. */
type TimedWord = { w: string; s: number; e: number; sp?: string };

function cleanWords(list: unknown): TimedWord[] {
  if (!Array.isArray(list)) return [];
  const out: TimedWord[] = [];
  for (const x of list) {
    const w = String(x?.w ?? x?.text ?? "").trim();
    const s = Number(x?.s ?? x?.start);
    const e = Number(x?.e ?? x?.end);
    if (!w || !isFinite(s) || !isFinite(e) || e < s) continue;
    const prev = out[out.length - 1];
    const rawSp = x?.sp ?? x?.speaker_id ?? x?.speaker;
    const sp =
      rawSp === undefined || rawSp === null || rawSp === ""
        ? undefined
        : String(rawSp).slice(0, 40);
    out.push({
      w,
      s: Math.max(s, prev?.e ?? 0),
      e: Math.max(e, prev?.e ?? 0),
      ...(sp ? { sp } : {}),
    });
  }
  return out;
}

/** Times every spoken word. Uses ElevenLabs when the account has credits, otherwise an AI model. */
async function wordTimings(
  file: File,
  context: { supabase: SupabaseClient<Database>; userId: string },
  seconds: number,
): Promise<TimedWord[]> {
  const eleven = process.env["ELEVENLABS_API_KEY"];
  if (eleven) {
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("model_id", "scribe_v2");
    fd.append("diarize", "true");
    await recordAIUsage(context, "word_timings_elevenlabs", seconds);
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": eleven },
      body: fd,
    });
    if (r.ok) {
      const j = (await r.json()) as {
        words?: { text: string; start: number; end: number; type?: string; speaker_id?: string }[];
      };
      const words = cleanWords((j.words ?? []).filter((w) => (w.type ?? "word") === "word"));
      if (words.length) return words;
    }
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const format = ["wav", "mp3", "m4a", "ogg", "flac", "webm", "aac", "mp4"].includes(ext)
    ? ext
    : "mp3";
  await recordAIUsage(context, "word_timings_ai", seconds);
  const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Transcribe this recording verbatim, including filler words (um, uh), and time every word precisely to 0.01 seconds from the start of the file. If more than one person speaks, label each word with its speaker as "sp": "speaker_0", "speaker_1", … in order of first appearance. Return ONLY JSON: {"words":[{"w":"word","s":start,"e":end,"sp":"speaker_0"}]}',
            },
            { type: "input_audio", input_audio: { data: btoa(bin), format } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw await failure(res);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = j.choices?.[0]?.message?.content ?? "";
  const start = raw.indexOf("{");
  const parsed = JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1)) as { words?: unknown };
  return cleanWords(parsed.words);
}

const ELEVEN = "https://api.elevenlabs.io";

function elevenKey() {
  const k = process.env["ELEVENLABS_API_KEY"];
  if (!k) throw new Error("ElevenLabs isn't connected.");
  return k;
}

async function elevenFailure(res: Response) {
  const body = await res.text();
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j?.detail?.message ?? j?.detail ?? body;
  } catch {
    /* Keep the provider response when it is not JSON. */
  }
  if (res.status === 401) return new Error(`ElevenLabs refused the request: ${msg}`);
  return new Error(`ElevenLabs error (${res.status}): ${String(msg).slice(0, 300)}`);
}

export const cloneMyVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Upload a recording.");
    requireVoiceConsent(d.get("consent"));
    const file = d.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Upload a recording.");
    if (file.size > MAX_UPLOAD) throw new Error("Recordings must be under 25 MB.");
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/"))
      throw new Error("That file isn't audio or video.");
    const consentAudio = d.get("consent_audio");
    if (!(consentAudio instanceof File) || !consentAudio.size)
      throw new Error("Record the consent sentence first.");
    if (consentAudio.size > 5 * 1024 * 1024) throw new Error("The consent recording is too long.");
    if (!consentAudio.type.startsWith("audio/") && !consentAudio.type.startsWith("video/"))
      throw new Error("The consent recording isn't audio.");
    const speaker = String(d.get("consent_name") ?? "")
      .trim()
      .slice(0, 80);
    if (!speaker) throw new Error("Enter the speaker's name for the consent sentence.");
    return {
      file,
      consentAudio,
      speaker,
      name:
        String(d.get("name") ?? "My voice")
          .trim()
          .slice(0, 80) || "My voice",
    };
  })
  .handler(async ({ data, context }) => {
    await recordAIUsage(context, "voice_clone", 1);
    // 1. Check the spoken consent before copying anything.
    const cform = new FormData();
    cform.append("model", "openai/gpt-transcribe");
    cform.append("file", data.consentAudio, data.consentAudio.name || "consent.webm");
    cform.append("response_format", "json");
    const heard = await fetch(`${GATEWAY}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: cform,
    });
    if (!heard.ok) throw await failure(heard);
    const transcript = String(((await heard.json()) as { text?: string }).text ?? "");
    if (!consentMatches(transcript, data.speaker)) {
      throw new Error(
        "The consent recording didn't match the sentence. Read it clearly, word for word, and try again.",
      );
    }
    // 2. Keep the consent recording with the voice.
    const ext = data.consentAudio.type.includes("mp4")
      ? "m4a"
      : data.consentAudio.type.includes("wav")
        ? "wav"
        : data.consentAudio.type.includes("mpeg")
          ? "mp3"
          : "webm";
    const consentPath = `${context.userId}/consent/${crypto.randomUUID()}.${ext}`;
    const stored = await context.supabase.storage
      .from("clips")
      .upload(consentPath, data.consentAudio, {
        contentType: data.consentAudio.type || "audio/webm",
      });
    if (stored.error) throw new Error("Couldn't save the consent recording. Please try again.");
    const form = new FormData();
    form.append("name", `Vocalis – ${data.file.name}`.slice(0, 100));
    form.append("files", data.file, data.file.name);
    form.append("remove_background_noise", "true");
    const res = await fetch(`${ELEVEN}/v1/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey() },
      body: form,
    });
    if (!res.ok) {
      await context.supabase.storage.from("clips").remove([consentPath]);
      throw await elevenFailure(res);
    }
    const j = (await res.json()) as { voice_id: string };
    // Register before returning so closing the browser cannot abandon the clone.
    const { data: row, error } = await context.supabase
      .from("voices")
      .insert({
        name: data.name,
        eleven_voice_id: j.voice_id,
        user_id: context.userId,
        consent_path: consentPath,
        consented_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !row) {
      const cleanup = await fetch(`${ELEVEN}/v1/voices/${encodeURIComponent(j.voice_id)}`, {
        method: "DELETE",
        headers: { "xi-api-key": elevenKey() },
      });
      if (!cleanup.ok && cleanup.status !== 404)
        console.error("Failed to clean up unsaved voice", cleanup.status);
      await context.supabase.storage.from("clips").remove([consentPath]);
      throw new Error("Couldn't save the copied voice. Please try again.");
    }
    return { id: row.id, voiceId: j.voice_id };
  });

export const speakWithMyVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      text: string;
      voiceId: string;
      delivery?: Partial<Delivery>;
      speed?: number;
      preview?: boolean;
    }) => {
      const text = String(d.text ?? "").trim();
      if (!text) throw new Error("Write something first.");
      if (text.length > 5000) throw new Error("Keep scripts under 5,000 characters.");
      if (!/^[A-Za-z0-9]{10,40}$/.test(String(d.voiceId))) throw new Error("Invalid voice.");
      // Explicit speed (used by dubbing to fit timing) overrides the delivery pace. ElevenLabs accepts 0.7–1.2.
      const speed =
        d.speed === undefined ? null : Math.min(1.2, Math.max(0.7, Number(d.speed) || 1));
      return {
        text,
        voiceId: d.voiceId,
        delivery: d.delivery ? deliverySettings(d.delivery) : null,
        speed,
        preview: d.preview === true,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: owned, error } = await context.supabase
      .from("voices")
      .select("id")
      .eq("eleven_voice_id", data.voiceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !owned) throw new Error("Choose one of your saved voices.");
    if (data.preview) await reservePreview(context, data.text);
    else await recordAIUsage(context, "cloned_tts", data.text.length);
    const { spokenPronunciation } = await import("./pronunciation.server");
    const pronounced = await spokenPronunciation(context.supabase, context.userId, data.text);
    const res = await fetch(
      `${ELEVEN}/v1/text-to-speech/${data.voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": elevenKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: data.delivery ? elevenText(pronounced, data.delivery) : pronounced,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.85,
            use_speaker_boost: true,
            ...(data.speed !== null
              ? { speed: data.speed }
              : data.delivery
                ? { speed: deliverySpeed(data.delivery) }
                : {}),
          },
        }),
      },
    );
    if (!res.ok) throw await elevenFailure(res);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000)
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), mime: "audio/mpeg" };
  });
