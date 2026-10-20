import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Circle, Loader2, Mic, Square, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/SiteHeader";
import { VoicePreview } from "@/components/VoicePreview";
import { useMicRecorder } from "@/hooks/useMicRecorder";
import { createVoice, listVoices, renameVoice } from "@/lib/voices";
import { deleteMyVoice } from "@/lib/media.functions";

export const Route = createFileRoute("/_authenticated/voices")({
  head: () => ({
    meta: [
      { title: "My Voices — Vocalis" },
      { name: "description", content: "Name, preview and manage the voices you've copied from your recordings." },
      { property: "og:title", content: "My Voices — Vocalis" },
      { property: "og:description", content: "Name, preview and manage the voices you've copied from your recordings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Voices,
});

function Voices() {
  const qc = useQueryClient();
  const remove = useServerFn(deleteMyVoice);
  const { data, isLoading, error } = useQuery({ queryKey: ["voices"], queryFn: listVoices });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(file: File) {
    if (file.size > 25 * 1024 * 1024) { toast.error("Recordings must be under 25 MB."); return; }
    setBusy(true);
    try {
      await createVoice(file, name || "My voice");
      setName("");
      toast.success("Voice saved");
      qc.invalidateQueries({ queryKey: ["voices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy that voice");
    } finally {
      setBusy(false);
    }
  }
  const mic = useMicRecorder((f) => void add(f));

  async function rename(id: string, value: string, old: string) {
    if (value.trim() === old) return;
    try {
      await renameVoice(id, value);
      qc.invalidateQueries({ queryKey: ["voices"] });
      toast.success("Renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  }
  async function del(id: string, n: string) {
    if (!confirm(`Delete "${n}"? This also removes it from your ElevenLabs account.`)) return;
    try {
      await remove({ data: { id } });
      qc.invalidateQueries({ queryKey: ["voices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">My <span className="text-primary">voices</span></h1>
        <p className="mt-2 text-muted-foreground">Copy a voice from a recording, give it a name, and use it in the Recording Editor.</p>

        <section className="mt-6 rounded-2xl border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Add a voice</h2>
          <p className="mt-1 text-xs text-muted-foreground">Best results: 30 seconds to 2 minutes of one person speaking clearly, no music.</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. My podcast voice" maxLength={80} />
            <input ref={input} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && add(e.target.files[0])} />
            <Button variant="outline" disabled={busy || mic.recording} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />Upload</Button>
            {mic.recording ? (
              <Button variant="destructive" onClick={mic.stop}><Square className="h-4 w-4" />Stop · {mic.clock}</Button>
            ) : (
              <Button variant="outline" disabled={busy} onClick={mic.start}><Circle className="h-4 w-4 fill-destructive text-destructive" />Record</Button>
            )}
          </div>
          {busy && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Copying the voice…</p>}
        </section>

        {isLoading && <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" />}
        {error && <p className="mt-8 text-destructive">{(error as Error).message}</p>}
        {data && data.length === 0 && (
          <div className="mt-10 flex flex-col items-center text-muted-foreground"><Mic className="h-10 w-10" /><p className="mt-2 text-sm">No voices yet — add one above.</p></div>
        )}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {data?.map((v) => (
            <div key={v.id} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={v.name}
                  aria-label="Voice name"
                  className="font-semibold"
                  maxLength={80}
                  onBlur={(e) => rename(v.id, e.target.value, v.name)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <Button size="icon" variant="ghost" aria-label={`Delete ${v.name}`} onClick={() => del(v.id, v.name)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Added {new Date(v.created_at).toLocaleDateString()}</p>
              <div className="mt-3"><VoicePreview voice={v} /></div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
