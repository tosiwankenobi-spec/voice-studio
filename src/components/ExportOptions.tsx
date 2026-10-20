import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { loadBrand } from "@/lib/brand";
import { CAPTION_STYLES, toSrt, type CaptionStyle } from "@/lib/captions";
import {
  VIDEO_FORMATS,
  videoCues,
  type ExportOptions,
  type RenderScene,
  type VideoFormat,
} from "@/lib/video-export";
import { download } from "@/lib/media-client";

/** Format, caption, brand and AI-label choices shared by every video export. */
export function useExportOptions(defaults: { format?: VideoFormat; captions?: CaptionStyle } = {}) {
  const { user } = useAuth();
  const brand = useQuery({ queryKey: ["brand"], queryFn: loadBrand, enabled: !!user });
  const [format, setFormat] = useState<VideoFormat>(defaults.format ?? "16:9");
  const [captions, setCaptions] = useState<CaptionStyle>(defaults.captions ?? "karaoke");
  const [useBrand, setUseBrand] = useState(true);
  const [aiLabel, setAiLabel] = useState(true);

  const hasBrand = !!brand.data?.saved;
  const options: ExportOptions = {
    format,
    captions,
    aiDisclosure: aiLabel,
    brand: hasBrand && useBrand ? { ...brand.data!.kit, logoUrl: brand.data!.logoUrl } : null,
  };

  const panel = (
    <div className="grid gap-3 rounded-xl border bg-muted/40 p-4 text-sm sm:grid-cols-2">
      <label className="flex flex-col gap-1 font-semibold">
        Size
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as VideoFormat)}
          className="h-9 rounded-md border bg-background px-3 font-normal"
        >
          {VIDEO_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Captions
        <select
          value={captions}
          onChange={(e) => setCaptions(e.target.value as CaptionStyle)}
          className="h-9 rounded-md border bg-background px-3 font-normal"
        >
          {CAPTION_STYLES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <Switch
          checked={hasBrand && useBrand}
          disabled={!hasBrand}
          onCheckedChange={setUseBrand}
          aria-label="Apply brand kit"
        />
        {hasBrand ? (
          "Apply my brand kit"
        ) : (
          <span className="text-muted-foreground">
            No brand kit yet —{" "}
            <Link to="/brand" className="text-primary hover:underline">
              set one up
            </Link>
          </span>
        )}
      </label>
      <label className="flex items-center gap-2">
        <Switch checked={aiLabel} onCheckedChange={setAiLabel} aria-label="Label AI voice" />
        Label as AI-generated voice
      </label>
    </div>
  );

  return { options, panel };
}

/** Downloads .srt captions for the scenes (estimated timings). */
export function SrtButton({
  scenes,
  options,
  name = "vocalis-captions",
  disabled,
}: {
  scenes: RenderScene[];
  options: ExportOptions;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled || !scenes.length}
      onClick={() => {
        const srt = toSrt(videoCues(scenes, options));
        const url = URL.createObjectURL(new Blob([srt], { type: "application/x-subrip" }));
        download(url, `${name}.srt`);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }}
    >
      <FileText className="h-4 w-4" />
      Captions (.srt)
    </Button>
  );
}
