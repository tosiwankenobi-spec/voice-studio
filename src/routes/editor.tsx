import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Circle, Square, AudioLines, Download, RotateCcw, Sparkles, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { saveClip } from "@/lib/library";
import { Timeline, type TimelineApi } from "@/components/Timeline";
import { VoicePreview } from "@/components/VoicePreview";
import { VoiceConsent } from "@/components/VoiceConsent";
import { AISignIn } from "@/components/AISignIn";
import { audioExtension } from "@/lib/studio-validation";
import { createVoice, listVoices } from "@/lib/voices";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { deletedTimelineWords, isPureDeletion, type Word } from "@/lib/audio";
import { changedSpan, alignTranscriptWords } from '@/lib/patch';
import { SiteHeader } from "@/components/SiteHeader";
import { PronunciationHints } from '@/components/PronunciationHints';
import { askClaude, generateSpeech, speakWithMyVoice, transcribeRecording, VOICES } from "@/lib/studio.functions";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Recording Editor — Vocalis" },
      { name: "description", content: "Upload a recording, edit the transcript like a document, and re-speak it with AI." },
      { property: "og:title", content: "Recording Editor — Vocalis" },
      { property: "og:description", content: "Edit audio by editing text, then re-speak it with AI voices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Editor,
});

const MINE = "__mine__";

