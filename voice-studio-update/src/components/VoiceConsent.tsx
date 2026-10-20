import { useEffect, useState } from "react";
import { Circle, RotateCcw, Square } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMicRecorder } from "@/hooks/useMicRecorder";
import { consentSentence } from "@/lib/studio-validation";

export type ConsentRecording = { speaker: string; audio: File };

/**
 * Spoken consent: the person whose voice is being copied reads a sentence aloud. The server
 * transcribes it and refuses to copy the voice unless it matches. `value` is null until the
 * permission box is ticked, a name is entered and the sentence is recorded.
 */
export function VoiceConsent({
  onChange,
  disabled,
}: {
  onChange: (v: ConsentRecording | null) => void;
  disabled?: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const [speaker, setSpeaker] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const mic = useMicRecorder((f) => setAudio(f));

  useEffect(() => {
    onChange(agreed && speaker.trim() && audio ? { speaker: speaker.trim(), audio } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreed, speaker, audio]);
  useEffect(() => {
    if (!audio) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(audio);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);
  return (
    <div className="mt-3 rounded-xl border bg-muted/40 p-4 text-sm">
      <label className="flex items-start gap-2 text-muted-foreground">
        <Checkbox
          checked={agreed}
          disabled={disabled}
          onCheckedChange={(v) => setAgreed(v === true)}
          aria-label="Voice copying permission"
        />
        <span>This is my voice, or the speaker is here and agrees to have their voice copied.</span>
      </label>
      {agreed && (
        <div className="mt-3 space-y-3">
          <Input
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            placeholder="Speaker's full name"
            maxLength={80}
            disabled={disabled}
            aria-label="Speaker's name"
          />
          <p className="rounded-lg bg-background p-3 font-medium text-foreground">
            “{consentSentence(speaker)}”
          </p>
          <p className="text-xs text-muted-foreground">
            The speaker reads this sentence aloud. We check it matches before copying the voice, and
            keep the recording with the voice. Deleting the voice deletes it too.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {mic.recording ? (
              <Button type="button" size="sm" variant="destructive" onClick={mic.stop}>
                <Square className="h-4 w-4" />
                Stop · {mic.clock}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || !speaker.trim()}
                onClick={mic.start}
              >
                {audio ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4 fill-destructive text-destructive" />
                )}
                {audio ? "Record again" : "Record consent"}
              </Button>
            )}
            {url && <audio controls src={url} className="h-8" aria-label="Consent recording" />}
          </div>
        </div>
      )}
    </div>
  );
}
