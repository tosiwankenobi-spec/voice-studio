import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askClaude } from "@/lib/studio.functions";

const LENGTHS = [
  { label: "15 sec", words: 40 },
  { label: "30 sec", words: 75 },
  { label: "1 min", words: 150 },
  { label: "3 min", words: 450 },
  { label: "5 min", words: 750 },
];
const TONES = ["Friendly", "Professional", "Energetic", "Calm", "Funny", "Inspiring", "Dramatic"];

export function ScriptGenerator({
  onScript,
  disabled,
}: {
  onScript: (s: string) => void;
  disabled?: boolean;
}) {
  const claude = useServerFn(askClaude);
  const [topic, setTopic] = useState("");
  const [length, setLength] = useState(1);
  const [tone, setTone] = useState("Friendly");
  const [busy, setBusy] = useState(false);

  async function write() {
    setBusy(true);
    try {
      const l = LENGTHS[length] ?? LENGTHS[1]!;
      const r = await claude({
        data: {
          text: "",
          instruction: `Write a complete, ready-to-record script about: ${topic}. Tone: ${tone.toLowerCase()}. Length: about ${l.words} words (roughly ${l.label} when spoken). Include a strong opening hook and a clear ending.`,
        },
      });
      onScript(r.text);
      toast.success("Your script is ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't write the script");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border bg-secondary p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <PenLine className="h-4 w-4 text-primary" /> Write a script for me
      </div>
      <Input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="What's it about? e.g. launching our new coffee shop"
        maxLength={300}
      />
      <div className="mt-3 text-xs text-muted-foreground">Length</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {LENGTHS.map((l, i) => (
          <Button
            key={l.label}
            size="sm"
            variant={length === i ? "default" : "outline"}
            onClick={() => setLength(i)}
          >
            {l.label}
          </Button>
        ))}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">Tone</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {TONES.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tone === t ? "default" : "outline"}
            onClick={() => setTone(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={busy || disabled || !topic.trim()} onClick={write}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
        {busy ? "Writing…" : "Write my script"}
      </Button>
    </div>
  );
}
