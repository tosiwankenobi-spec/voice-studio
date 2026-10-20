import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { speakWithMyVoice } from "@/lib/studio.functions";
import { PREVIEW_LINE, type SavedVoice } from "@/lib/voices";

/** Two previews: the original recording, and the copied voice speaking a test line. */
export function VoicePreview({ voice, compact = false }: { voice: SavedVoice; compact?: boolean }) {
  const speak = useServerFn(speakWithMyVoice);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "sample" | "loading" | "speaking">("idle");

  function stop() {
    audio.current?.pause();
    audio.current = null;
    setState("idle");
  }
  function playUrl(url: string, s: "sample" | "speaking") {
    stop();
    const a = new Audio(url);
    a.onended = () => setState("idle");
    audio.current = a;
    setState(s);
    void a.play();
  }
  async function hear() {
    stop();
    setState("loading");
    try {
      const r = await speak({ data: { text: PREVIEW_LINE, voiceId: voice.eleven_voice_id } });
      playUrl(`data:${r.mime};base64,${r.audio}`, "speaking");
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  }

  const size = compact ? "sm" : "sm";
  return (
    <div className="flex flex-wrap gap-2">
      {voice.sampleUrl && (
        <Button size={size} variant="outline" onClick={() => (state === "sample" ? stop() : playUrl(voice.sampleUrl, "sample"))} aria-label={`Play original recording of ${voice.name}`}>
          {state === "sample" ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />} {compact ? "Original" : "Original recording"}
        </Button>
      )}
      <Button size={size} variant="outline" disabled={state === "loading"} onClick={() => (state === "speaking" ? stop() : hear())} aria-label={`Hear ${voice.name} speak`}>
        {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "speaking" ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {compact ? "Hear it" : "Hear it speak"}
      </Button>
    </div>
  );
}
