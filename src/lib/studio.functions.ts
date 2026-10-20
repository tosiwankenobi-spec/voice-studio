import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://ai.gateway.lovable.dev";
const TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
const CLAUDE_MODEL = "anthropic/claude-sonnet-5";

export const VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"] as const;

function key() {
  const k = process.env.LOVABLE_API_KEY;
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

export const generateSpeech = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; voice: string; style?: string }) => {
    const text = String(d.text ?? "").trim();
    if (!text) throw new Error("Write something first.");
    if (text.length > 5000) throw new Error("Keep scripts under 5,000 characters.");
    const voice = (VOICES as readonly string[]).includes(d.voice) ? d.voice : "Kore";
    return { text, voice, style: String(d.style ?? "").slice(0, 200) };
  })
  .handler(async ({ data }) => {
    const spoken = data.style ? `${data.style}: ${data.text}` : data.text;
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
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), mime: res.headers.get("content-type") || "audio/wav" };
  });

export const askClaude = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; instruction: string }) => {
    const instruction = String(d.instruction ?? "").trim();
    if (!instruction) throw new Error("Tell Claude what to do.");
    return { text: String(d.text ?? "").slice(0, 8000), instruction: instruction.slice(0, 1000) };
  })
  .handler(async ({ data }) => {
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
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") out += ev.delta.text;
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
