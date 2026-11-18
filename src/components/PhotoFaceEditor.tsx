import { useState } from "react";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PHOTO_FACE,
  PHOTO_CONTROLS,
  type AvatarFace,
  type PhotoFaceSettings,
} from "@/lib/face";

type Props = {
  face: AvatarFace;
  settings: PhotoFaceSettings;
  hasPhoto: boolean;
  photoName?: string;
  disabled?: boolean;
  onFaceChange: (face: AvatarFace) => void;
  onChange: (settings: PhotoFaceSettings) => void;
  onUpload: () => void;
  onClear: () => void;
};

function Slider({
  label,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <output className="font-mono text-[11px] text-foreground">{value}{unit ?? ""}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

export function PhotoFaceEditor({
  face,
  settings,
  hasPhoto,
  photoName,
  disabled = false,
  onFaceChange,
  onChange,
  onUpload,
  onClear,
}: Props) {
  const [tab, setTab] = useState<"portrait" | "mouth" | "style">("portrait");
  return (
    <section className="rounded-2xl border bg-card p-5" aria-labelledby="photo-editor-title">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 id="photo-editor-title" className="font-display text-lg font-bold">Photo face editor</h2>
          <p className="mt-1 text-xs text-muted-foreground">A stylized photo puppet with speech-timed lips.</p>
        </div>
        {hasPhoto && (
          <Button type="button" size="icon" variant="ghost" aria-label="Remove portrait" disabled={disabled} onClick={onClear}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Button type="button" variant="outline" className="mb-3 w-full" disabled={disabled} onClick={onUpload}>
        <ImagePlus className="h-4 w-4" />
        {hasPhoto ? "Replace portrait" : "Upload portrait"}
      </Button>
      {photoName && <p className="mb-4 truncate text-center text-xs text-muted-foreground">{photoName}</p>}
      {hasPhoto && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-background p-1" role="tablist" aria-label="Photo face controls">
            {(["portrait", "mouth", "style"] as const).map((value) => (
              <button
                key={value}
                id={`photo-tab-${value}`}
                type="button"
                role="tab"
                aria-selected={tab === value}
                aria-controls={`photo-panel-${value}`}
                data-active={tab === value ? "true" : undefined}
                onClick={() => setTab(value)}
                className="rounded-lg px-2 py-2 text-xs font-semibold capitalize text-muted-foreground data-[active=true]:bg-secondary data-[active=true]:text-primary"
              >
                {value}
              </button>
            ))}
          </div>

          <div id="photo-panel-portrait" role="tabpanel" aria-labelledby="photo-tab-portrait" hidden={tab !== "portrait"} className="space-y-4">
            {PHOTO_CONTROLS.portrait.map((control) => (
              <Slider key={control.key} label={control.label} min={control.min} max={control.max} unit={"unit" in control ? control.unit : ""} value={settings[control.key]} disabled={disabled} onChange={(value) => onChange({ ...settings, [control.key]: value })} />
            ))}
            <Slider label="Portrait width" min={75} max={130} unit="%" value={face.faceWidth} disabled={disabled} onChange={(faceWidth) => onFaceChange({ ...face, faceWidth })} />
            <Slider label="Portrait height" min={80} max={125} unit="%" value={face.faceHeight} disabled={disabled} onChange={(faceHeight) => onFaceChange({ ...face, faceHeight })} />
          </div>

          <div id="photo-panel-mouth" role="tabpanel" aria-labelledby="photo-tab-mouth" hidden={tab !== "mouth"} className="space-y-4">
            <p className="text-xs leading-relaxed text-muted-foreground">Place the animated mouth over the portrait's lips. Every shape still follows the narration.</p>
            {PHOTO_CONTROLS.mouth.map((control) => (
              <Slider key={control.key} label={control.label} min={control.min} max={control.max} unit={"unit" in control ? control.unit : ""} value={settings[control.key]} disabled={disabled} onChange={(value) => onChange({ ...settings, [control.key]: value })} />
            ))}
            <Slider label="Mouth width" min={70} max={150} unit="%" value={face.mouthWidth} disabled={disabled} onChange={(mouthWidth) => onFaceChange({ ...face, mouthWidth })} />
            <Slider label="Mouth opening" min={70} max={150} unit="%" value={face.mouthHeight} disabled={disabled} onChange={(mouthHeight) => onFaceChange({ ...face, mouthHeight })} />
            <label className="flex items-center gap-3 text-xs font-medium">
              <input type="color" aria-label="Photo lip color" value={face.lipColor} disabled={disabled} onChange={(event) => onFaceChange({ ...face, lipColor: event.target.value })} className="h-9 w-9 rounded-lg border-0 bg-transparent" />
              Lip color
            </label>
          </div>

          <div id="photo-panel-style" role="tabpanel" aria-labelledby="photo-tab-style" hidden={tab !== "style"} className="space-y-4">
            {PHOTO_CONTROLS.style.map((control) => (
              <Slider key={control.key} label={control.label} min={control.min} max={control.max} unit={"unit" in control ? control.unit : ""} value={settings[control.key]} disabled={disabled} onChange={(value) => onChange({ ...settings, [control.key]: value })} />
            ))}
            <label className="flex items-center gap-3 text-xs font-medium">
              <input type="color" aria-label="Photo background color" value={face.backgroundColor} disabled={disabled} onChange={(event) => onFaceChange({ ...face, backgroundColor: event.target.value })} className="h-9 w-9 rounded-lg border-0 bg-transparent" />
              Background
            </label>
          </div>

          <Button type="button" variant="ghost" className="mt-5 w-full" disabled={disabled} onClick={() => onChange({ ...DEFAULT_PHOTO_FACE })}>
            <RotateCcw className="h-4 w-4" />
            Reset photo controls
          </Button>
        </>
      )}
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Portraits stay in this editing session.</p>
    </section>
  );
}
