import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AudioLines, Download, Loader2, RefreshCw, Save, Users } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { AISignIn } from "@/components/AISignIn";
import { CostHint } from "@/components/CostHint";
import { PronunciationHints } from "@/components/PronunciationHints";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { VOICES, generateSpeech, speakWithMyVoice } from "@/lib/studio.functions";
import { listVoices } from "@/lib/voices";
import { defaultCast, gapAfter, parseDialogue, speakersOf } from "@/lib/dialogue";
import { joinAudio } from "@/lib/join-audio";
import { saveClip } from "@/lib/library";
import { taggedDownloadUrl } from "@/lib/ai-tag";
import { download } from "@/lib/media-client";

export const Route = createFileRoute("/dialogue")({
  head: () => ({
    meta: [
      { title: "Multi-voice — Vocalis" },
      {
        name: "description",
        content:
          "Write a dialogue or podcast script with several speakers and give each one a voice.",
      },
      { property: "og:title", content: "Multi-voice — Vocalis" },
      { property: "og:description", content: "Give every speaker in your script their own voice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dialogue,
});

const EXAMPLE = `HOST: Welcome back to Small Shop Stories. Today I'm talking with a candle maker from Regina.
GUEST: Thanks for having me! I started pouring candles in my kitchen three years ago.
HOST: And now you ship across Canada. What changed?
GUEST: Honestly? Better photos, and finally writing product descriptions that sound like me.`;

function Dialogue() {
  const { user } = useAuth();
  const speak = useServerFn(generateSpeech);
  const speakMine = useServerFn(speakWithMyVoice);
  const voices = useQuery({ queryKey: ["voices"], queryFn: listVoices, enabled: !!user });
  const [script, setScript] = useState(EXAMPLE);
  const [cast, setCast] = useState<Record<string, string>>({});
  const [clips, setClips] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [mix, setMix] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (mix) URL.revokeObjectURL(mix);
    },
    [mix],
  );

  const lines = useMemo(() => parseDialogue(script), [script]);
  const speakers = useMemo(() => speakersOf(lines), [lines]);
  const castFor = (sp: string) => cast[sp] ?? defaultCast(speakers, VOICES)[sp] ?? "Kore";
  const keyOf = (i: number) =>
    `${i}|${lines[i]!.speaker}|${castFor(lines[i]!.speaker)}|${lines[i]!.text}`;
  const tooLong = lines.find((l) => l.text.length > 5000);

  async function voiceLine(i: number) {
    const l = lines[i]!;
    const v = castFor(l.speaker);
    const mine = v.startsWith("saved:") ? voices.data?.find((x) => x.id === v.slice(6)) : undefined;
    const r = mine
      ? await speakMine({ data: { text: l.text, voiceId: mine.eleven_voice_id } })
      : await speak({ data: { text: l.text, voice: v } });
    const url = `data:${r.mime};base64,${r.audio}`;
    setClips((c) => ({ ...c, [keyOf(i)]: url }));
    return url;
  }

  async function generateAll() {
    if (!user) {
      toast.error("Sign in to generate speech.");
      return;
    }
    setBusy("all");
    setMix(null);
    try {
      const urls: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        setBusy(`Voicing line ${i + 1} of ${lines.length}…`);
        urls.push(clips[keyOf(i)] ?? (await voiceLine(i)));
      }
      setBusy("Mixing…");
      const wav = await joinAudio(urls.map((url, i) => ({ url, pause: gapAfter(lines, i) })));
      setMix(URL.createObjectURL(wav));
      toast.success("Your conversation is ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!mix) return;
    try {
      await saveClip({
        dataUrl: mix,
        voice: speakers
          .map((s) => `${s}: ${castFor(s).replace(/^saved:.*/, "your voice")}`)
          .join(", ")
          .slice(0, 200),
        text: script,
      });
      toast.success("Saved to My Library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  const missing = lines.map((l, i) => (clips[keyOf(i)] ? null : l)).filter(Boolean) as typeof lines;
  const stockChars = missing
    .filter((l) => !castFor(l.speaker).startsWith("saved:"))
    .map((l) => l.text.length);
  const minechars = missing
    .filter((l) => castFor(l.speaker).startsWith("saved:"))
    .map((l) => l.text.length);

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border bg-card p-6">
          <h1 className="font-display text-4xl font-bold">
            Many voices, <span className="text-primary">one script.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start lines with a speaker name and a colon (<code>HOST:</code>) or brackets (
            <code>[Sam]</code>). Lines without a name continue the last speaker.
          </p>
          {!user && <AISignIn />}
          <Textarea
            value={script}
            disabled={!!busy}
            onChange={(e) => {
              setScript(e.target.value);
              setMix(null);
            }}
            className="mt-4 min-h-[260px] bg-muted font-mono text-sm leading-relaxed"
            aria-label="Dialogue script"
          />
          <PronunciationHints text={script} />
          {tooLong && (
            <p className="mt-2 text-sm text-destructive">
              One line is over 5,000 characters — split it up.
            </p>
          )}
          <div className="mt-4 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/60 p-2 text-sm">
                <span className="w-24 shrink-0 truncate font-semibold text-primary">
                  {l.speaker}
                </span>
                <span className="min-w-0 flex-1">{l.text}</span>
                {clips[keyOf(i)] && (
                  <audio src={clips[keyOf(i)]} controls className="h-7 w-36 shrink-0" />
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  aria-label={`Re-voice line ${i + 1}`}
                  disabled={!user || !!busy}
                  onClick={() => {
                    setBusy(`Voicing line ${i + 1}…`);
                    voiceLine(i)
                      .catch((e) => toast.error(e.message))
                      .finally(() => setBusy(null));
                    setMix(null);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
        <aside className="flex flex-col gap-6">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Users className="h-5 w-5 text-primary" />
              Cast
            </h2>
            <div className="mt-3 space-y-3">
              {speakers.map((sp) => (
                <label key={sp} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{sp}</span>
                  <select
                    value={castFor(sp)}
                    disabled={!!busy}
                    onChange={(e) => {
                      setCast((c) => ({ ...c, [sp]: e.target.value }));
                      setMix(null);
                    }}
                    className="h-9 w-40 rounded-md border bg-background px-2"
                    aria-label={`Voice for ${sp}`}
                  >
                    {VOICES.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                    {voices.data?.map((v) => (
                      <option key={v.id} value={`saved:${v.id}`}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {!speakers.length && (
                <p className="text-sm text-muted-foreground">Write a script to see the speakers.</p>
              )}
            </div>
            <Button
              className="mt-5 w-full shadow-glow"
              size="lg"
              disabled={!user || !lines.length || !!busy || !!tooLong}
              onClick={generateAll}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AudioLines className="h-4 w-4" />
              )}
              {busy && busy !== "all" ? busy : "Generate conversation"}
            </Button>
            <div className="mt-2 text-center">
              <CostHint kind="tts" units={stockChars} />
              {minechars.length > 0 && (
                <>
                  {" "}
                  + <CostHint kind="cloned_tts" units={minechars} />
                </>
              )}
            </div>
          </div>
          {mix && (
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="font-display text-lg font-bold">Conversation</h2>
              <audio src={mix} controls className="mt-3 w-full" />
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={async () =>
                    download(await taggedDownloadUrl(mix), "vocalis-conversation.wav")
                  }
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button size="sm" variant="outline" onClick={save}>
                  <Save className="h-4 w-4" />
                  Save to library
                </Button>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
