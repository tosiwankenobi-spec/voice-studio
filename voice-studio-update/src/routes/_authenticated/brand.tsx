import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BRAND_FONTS,
  DEFAULT_BRAND,
  contrastText,
  loadBrand,
  removeLogo,
  saveBrand,
  type BrandFont,
  type BrandKit,
} from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/brand")({
  head: () => ({
    meta: [
      { title: "Brand Kit — Vocalis" },
      {
        name: "description",
        content:
          "Your logo, colours, font and intro/outro cards, applied to every video you export.",
      },
      { property: "og:title", content: "Brand Kit — Vocalis" },
      {
        property: "og:description",
        content:
          "Your logo, colours, font and intro/outro cards, applied to every video you export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Brand,
});

function Brand() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["brand"], queryFn: loadBrand });
  const [kit, setKit] = useState<BrandKit>(DEFAULT_BRAND);
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.data) {
      setKit(q.data.kit);
      setPreview(q.data.logoUrl);
    }
  }, [q.data]);
  useEffect(() => {
    if (!logo) return;
    const u = URL.createObjectURL(logo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [logo]);

  const set = (p: Partial<BrandKit>) => setKit((k) => ({ ...k, ...p }));

  async function save() {
    setBusy(true);
    try {
      const saved = await saveBrand(kit, logo);
      setKit(saved);
      setLogo(null);
      await qc.invalidateQueries({ queryKey: ["brand"] });
      toast.success("Brand kit saved — it's applied when you export videos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your brand kit");
    } finally {
      setBusy(false);
    }
  }
  async function dropLogo() {
    setBusy(true);
    try {
      if (logo) setLogo(null);
      else setKit(await removeLogo(kit));
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ["brand"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the logo");
    } finally {
      setBusy(false);
    }
  }

  const fg = contrastText(kit.secondary);
  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">
          Brand <span className="text-primary">kit</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Set it once. Video Studio and Product Ad add your logo, colours, font and intro/outro
          cards when you export.
        </p>
        {q.isLoading ? (
          <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" />
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
            <section className="space-y-5 rounded-2xl border bg-card p-6">
              <div>
                <h2 className="font-display text-lg font-bold">Logo</h2>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-16 w-32 items-center justify-center rounded-lg border bg-muted">
                    {preview ? (
                      <img
                        src={preview}
                        alt="Your logo"
                        className="max-h-14 max-w-28 object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">No logo</span>
                    )}
                  </div>
                  <input
                    ref={input}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setLogo(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {preview ? "Change" : "Upload"}
                  </Button>
                  {preview && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={dropLogo}>
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  PNG with a transparent background works best. Up to 2 MB.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Accent colour
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="color"
                      value={kit.primary}
                      onChange={(e) => set({ primary: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded border bg-transparent"
                      aria-label="Accent colour"
                    />
                    <Input
                      value={kit.primary}
                      onChange={(e) => set({ primary: e.target.value })}
                      maxLength={7}
                    />
                  </div>
                </label>
                <label className="text-sm font-semibold">
                  Card background
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="color"
                      value={kit.secondary}
                      onChange={(e) => set({ secondary: e.target.value })}
                      className="h-9 w-12 cursor-pointer rounded border bg-transparent"
                      aria-label="Card background colour"
                    />
                    <Input
                      value={kit.secondary}
                      onChange={(e) => set({ secondary: e.target.value })}
                      maxLength={7}
                    />
                  </div>
                </label>
              </div>
              <label className="block text-sm font-semibold">
                Font
                <select
                  value={kit.font}
                  onChange={(e) => set({ font: e.target.value as BrandFont })}
                  className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {BRAND_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Intro card{" "}
                <span className="font-normal text-muted-foreground">(2 seconds, optional)</span>
                <Input
                  className="mt-2"
                  value={kit.introText}
                  onChange={(e) => set({ introText: e.target.value })}
                  maxLength={80}
                  placeholder="e.g. Verolane presents"
                />
              </label>
              <label className="block text-sm font-semibold">
                Outro card{" "}
                <span className="font-normal text-muted-foreground">(3 seconds, optional)</span>
                <Input
                  className="mt-2"
                  value={kit.outroText}
                  onChange={(e) => set({ outroText: e.target.value })}
                  maxLength={80}
                  placeholder="e.g. Thanks for watching"
                />
              </label>
              <label className="block text-sm font-semibold">
                Call to action
                <Input
                  className="mt-2"
                  value={kit.cta}
                  onChange={(e) => set({ cta: e.target.value })}
                  maxLength={80}
                  placeholder="e.g. Shop now at verolane.ca"
                />
              </label>
              <Button className="shadow-glow" disabled={busy} onClick={save}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save brand kit
              </Button>
            </section>
            <aside className="space-y-4">
              <h2 className="font-display text-lg font-bold">Preview</h2>
              <div
                className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center"
                style={{
                  background: kit.secondary,
                  color: fg,
                  fontFamily: `"${kit.font}", sans-serif`,
                }}
              >
                {preview && <img src={preview} alt="" className="max-h-12 object-contain" />}
                <p className="text-xl font-extrabold">
                  {kit.outroText || kit.introText || "Your outro card"}
                </p>
                {kit.cta && <p className="text-sm font-semibold">{kit.cta}</p>}
              </div>
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
                {preview && (
                  <img
                    src={preview}
                    alt=""
                    className="absolute right-3 top-3 max-h-8 object-contain opacity-90"
                  />
                )}
                <p
                  className="absolute inset-x-0 bottom-6 text-center text-lg font-extrabold"
                  style={{ fontFamily: `"${kit.font}", sans-serif` }}
                >
                  Every word <span style={{ color: kit.primary }}>lights</span> up
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
