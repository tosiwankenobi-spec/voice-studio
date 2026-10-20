import { Checkbox } from "@/components/ui/checkbox";

export function VoiceConsent({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} aria-label="Voice copying permission" />
      <span>This is my voice, or I have permission to copy and use it.</span>
    </label>
  );
}