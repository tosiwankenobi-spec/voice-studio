import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CostHint } from "@/components/CostHint";
import { useAuth } from "@/hooks/useAuth";
import { VOICES, generateSpeech, speakWithMyVoice } from "@/lib/studio.functions";
import { translateLines } from "@/lib/voice.functions";
import { DUB_LANGUAGES, fitSpeed, paceFor } from "@/lib/dub";
import { listVoices } from "@/lib/voices";
import { clipSeconds } from "@/lib/join-audio";
import { taggedDownloadUrl } from "@/lib/ai-tag";
import { download } from "@/lib/media-client";

/**
 * Translate & dub: translates the transcript, re-speaks it in the speaker's copied voice (or a stock
 * voice) and nudges the speed once so the dub runs about as long as the original recording.
 */
export function DubPanel({ text, sourceUrl }: { text: string; sourceUrl: string | null }) {
  const { user } = useAuth();
  const translate = useServerFn(translateLines);
  const speak = useServerFn(generateSpeech);
  const speakMine = useServerFn(speakWithMyVoice);
  const voices = useQuery({ queryKey: ["voices"], queryFn: listVoices, enabled: !!user });
  const [lang, setLang] = useState("fr");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState("");
  const [out, setOut] = useState<{ text: string; url: string; mime: string; lang: string } | null>(
    null,
  );
  const chosen = voice || (voices.data?.[0] ? `saved:${voices.data[0].id}` : "Kore");

  async function run() {
    if (!user || !text.trim()) return;
    setOut(null);
    try {
      setBusy("Translating…");
      const t = (await translate({ data: { lines: [text], language: lang } })).lines[0] ?? "";
      if (t.length > 5000)
        throw new Error("The translation is over 5,000 characters. Dub a shorter recording.");
      const mine = chosen.startsWith("saved:")
        ? voices.data?.find((v) => v.id === chosen.slice(6))
        : undefined;
      const say = async (speed?: number) => {
        const r = mine
          ? await speakMine({
              data: { text: t, voiceId: mine.eleven_voice_id, ...(speed ? { speed } : {}) },
            })
          : await speak({
              data: {
                text: t,
                voice: chosen,
                ...(speed ? { delivery: { pace: paceFor(speed), emphasis: "", pause: 0 } } : {}),
              },
            });
        return { url: `data:${r.mime};base64,${r.audio}`, mime: r.mime };
      };
      setBusy("Speaking…");
      let clip = await say();
      if (sourceUrl) {
        const [orig, dub] = await Promise.all([clipSeconds(sourceUrl), clipSeconds(clip.url)]);
        const speed = fitSpeed(orig, dub);
        if (speed) {
          setBusy("Fitting the timing…");
          clip = await say(speed);
        }
      }
      setOut({ text: t, ...clip, lang });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dubbing failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Languages className="h-5 w-5 text-primary" />
        Translate &amp; dub
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Hear this recording in another language — in your own copied voice.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Dub language"
        >
          {DUB_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={chosen}
          onChange={(e) => setVoice(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Dub voice"
        >
          {voices.data?.map((v) => (
            <option key={v.id} value={`saved:${v.id}`}>
              {v.name}
            </option>
          ))}
          {VOICES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <Button
        className="mt-3 w-full"
        variant="outline"
        disabled={!user || !text.trim() || !!busy}
        onClick={run}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
        {busy || "Dub this recording"}
      </Button>
      <div className="mt-2 text-center text-xs text-muted-foreground">
        <CostHint kind="translation" units={text.length} /> +{" "}
        <CostHint kind={chosen.startsWith("saved:") ? "cloned_tts" : "tts"} units={text.length} />{" "}
        (up to 2 takes to fit timing)
      </div>
      {out && (
        <div className="mt-4 rounded-xl bg-muted p-3">
          <audio controls src={out.url} className="w-full" />
          <p className="mt-2 max-h-32 overflow-y-auto text-xs text-muted-foreground">{out.text}</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={async () =>
              download(
                await taggedDownloadUrl(out.url),
                `vocalis-dub-${out.lang}.${out.mime.includes("mpeg") ? "mp3" : "wav"}`,
              )
            }
          >
            <Download className="h-4 w-4" />
            Download dub
          </Button>
        </div>
      )}
    </div>
  );
}
