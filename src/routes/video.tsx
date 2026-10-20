import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clapperboard, Download, Film, ImageIcon, Loader2, Mic, Play, Square, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import { VOICES, generateSpeech } from "@/lib/studio.functions";
import { planScenes } from "@/lib/media.functions";
import { streamImage } from "@/lib/stream-image";
import { animate, download } from "@/lib/media-client";
import { audioSeconds, exportVideo } from "@/lib/video-export";

export const Route = createFileRoute("/video")({
  head: () => ({
    meta: [
      { title: "Video Studio — Vocalis" },
      { name: "description", content: "Turn any script into a narrated video with AI images and animated scenes — any length." },
      { property: "og:title", content: "Video Studio — Vocalis" },
      { property: "og:description", content: "Turn any script into a narrated video with AI images and animated scenes — any length." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VideoStudio,
});

type Scene = {
  id: string;
  narration: string;
  imagePrompt: string;
  motion: string;
  image?: string;
  imageFinal?: boolean;
  audio?: string;
  seconds?: number;
  video?: string;
  busy?: string;
};

function VideoStudio() {
  const { user } = useAuth();
  const plan = useServerFn(planScenes);
  const speak = useServerFn(generateSpeech);
  const [script, setScript] = useState("");
  const [look, setLook] = useState("cinematic, photorealistic");
  const [voice, setVoice] = useState<string>("Kore");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [planning, setPlanning] = useState(false);
  const [making, setMaking] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const patch = (id: string, p: Partial<Scene>) => setScenes((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function doPlan() {
    setPlanning(true);
    try {
      const r = await plan({ data: { script, look } });
      setScenes(r.scenes.map((s) => ({ ...s, id: crypto.randomUUID() })));
      toast.success(`${r.scenes.length} scenes planned`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPlanning(false);
    }
  }

  async function makeVoice(s: Scene) {
    patch(s.id, { busy: "Voicing…" });
    try {
      const r = await speak({ data: { text: s.narration, voice } });
      const audio = `data:${r.mime};base64,${r.audio}`;
      patch(s.id, { audio, seconds: await audioSeconds(audio), busy: undefined });
    } catch (e) {
      patch(s.id, { busy: undefined });
      throw e;
    }
  }

  async function makeImage(s: Scene) {
    patch(s.id, { busy: "Painting…", imageFinal: false });
    try {
      await streamImage("/api/generate-image", { prompt: `${s.imagePrompt}. Style: ${look}. Wide 16:9 composition, no text.` }, (image, f) => patch(s.id, { image, imageFinal: f }));
    } finally {
      patch(s.id, { busy: undefined });
    }
  }

  async function animateScene(s: Scene) {
    if (!user) return toast.error("Sign in to animate scenes.");
    if (!s.image) return toast.error("Create the image first.");
    patch(s.id, { busy: "Animating…" });
    try {
      const url = await animate({ prompt: `${s.imagePrompt}. Camera: ${s.motion}`, image: s.image, seconds: Math.min(10, Math.max(3, Math.ceil(s.seconds ?? 8))), onProgress: (p) => patch(s.id, { busy: `Animating… ${Math.round(p)}%` }) });
      patch(s.id, { video: url, busy: undefined });
    } catch (e) {
      patch(s.id, { busy: undefined });
      toast.error((e as Error).message);
    }
  }

  async function makeAll() {
    setMaking(true);
    try {
      for (const s of scenesRef.current) {
        const cur = scenesRef.current.find((x) => x.id === s.id);
        if (!cur) continue;
        if (!cur.audio) await makeVoice(cur);
        if (!cur.image) await makeImage(cur);
      }
      toast.success("All scenes ready — press Play.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMaking(false);
    }
  }

  async function doExport() {
    const missing = scenes.some((s) => !s.image || !s.audio);
    if (missing) return toast.error("Every scene needs a voice and an image first — use Make all scenes.");
    try {
      const blob = await exportVideo(
        scenes.map((s) => ({ image: s.image, video: s.video, audio: s.audio, seconds: s.seconds ?? 5 })),
        (i) => setExporting(`Recording scene ${i + 1} of ${scenes.length}… keep this tab open`),
      );
      download(URL.createObjectURL(blob), "vocalis-video.webm");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  }

  const total = scenes.reduce((a, s) => a + (s.seconds ?? 0), 0);

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">Video <span className="text-primary">studio</span></h1>
        <p className="mt-2 text-muted-foreground">Paste a script of any length. Claude splits it into scenes, each gets a voiceover and a picture — animate any scene into real motion.</p>

        <div className="mt-6 rounded-2xl border bg-card p-5">
          <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={7} placeholder="Paste or write your script here…" />
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Input value={look} onChange={(e) => setLook(e.target.value)} placeholder="Visual style, e.g. watercolor, anime, 1970s film" />
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Voice">
              {VOICES.map((v) => <option key={v}>{v}</option>)}
            </select>
            <Button onClick={doPlan} disabled={planning || !script.trim()}>
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Plan scenes
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{script.length.toLocaleString()} characters · no length limit on the finished video</p>
        </div>

        {scenes.length > 0 && (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Button onClick={makeAll} disabled={making}>{making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />} Make all scenes</Button>
              <Button variant="secondary" onClick={() => setPlaying(0)} disabled={!scenes.every((s) => s.image && s.audio)}><Play className="h-4 w-4" />Play</Button>
              <Button variant="secondary" onClick={doExport} disabled={!!exporting}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export video</Button>
              <span className="text-sm text-muted-foreground">{scenes.length} scenes · {Math.round(total)}s{exporting ? ` · ${exporting}` : ""}</span>
            </div>
            {playing !== null && <Player scenes={scenes} start={playing} onClose={() => setPlaying(null)} />}
            <div className="mt-6 flex flex-col gap-4">
              {scenes.map((s, i) => (
                <div key={s.id} className="grid gap-4 rounded-2xl border bg-card p-4 md:grid-cols-[320px_1fr]">
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                    {s.video ? <video src={s.video} muted loop autoPlay playsInline className="h-full w-full object-cover" />
                      : s.image ? <img src={s.image} alt="" className={`h-full w-full object-cover transition-[filter] ${s.imageFinal ? "blur-0" : "blur-xl"}`} />
                      : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>}
                    {s.busy && <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{s.busy}</div>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Scene {i + 1}{s.seconds ? ` · ${s.seconds.toFixed(1)}s` : ""}</span>
                      <Button size="icon" variant="ghost" aria-label="Remove scene" onClick={() => setScenes((xs) => xs.filter((x) => x.id !== s.id))}><Trash2 className="h-4 w-4" /></Button></div>
                    <Textarea value={s.narration} rows={2} onChange={(e) => patch(s.id, { narration: e.target.value, audio: undefined, seconds: undefined })} aria-label="Narration" />
                    <Input value={s.imagePrompt} onChange={(e) => patch(s.id, { imagePrompt: e.target.value })} aria-label="Picture description" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" disabled={!!s.busy} onClick={() => makeVoice(s).catch((e) => toast.error(e.message))}><Mic className="h-4 w-4" />{s.audio ? "Re-voice" : "Voice"}</Button>
                      <Button size="sm" variant="secondary" disabled={!!s.busy} onClick={() => makeImage(s).catch((e) => toast.error(e.message))}><ImageIcon className="h-4 w-4" />{s.image ? "New picture" : "Picture"}</Button>
                      <Button size="sm" variant="secondary" disabled={!!s.busy || !s.image} onClick={() => animateScene(s)}><Film className="h-4 w-4" />{s.video ? "Re-animate" : "Animate"}</Button>
                      {s.audio && <audio src={s.audio} controls className="h-8" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Player({ scenes, start, onClose }: { scenes: Scene[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const audio = useRef<HTMLAudioElement>(null);
  const s = scenes[i];
  useEffect(() => {
    if (!s) onClose();
    else audio.current?.play().catch(() => {});
  }, [i, s, onClose]);
  if (!s) return null;
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
      <div className="relative aspect-video bg-muted">
        {s.video ? <video key={s.id} src={s.video} muted loop autoPlay playsInline className="h-full w-full object-cover" />
          : <img key={s.id} src={s.image} alt="" className="h-full w-full animate-[kenburns_var(--d)_linear_forwards] object-cover" style={{ ["--d" as string]: `${s.seconds ?? 5}s` }} />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4 text-sm">{s.narration}</div>
      </div>
      <audio key={s.id} ref={audio} src={s.audio} onEnded={() => setI((x) => x + 1)} autoPlay />
      <div className="flex items-center justify-between p-3 text-sm text-muted-foreground">
        <span>Scene {i + 1} of {scenes.length}</span>
        <Button size="sm" variant="ghost" onClick={onClose}><Square className="h-4 w-4" />Stop</Button>
      </div>
    </div>
  );
}
