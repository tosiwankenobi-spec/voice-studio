import { useState } from "react";
import { Dices, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FACE,
  FACE_COLORS,
  FACE_CONTROLS,
  randomFace,
  type AvatarFace,
} from "@/lib/face";

type Props = {
  face: AvatarFace;
  onChange: (face: AvatarFace) => void;
  disabled?: boolean;
};

function ShapeControls({
  group,
  face,
  onChange,
  disabled,
}: Props & { group: "Shape" | "Features" }) {
  return (
    <div className="space-y-4">
      {FACE_CONTROLS.filter((control) => control.group === group).map((control) => (
        <label key={control.key} className="block">
          <span className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-muted-foreground">{control.label}</span>
            <output className="font-mono text-[11px] text-foreground">
              {face[control.key]}
              {control.unit ?? ""}
            </output>
          </span>
          <input
            type="range"
            aria-label={control.label}
            min={control.min}
            max={control.max}
            step={1}
            value={face[control.key]}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...face, [control.key]: Number(event.target.value) } as AvatarFace)
            }
            className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      ))}
    </div>
  );
}

export function FaceEditor({ face, onChange, disabled = false }: Props) {
  const [activeTab, setActiveTab] = useState<"shape" | "features" | "colors">("shape");
  return (
    <section className="rounded-2xl border bg-card p-5" aria-labelledby="face-editor-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 id="face-editor-title" className="flex items-center gap-2 font-display text-lg font-bold">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Face editor
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Make the shape and style your own.</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Reset face"
          title="Reset face"
          disabled={disabled}
          onClick={() => onChange({ ...DEFAULT_FACE })}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-background p-1" role="tablist" aria-label="Face controls">
        {(["shape", "features", "colors"] as const).map((tab) => (
          <button
            key={tab}
            id={`face-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`face-panel-${tab}`}
            className="rounded-lg px-2 py-2 text-xs font-semibold capitalize text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring data-[active=true]:bg-secondary data-[active=true]:text-primary"
            data-active={activeTab === tab ? "true" : undefined}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div id="face-panel-shape" role="tabpanel" aria-labelledby="face-tab-shape" hidden={activeTab !== "shape"}>
        <ShapeControls group="Shape" face={face} onChange={onChange} disabled={disabled} />
      </div>
      <div id="face-panel-features" role="tabpanel" aria-labelledby="face-tab-features" hidden={activeTab !== "features"}>
        <ShapeControls group="Features" face={face} onChange={onChange} disabled={disabled} />
      </div>
      <div id="face-panel-colors" role="tabpanel" aria-labelledby="face-tab-colors" hidden={activeTab !== "colors"}>
        <div className="grid grid-cols-2 gap-3">
          {FACE_COLORS.map((color) => (
            <label key={color.key} className="flex items-center gap-3 rounded-xl border bg-background p-3 text-xs font-medium">
              <input
                type="color"
                aria-label={`${color.label} color`}
                value={face[color.key]}
                disabled={disabled}
                onChange={(event) => onChange({ ...face, [color.key]: event.target.value })}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              />
              {color.label}
            </label>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="mt-5 w-full"
        disabled={disabled}
        onClick={() => onChange(randomFace())}
      >
        <Dices className="h-4 w-4" />
        Surprise me
      </Button>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Your latest face is remembered on this device.
      </p>
    </section>
  );
}
