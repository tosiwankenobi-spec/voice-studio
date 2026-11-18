import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Sparkles, Wand2, AudioLines, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScriptGenerator } from "@/components/ScriptGenerator";
import { SiteHeader } from "@/components/SiteHeader";
import { AISignIn } from "@/components/AISignIn";
import { useAuth } from "@/hooks/useAuth";
import { saveClip, saveScript } from "@/lib/library";
import { supabase } from "@/integrations/supabase/client";
import { askClaude, generateSpeech, VOICES } from "@/lib/studio.functions";
import { LineTakes } from "@/components/LineTakes";
import { CostHint } from "@/components/CostHint";
import { FREE_PREVIEW_CHARS } from "@/lib/costs";
import { sentences } from "@/lib/take-delivery";
import { taggedDownloadUrl } from "@/lib/ai-tag";
import { download } from "@/lib/media-client";
import { PronunciationHints } from "@/components/PronunciationHints";

export const Route = createFileRoute("/voice")({
  validateSearch: (s: Record<string, unknown>): { script?: string; idea?: string } => ({
    ...(typeof s["script"] === "string" ? { script: s["script"] as string } : {}),
    ...(typeof s["idea"] === "string" ? { idea: s["idea"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Voice Studio — Vocalis" },
      {
        name: "description",
        content: "Write with Claude, then turn scripts into natural AI voiceovers in seconds.",
      },
      { property: "og:title", content: "Voice Studio — Vocalis" },
      {
        property: "og:description",
        content: "Write with Claude, then turn scripts into natural AI voiceovers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

const QUICK = [
  "Polish for voiceover",
  "Make it shorter",
  "Make it more energetic",
  "Write a 30-second podcast intro",
];
const STYLES = [
  "",
  "Say warmly",
  "Say with excitement",
  "Say calmly and slowly",
  "Say like a news anchor",
  "Whisper",
];

type Take = { id: string; url: string; voice: string; text: string };

function Studio() {
  const { script: scriptParam, idea } = Route.useSearch();
  const speak = useServerFn(generateSpeech);
  const claude = useServerFn(askClaude);
  const [text, setText] = useState(idea ?? "");
  const [voice, setVoice] = useState<string>("Kore");
  const [style, setStyle] = useState("");
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState<"voice" | "claude" | "preview" | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const { user } = useAuth();
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const loaded = useRef(false);
  const saving = useRef<Promise<string> | null>(null);
  const scriptIdRef = useRef<string | null>(null);
  async function ensureScript() {
    if (saving.current) return saving.current;
    const promise = saveScript(text, scriptIdRef.current);
    saving.current = promise;
    try {
      const id = await promise;
      scriptIdRef.current = id;
      setScriptId(id);
      setSaveState("saved");
      return id;
    } finally {
      saving.current = null;
    }
  }

  // Open a saved script from the library
  useEffect(() => {
    if (!scriptParam || !user) return;
    let cancelled = false;
    supabase
      .from("scripts")
      .select("id, content")
      .eq("id", scriptParam)
      .maybeSingle()
      .then(({ data }) => {
        if (data && !cancelled) {
          loaded.current = true;
          setScriptId(data.id);
          scriptIdRef.current = data.id;
          setText(data.content);
          setSaveState("saved");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scriptParam, user]);

  // Auto-save the script while signed in
  useEffect(() => {
    if (!user || !text.trim()) return;
    if (loaded.current) {
      loaded.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await ensureScript();
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, user]);

  async function runClaude(instruction: string) {
    if (!user) {
      toast.error("Sign in to use AI tools.");
      return;
    }
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

  const firstSentence = (sentences(text)[0] ?? "").slice(0, FREE_PREVIEW_CHARS);

  async function runPreview() {
    if (!user) {
      toast.error("Sign in to preview voices.");
      return;
    }
    setBusy("preview");
    try {
      const r = await speak({ data: { text: firstSentence, voice, style, preview: true } });
      const url = `data:${r.mime};base64,${r.audio}`;
      setTakes((t) => [
        { id: crypto.randomUUID(), url, voice: `${voice} · free preview`, text: firstSentence },
        ...t,
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function runVoice() {
    if (!user) {
      toast.error("Sign in to generate speech.");
      return;
    }
    setBusy("voice");
    try {
      const r = await speak({ data: { text, voice, style } });
      const url = `data:${r.mime};base64,${r.audio}`;
      setTakes((t) => [{ id: crypto.randomUUID(), url, voice, text }, ...t]);
      if (user) {
        saveClip({ dataUrl: url, voice, text, scriptId })
          .then(() => toast.success("Clip saved to your library"))
          .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save clip"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  const title = text.trim()
    ? text.trim().split(/\s+/).slice(0, 7).join(" ")
    : "Untitled voiceover";
  const savedLabel = !user
    ? "Preview mode"
    : saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved just now"
        : "Auto-saves as you type";

  return (
    <div className="min-h-screen bg-background font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Voice Studio · {savedLabel}</p>
            <h1 className="mt-1 max-w-3xl truncate font-display text-3xl font-bold md:text-4xl">{title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!busy || !firstSentence || !user} onClick={runPreview}>
              {busy === "preview" && <Loader2 className="h-4 w-4 animate-spin" />}
              Preview first line · Free
            </Button>
            <Button
              disabled={!takes[0]}
              onClick={async () => {
                const latest = takes[0];
                if (latest) download(await taggedDownloadUrl(latest.url), "vocalis-voiceover.wav");
              }}
            >
              <Download className="h-4 w-4" />Export audio
            </Button>
          </div>
        </header>
        {!user && <AISignIn />}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
          <span className="flex items-center gap-2 px-2 text-sm font-semibold text-accent"><Sparkles className="h-4 w-4" />Claude</span>
          {QUICK.map((q) => (
            <Button key={q} size="sm" variant="outline" className="rounded-full" disabled={!!busy || !user} onClick={() => runClaude(q)}>{q}</Button>
          ))}
        </div>
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0">
            <section className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold">Script</h2>
                <span className="font-mono text-xs text-muted-foreground">{text.length}/5000</span>
              </div>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your script… or ask Claude to write one."
                className="mt-4 min-h-52 resize-y border-0 bg-background text-[17px] leading-relaxed"
                maxLength={5000}
              />
              {!user && (
                <p className="mt-2 text-xs text-muted-foreground"><Link to="/auth" className="text-primary hover:underline">Sign in to save your work</Link></p>
              )}
              <PronunciationHints text={text} />
              <ScriptGenerator onScript={setText} disabled={!!busy || !user} />
              <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) runClaude(ask); }}>
                <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask Claude anything about your script…" />
                <Button type="submit" variant="secondary" disabled={!!busy || !ask.trim() || !user} aria-label="Ask Claude">
                  {busy === "claude" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                </Button>
              </form>
            </section>
            <LineTakes
              text={text}
              scriptId={scriptId}
              ensureScript={ensureScript}
              voice={voice}
              style={style}
              signedIn={!!user}
              disabled={!!busy}
              onVoiceChange={setVoice}
            />
          </div>
          <aside className="flex min-w-0 flex-col gap-5">
            <section className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between px-1"><h2 className="font-display text-lg font-bold">Voice</h2><Link to="/voices" className="text-xs font-semibold text-primary">Browse all</Link></div>
              <div className="mt-3 space-y-2">
                {VOICES.map((v) => (
                  <button key={v} onClick={() => setVoice(v)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${voice === v ? "border-primary bg-primary/15" : "bg-background hover:border-muted-foreground"}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${voice === v ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>{v[0]}</span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{v}</span><span className="text-xs text-muted-foreground">Stock voice</span></span>
                    <AudioLines className={`h-4 w-4 ${voice === v ? "text-primary" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border bg-card p-4">
              <h2 className="font-display text-lg font-bold">Delivery</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <Button key={s} size="sm" variant={style === s ? "default" : "outline"} className="rounded-full" onClick={() => setStyle(s)}>
                    {s ? s.replace("Say ", "").replace("with ", "") : "Natural"}
                  </Button>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-primary/60 bg-card p-4">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{sentences(text).length} lines · {text.length} characters</span><CostHint kind="tts" units={text.length} /></div>
              <Button className="mt-4 w-full" size="lg" disabled={!!busy || !text.trim() || !user} onClick={runVoice}>
                {busy === "voice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
                {busy === "voice" ? "Generating…" : "Generate voice"}
              </Button>
            </section>
            <section className="rounded-2xl border bg-card p-4">
              <h2 className="font-display text-lg font-bold">Generated takes</h2>
              {!takes.length && <p className="mt-2 text-sm text-muted-foreground">Generated audio appears here.</p>}
              <div className="mt-3 flex flex-col gap-3">
                {takes.map((t, i) => (
                  <div key={t.id} className="rounded-xl bg-background p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Take {takes.length - i} · {t.voice}</span>
                      <div className="flex gap-1">
                        <button aria-label="Download" onClick={async () => download(await taggedDownloadUrl(t.url), `vocalis-take-${takes.length - i}.wav`)}><Download className="h-4 w-4 hover:text-primary" /></button>
                        <button aria-label="Delete" onClick={() => setTakes((x) => x.filter((y) => y.id !== t.id))}><Trash2 className="h-4 w-4 hover:text-destructive" /></button>
                      </div>
                    </div>
                    <audio controls src={t.url} className="w-full" />
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{t.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