function Editor() {
  const transcribe = useServerFn(transcribeRecording);
  const speak = useServerFn(generateSpeech);
  const claude = useServerFn(askClaude);
  const input = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<{ url: string; name: string } | null>(null);
  const [transcript, setTranscript] = useState("");
  const [words, setWords] = useState<Word[]>([]);
  const [text, setText] = useState("");
  const tlApi = useRef<TimelineApi | null>(null);
  // Last transcript state whose words are in sync with the audio. Partly-erased words don't count,
  // so deleting a word letter by letter cuts it once it's fully gone.
  const synced = useRef("");
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onTextChange = (next: string) => {
    const api = tlApi.current;
    clearTimeout(syncTimer.current);
    if (api && words.length) {
      const ks = deletedTimelineWords(synced.current, next, api.timelineWords());
      if (ks.length) {
        if (!api.cutPlaced(ks)) return; // refused (would cut everything)
        synced.current = next;
      } else if (isPureDeletion(synced.current, next)) synced.current = next;
    } else synced.current = next;
    setText(next);
  };
  const [voice, setVoice] = useState<string>("Kore");
  const [busy, setBusy] = useState<"upload" | "speak" | "clean" | "patch" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const speakMine = useServerFn(speakWithMyVoice);
  const [file, setFile] = useState<File | null>(null);
  const [myVoiceId, setMyVoiceId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const { user } = useAuth();
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ["voices"], queryFn: listVoices, enabled: !!user });
  const savedVoice = voice.startsWith("saved:") ? saved.data?.find((v) => v.id === voice.slice(6)) : undefined;
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<{ rec: MediaRecorder; stream: MediaStream; timer: number } | null>(null);

  async function startRecording() {
    if (!user) { toast.error("Sign in to record and transcribe."); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("Microphone access was blocked. Allow it in your browser's address bar and try again.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = rec.mimeType || "audio/webm";
      const ext = mime.includes("mp4") ? "m4a" : "webm";
      const blob = new Blob(chunks, { type: mime.split(";")[0] ?? "audio/webm" });
      if (blob.size < 1000) { toast.error("That recording was empty."); return; }
      void onFile(new File([blob], `Microphone recording.${ext}`, { type: blob.type }));
    };
    rec.start(500);
    setRecSecs(0);
    const timer = window.setInterval(() => setRecSecs((s) => s + 1), 1000);
    recRef.current = { rec, stream, timer };
    setRecording(true);
  }

  function stopRecording() {
    const r = recRef.current;
    if (!r) return;
    clearInterval(r.timer);
    r.rec.stop();
    recRef.current = null;
    setRecording(false);
  }

  const recButton = recording ? (
    <Button variant="destructive" onClick={stopRecording}>
      <Square className="h-4 w-4" /> Stop recording · {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
    </Button>
  ) : (
    <Button variant="outline" onClick={startRecording} disabled={!!busy}>
      <Circle className="h-4 w-4 fill-destructive text-destructive" /> Record with microphone
    </Button>
  );

  async function onFile(file: File) {
    if (!user) { toast.error("Sign in to transcribe recordings."); return; }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Recordings must be under 25 MB.");
      return;
    }
    setOriginal({ url: URL.createObjectURL(file), name: file.name });
    setResult(null);
    setFile(file);
    setMyVoiceId(null);
    setConsent(false);
    setVoice(MINE);
    setBusy("upload");
    setWords([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const audio = new AudioContext();
      let duration = 0;
      try {
        const decoded = await audio.decodeAudioData(await file.arrayBuffer());
        duration = decoded.duration;
        fd.append("seconds", String(decoded.duration));
      } catch {
        // Some video containers cannot be decoded here; zero means unknown, not free usage.
        fd.append("seconds", "0");
      } finally {
        await audio.close();
      }
      const r = await transcribe({ data: fd });
      setTranscript(r.text);
      setText(r.text);
      synced.current = r.text;
      setWords(duration ? alignTranscriptWords(r.text, r.words, duration) : r.words);
      if (!r.words.length) toast.message("Word timings unavailable — splits will cut at the exact playhead.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setBusy(null);
    }
  }

  async function cleanUp() {
    if (!user) { toast.error("Sign in to use AI tools."); return; }
    setBusy("clean");
    try {
      const r = await claude({
        data: { text, instruction: "Remove filler words (um, uh, like, you know), false starts and repeated words. Keep the speaker's wording and meaning otherwise unchanged." },
      });
      onTextChange(r.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claude failed");
    } finally {
      setBusy(null);
    }
  }

  async function respeak(patchOnly = false) {
    if (!user) { toast.error("Sign in to re-speak recordings."); return; }
    if (voice === MINE && !myVoiceId && !consent) { toast.error("Confirm you have permission to copy this voice."); return; }
    const before = synced.current;
    const span = patchOnly ? changedSpan(before, text) : null;
    if (patchOnly && !span) { toast.error('Rewrite or add a word first.'); return; }
    const spokenText = span?.phrase ?? text;
    setBusy(patchOnly ? "patch" : "speak");
    try {
      let r;
      if (savedVoice) {
        setStatus(`Speaking as ${savedVoice.name}…`);
        r = await speakMine({ data: { text: spokenText, voiceId: savedVoice.eleven_voice_id } });
      } else if (voice === MINE) {
        if (!file) throw new Error("Upload a recording first.");
        let id = myVoiceId;
        if (!id) {
          setStatus("Learning your voice…");
          id = (await createVoice(file, file.name.replace(/\.[^.]+$/, ""), consent)).voiceId;
          qc.invalidateQueries({ queryKey: ["voices"] });
          toast.success("Voice saved to My Voices — rename it there.");
          setMyVoiceId(id);
        }
        setStatus("Speaking in your voice…");
        r = await speakMine({ data: { text: spokenText, voiceId: id } });
      } else {
        r = await speak({ data: { text: spokenText, voice } });
      }
      const url = `data:${r.mime};base64,${r.audio}`;
      if (patchOnly) {
        const api = tlApi.current;
        if (!api) throw new Error('Wait for the timeline to load.');
        setStatus('Matching and joining the patch…');
        await api.patch(before, text, url);
        synced.current = text;
        toast.success('Changed words patched');
        return;
      }
      setResult(url);
      if (user) {
        saveClip({ dataUrl: url, voice: savedVoice?.name ?? (voice === MINE ? "Your voice" : voice), text })
          .then(() => toast.success("Clip saved to your library"))
          .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save clip"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
      setStatus("");
    }
  }

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold md:text-5xl">
          Edit audio <span className="text-primary">like a document.</span>
        </h1>
        <p className="mt-2 text-muted-foreground">Upload a recording, fix the words, and re-speak it.</p>
        {!user && <AISignIn />}

        <input
          ref={input}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />

        {!original ? (
          <>
          <Button variant="outline" disabled={!user}
            onClick={() => input.current?.click()}
            className="mt-8 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-card p-16 text-muted-foreground hover:border-primary hover:text-foreground"
          >
            <Upload className="h-10 w-10 text-primary" />
            <span className="font-display text-xl font-bold text-foreground">Upload a recording</span>
            <span className="text-sm">Audio or video, up to 25 MB</span>
          </Button>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted-foreground">or {recButton}</div>
          </>
        ) : (
          <>
          {file && (
            <div className="mt-8">
              <Timeline
                file={file}
                words={words}
                apiRef={tlApi}
                onTranscriptSync={(next) => { synced.current = next; setText(next); }}
                onSave={user ? (blob) => {
                  saveClip({ dataUrl: URL.createObjectURL(blob), voice: "Edited recording", text: text || original.name })
                    .then(() => toast.success("Edit saved to your library"))
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save"));
                } : undefined}
              />
            </div>
          )}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <section className="rounded-2xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Transcript</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={!!busy || !text} onClick={cleanUp}>
                    {busy === "clean" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Remove filler words
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy || text === synced.current} onClick={() => setText(synced.current)}>
                    <RotateCcw className="h-4 w-4" /> Reset
                  </Button>
                </div>
              </div>
              {busy === "upload" ? (
                <div className="mt-6 flex min-h-[320px] items-center justify-center gap-2 rounded-xl bg-muted text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Transcribing your recording…
                </div>
              ) : (
                <Textarea
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  className="mt-4 min-h-[320px] border-0 bg-muted text-lg leading-relaxed"
                  maxLength={5000}
                />
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {busy === 'patch' ? status || 'Generating changed words…' : ''}
              </p>
              <PronunciationHints text={text} />
            </section>

            <aside className="flex flex-col gap-6">
              <div className="rounded-2xl border bg-card p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Original</h2>
                  <Button size="sm" variant="ghost" onClick={() => input.current?.click()} disabled={!!busy || recording}>
                    Replace
                  </Button>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{original.name}</p>
                <audio controls src={original.url} className="mt-3 w-full" />
                <div className="mt-3 [&>button]:w-full">{recButton}</div>
              </div>

              <div className="rounded-2xl border bg-card p-6">
                <h2 className="font-display text-lg font-bold">Re-speak with</h2>
                <p className="mt-1 text-xs text-muted-foreground">Use the speaker's real voice, or pick a stock voice.</p>
                <Button
                  className="mt-3 w-full"
                  variant={voice === MINE ? "default" : "outline"}
                  onClick={() => setVoice(MINE)}
                >
                  <Mic className="h-4 w-4" /> My real voice{myVoiceId ? " ✓" : ""}
                </Button>
                {voice === MINE && !myVoiceId && <VoiceConsent checked={consent} onChange={setConsent} />}
                {user && (saved.data?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>My saved voices</span>
                      <Link to="/voices" className="hover:text-foreground">Manage</Link>
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      {saved.data?.map((v) => (
                        <Button key={v.id} size="sm" variant={voice === `saved:${v.id}` ? "default" : "outline"} onClick={() => setVoice(`saved:${v.id}`)} className="justify-start">
                          <Mic className="h-4 w-4" /> {v.name}
                        </Button>
                      ))}
                    </div>
                    {savedVoice && <div className="mt-2"><VoicePreview voice={savedVoice} compact /></div>}
                  </div>
                )}
                <p className="mt-4 text-xs text-muted-foreground">Stock voices</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {VOICES.map((v) => (
                    <Button key={v} size="sm" variant={voice === v ? "default" : "outline"} onClick={() => setVoice(v)}>
                      {v}
                    </Button>
                  ))}
                </div>
                <Button className="mt-5 w-full shadow-glow" size="lg" disabled={!!busy || !words.length || !changedSpan(synced.current, text) || !user || (voice === MINE && !myVoiceId && !consent)} onClick={() => respeak(true)}>
                  {busy === 'patch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Patch changed words
                </Button>
                <Button variant="outline" className="mt-3 w-full" size="lg" disabled={!!busy || !text.trim() || !user || (voice === MINE && !myVoiceId && !consent)} onClick={() => respeak()}>
                  {busy === "speak" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
                  {(busy === 'speak' && status) || "Re-speak everything"}
                </Button>
                {result && (
                  <div className="mt-4 rounded-xl bg-muted p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Edited version · {savedVoice?.name ?? (voice === MINE ? "Your voice" : voice)}</span>
                      <a href={result} download={`vocalis-edit.${audioExtension(result.slice(5, result.indexOf(";")))}`} aria-label="Download">
                        <Download className="h-4 w-4 hover:text-primary" />
                      </a>
                    </div>
                    <audio controls src={result} className="w-full" />
                  </div>
                )}
              </div>
            </aside>
          </div>
          </>
        )}
      </main>
    </div>
  );
}
