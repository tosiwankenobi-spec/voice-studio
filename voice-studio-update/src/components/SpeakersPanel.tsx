import { useMemo, useRef } from "react";
import { Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { speakerLabel, speakerTurns } from "@/lib/dialogue";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Who said what: diarized speaker turns from the recording, each playable on its own. */
export function SpeakersPanel({
  words,
  sourceUrl,
}: {
  words: { w: string; s: number; e: number; sp?: string }[];
  sourceUrl: string | null;
}) {
  const turns = useMemo(() => speakerTurns(words), [words]);
  const speakers = useMemo(() => [...new Set(turns.map((t) => t.speaker))], [turns]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef(0);
  if (speakers.length < 2 || !words.some((w) => w.sp)) return null;

  function play(s: number, e: number) {
    if (!sourceUrl) return;
    if (!audio.current) {
      audio.current = new Audio(sourceUrl);
      audio.current.ontimeupdate = () => {
        if (audio.current && audio.current.currentTime >= stopAt.current) audio.current.pause();
      };
    }
    stopAt.current = e;
    audio.current.currentTime = s;
    void audio.current.play();
  }

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Users className="h-5 w-5 text-primary" />
        {speakers.length} speakers
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Detected automatically. Edit the transcript to change what each person says.
      </p>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {turns.map((t, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-label={`Play ${speakerLabel(t.speaker)} at ${fmt(t.s)}`}
              onClick={() => play(t.s, t.e)}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
            <div className="min-w-0">
              <span
                className={`text-xs font-semibold ${speakers.indexOf(t.speaker) % 2 ? "text-accent" : "text-primary"}`}
              >
                {speakerLabel(t.speaker)} · {fmt(t.s)}
              </span>
              <p className="line-clamp-3 text-muted-foreground">{t.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
