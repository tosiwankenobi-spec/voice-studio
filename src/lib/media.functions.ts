import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev";
const CLAUDE_MODEL = "anthropic/claude-sonnet-5";
const VIDEO_MODEL = "google/gemini-omni-1.1-flash";

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
  } catch {}
  if (res.status === 402) return new Error("Out of AI credits. Please top up to continue.");
  if (res.status === 429) return new Error("Too many requests — wait a moment and try again.");
  return new Error(`AI request failed (${res.status}): ${String(msg).slice(0, 300)}`);
}

export type PlannedScene = { narration: string; imagePrompt: string; motion: string };

export const planScenes = createServerFn({ method: "POST" })
  .inputValidator((d: { script: string; look?: string }) => {
    const script = String(d.script ?? "").trim();
    if (!script) throw new Error("Write or paste a script first.");
    if (script.length > 60000) throw new Error("Keep scripts under 60,000 characters.");
    return { script, look: String(d.look ?? "").slice(0, 300) };
  })
  .handler(async ({ data }) => {
    const res = await fetch(`${GATEWAY}/v1/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 32000,
        stream: true,
        system:
          'You turn a voiceover script into video scenes. Split the WHOLE script, word for word, into consecutive scenes of 1-3 sentences (roughly 5-15 seconds of speech each). Never skip, shorten or rewrite narration. For each scene write a vivid, specific image prompt (subject, setting, lighting, camera framing, style) that illustrates it, and a short camera/motion description for animating it. Keep a consistent visual style across scenes. Return ONLY a JSON array: [{"narration":"...","imagePrompt":"...","motion":"..."}]. No markdown.',
        messages: [{ role: "user", content: `Visual style: ${data.look || "cinematic, photorealistic"}\n\nScript:\n"""\n${data.script}\n"""` }],
      }),
    });
    if (!res.ok || !res.body) throw await failure(res);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
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
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") out += ev.delta.text;
          if (ev.type === "message_delta" && ev.delta?.stop_reason === "refusal") throw new Error("Claude declined this request.");
          if (ev.type === "error") throw new Error(ev.error?.message ?? "Claude failed.");
        } catch (e) {
          if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
        }
      }
    }
    const start = out.indexOf("[");
    const end = out.lastIndexOf("]");
    if (start < 0 || end < start) throw new Error("Couldn't plan scenes — try again.");
    const arr = JSON.parse(out.slice(start, end + 1)) as PlannedScene[];
    const scenes = arr
      .filter((s) => s && typeof s.narration === "string" && s.narration.trim())
      .map((s) => ({
        narration: s.narration.trim(),
        imagePrompt: String(s.imagePrompt ?? s.narration).trim(),
        motion: String(s.motion ?? "slow cinematic push-in").trim(),
      }));
    if (!scenes.length) throw new Error("Couldn't plan scenes — try again.");
    return { scenes };
  });

export const startVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; image?: string | undefined; seconds?: number | undefined }) => {
    const prompt = String(d.prompt ?? "").trim().slice(0, 3000);
    if (!prompt) throw new Error("Describe the motion first.");
    const seconds = Math.min(10, Math.max(3, Math.round(Number(d.seconds) || 8)));
    let image: { data: string; mime: string } | null = null;
    if (d.image) {
      const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(d.image);
      if (!m) throw new Error("Unsupported image.");
      if (!m || !m[1] || !m[2]) throw new Error("Unsupported image.");
      if (m[2].length > 20_000_000) throw new Error("Image is too large.");
      image = { mime: m[1], data: m[2] };
    }
    return { prompt, seconds, image };
  })
  .handler(async ({ data }) => {
    const text = `${data.prompt}. In a single continuous shot, no scene cuts. No dialogue. Soft ambient sound only.`;
    const input = data.image
      ? [
          { type: "image", data: data.image.data, mime_type: data.image.mime },
          { type: "text", text: `Animate this image <FIRST_FRAME>: ${text}` },
        ]
      : text;
    const res = await fetch(`${GATEWAY}/v1/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VIDEO_MODEL,
        input,
        response_format: { type: "video", resolution: "720p", duration: `${data.seconds}s`, aspect_ratio: "16:9" },
      }),
    });
    if (!res.ok) throw await failure(res);
    const job = (await res.json()) as { id: string };
    return { id: job.id };
  });

export const checkVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; prompt?: string }) => {
    const id = String(d.id ?? "");
    if (!/^[\w-]+$/.test(id)) throw new Error("Bad job id.");
    return { id, prompt: String(d.prompt ?? "").slice(0, 2000) };
  })
  .handler(async ({ data, context }) => {
    const res = await fetch(`${GATEWAY}/v1/videos/${data.id}`, { headers: { Authorization: `Bearer ${key()}` } });
    if (!res.ok) throw await failure(res);
    const job = (await res.json()) as { status: string; progress?: number; error?: { message?: string } };
    if (job.status === "failed") {
      return { status: "failed" as const, error: job.error?.message ?? "Video generation failed.", url: null, progress: 0 };
    }
    if (job.status !== "completed") {
      return { status: "working" as const, progress: job.progress ?? 0, url: null, error: null };
    }
    const path = `${context.userId}/videos/${data.id}.mp4`;
    const sb = context.supabase;
    const existing = await sb.storage.from("clips").list(`${context.userId}/videos`, { search: `${data.id}.mp4` });
    if (!existing.data?.length) {
      const dl = await fetch(`${GATEWAY}/v1/videos/${data.id}/content`, { headers: { Authorization: `Bearer ${key()}` } });
      if (!dl.ok) throw await failure(dl);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const up = await sb.storage.from("clips").upload(path, bytes, { contentType: "video/mp4", upsert: true });
      if (up.error) throw new Error(up.error.message);
      await sb.from("media").insert({ kind: "video", prompt: data.prompt, storage_path: path, user_id: context.userId });
    }
    const signed = await sb.storage.from("clips").createSignedUrl(path, 3600 * 6);
    if (signed.error) throw new Error(signed.error.message);
    return { status: "done" as const, url: signed.data.signedUrl, progress: 100, error: null };
  });
