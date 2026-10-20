const GATEWAY = "https://ai.gateway.lovable.dev";
export const CLAUDE_MODEL = "anthropic/claude-sonnet-5";

export function gatewayKey() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("AI is not configured.");
  return k;
}

export async function gatewayFailure(res: Response) {
  const body = await res.text();
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j?.error?.message ?? j?.message ?? body;
  } catch {
    // Not JSON — keep the raw body.
  }
  if (res.status === 402) return new Error("Out of AI credits. Please top up to continue.");
  if (res.status === 429) return new Error("Too many requests — wait a moment and try again.");
  return new Error(`AI request failed (${res.status}): ${String(msg).slice(0, 300)}`);
}

/** Calls Claude through the Lovable AI gateway (streamed) and returns the full text reply. */
export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(`${GATEWAY}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gatewayKey()}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 8000,
      stream: true,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok || !res.body) throw await gatewayFailure(res);
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
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta")
          out += ev.delta.text;
        if (ev.type === "message_delta" && ev.delta?.stop_reason === "refusal")
          throw new Error("Claude declined this request.");
        if (ev.type === "error") throw new Error(ev.error?.message ?? "Claude failed.");
      } catch (e) {
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      }
    }
  }
  if (!out.trim()) throw new Error("Claude returned nothing.");
  return out;
}

/** Extracts the first JSON array or object from a model reply. */
export function parseJsonReply<T>(text: string, kind: "array" | "object"): T {
  const [open, close] = kind === "array" ? ["[", "]"] : ["{", "}"];
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end < start)
    throw new Error("Claude's reply wasn't in the expected format — try again.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
