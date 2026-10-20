import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles, Wand2, AudioLines, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScriptGenerator } from "@/components/ScriptGenerator";
import { SiteHeader } from "@/components/SiteHeader";
import { askClaude, generateSpeech, VOICES } from "@/lib/studio.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vocalis — AI Voice Studio" },
      { name: "description", content: "Write with Claude, then turn scripts into natural AI voiceovers in seconds." },
      { property: "og:title", content: "Vocalis — AI Voice Studio" },
      { property: "og:description", content: "Write with Claude, then turn scripts into natural AI voiceovers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

const QUICK = ["Polish for voiceover", "Make it shorter", "Make it more energetic", "Write a 30-second podcast intro"];
const STYLES = ["", "Say warmly", "Say with excitement", "Say calmly and slowly", "Say like a news anchor", "Whisper"];

type Take = { id: string; url: string; voice: string; text: string };

function Studio() {
  const speak = useServerFn(generateSpeech);
  const claude = useServerFn(askClaude);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string>("Kore");
  const [style, setStyle] = useState("");
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState<"voice" | "claude" | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);

  async function runClaude(instruction: string) {
    setBusy("claude");
    try {
      const r = await claude({ data: { text, instruction } });
      setText(r.text);
      setAsk("");
      toast.success("Claude updated your script");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claude failed");
    } finally {
      setBusy(null);
    }
  }

  async function runVoice() {
    setBusy("voice");
    try {
      const r = await speak({ data: { text, voice, style } });
      const url = `data:${r.mime};base64,${r.audio}`;
      setTakes((t) => [{ id: crypto.randomUUID(), url, voice, text }, ...t]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />

      <main className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border bg-card p-6">
          <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
            Your words, <span className="text-primary">beautifully voiced.</span>
          </h1>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste your script… or ask Claude to write one."
            className="mt-6 min-h-[280px] resize-y border-0 bg-muted text-lg leading-relaxed"
            maxLength={5000}
          />
          <div className="mt-2 text-right text-xs text-muted-foreground">{text.length}/5000</div>

          <ScriptGenerator onScript={setText} disabled={!!busy} />

          <div className="mt-4 rounded-xl border bg-secondary p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-accent" /> Claude writing assistant
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <Button key={q} size="sm" variant="outline" disabled={!!busy} onClick={() => runClaude(q)}>
                  {q}
                </Button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (ask.trim()) runClaude(ask);
              }}
            >
              <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask Claude anything about your script…" />
              <Button type="submit" variant="secondary" disabled={!!busy || !ask.trim()}>
                {busy === "claude" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="font-display text-lg font-bold">Voice</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {VOICES.map((v) => (
                <Button key={v} variant={voice === v ? "default" : "outline"} size="sm" onClick={() => setVoice(v)}>
                  {v}
                </Button>
              ))}
            </div>
            <h2 className="mt-5 font-display text-lg font-bold">Delivery</h2>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="mt-3 w-full rounded-md border bg-muted px-3 py-2 text-sm"
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>{s || "Natural"}</option>
              ))}
            </select>
            <Button className="mt-5 w-full shadow-glow" size="lg" disabled={!!busy || !text.trim()} onClick={runVoice}>
              {busy === "voice" ? (
                <span className="flex items-end gap-0.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="h-4 w-1 rounded bg-primary-foreground animate-wave" style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                  <span className="ml-2">Generating…</span>
                </span>
              ) : (
                <>
                  <AudioLines className="h-4 w-4" /> Generate voice
                </>
              )}
            </Button>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="font-display text-lg font-bold">Takes</h2>
            {takes.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Generated audio appears here.</p>}
            <div className="mt-3 flex flex-col gap-4">
              {takes.map((t, i) => (
                <div key={t.id} className="rounded-xl bg-muted p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Take {takes.length - i} · {t.voice}</span>
                    <div className="flex gap-1">
                      <a href={t.url} download={`vocalis-take-${takes.length - i}.wav`} aria-label="Download">
                        <Download className="h-4 w-4 hover:text-primary" />
                      </a>
                      <button aria-label="Delete" onClick={() => setTakes((x) => x.filter((y) => y.id !== t.id))}>
                        <Trash2 className="h-4 w-4 hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                  <audio controls src={t.url} className="w-full" />
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
