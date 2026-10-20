import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clapperboard,
  Download,
  FolderOpen,
  ImageIcon,
  ImagePlus,
  Link2,
  Loader2,
  Megaphone,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { AISignIn } from "@/components/AISignIn";
import { CostHint } from "@/components/CostHint";
import { SrtButton, useExportOptions } from "@/components/ExportOptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  AD_LENGTHS,
  AD_TONES,
  fetchProduct,
  planAd,
  proxyImage,
  type AdScene,
} from "@/lib/ad.functions";
import { EMPTY_PRODUCT, MAX_PRODUCT_IMAGES, priceLabel, type Product } from "@/lib/product";
import { VOICES, generateSpeech, speakWithMyVoice } from "@/lib/studio.functions";
import { listVoices } from "@/lib/voices";
import { streamImage } from "@/lib/stream-image";
import { audioSeconds, exportVideo } from "@/lib/video-export";
import { download } from "@/lib/media-client";

export const Route = createFileRoute("/ad")({
  head: () => ({
    meta: [
      { title: "Product Ad — Vocalis" },
      {
        name: "description",
        content:
          "Paste a Shopify or Etsy product link and get a narrated, captioned vertical video ad.",
      },
      { property: "og:title", content: "Product Ad — Vocalis" },
      {
        property: "og:description",
        content: "Turn a product link into a short narrated video ad.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductAd,
});

type Scene = AdScene & {
  id: string;
  audio?: string | undefined;
  seconds?: number | undefined;
  aiImage?: string | undefined;
  busy?: string | undefined;
};
type Settings = { seconds: number; tone: string; voice: string; badge: boolean };
const STORAGE = "storage:";

async function listAds() {
  const { data, error } = await supabase
    .from("ad_projects")
    .select("id, source_url, product, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

function ProductAd() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const read = useServerFn(fetchProduct);
  const proxy = useServerFn(proxyImage);
  const plan = useServerFn(planAd);
  const speak = useServerFn(generateSpeech);
  const speakMine = useServerFn(speakWithMyVoice);
  const voices = useQuery({ queryKey: ["voices"], queryFn: listVoices, enabled: !!user });
  const ads = useQuery({ queryKey: ["ads"], queryFn: listAds, enabled: !!user });
  const { options: exportOpts, panel: exportPanel } = useExportOptions({
    format: "9:16",
    captions: "karaoke",
  });

  const [url, setUrl] = useState("");
  const [product, setProduct] = useState<Product>(EMPTY_PRODUCT);
  const [settings, setSettings] = useState<Settings>({
    seconds: 30,
    tone: "friendly",
    voice: "Kore",
    badge: true,
  });
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [adId, setAdId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const imageCache = useRef(new Map<string, string>());
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const abort = useRef<AbortController | null>(null);
  const upload = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<Scene>) =>
    setScenes((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const setP = (p: Partial<Product>) => setProduct((x) => ({ ...x, ...p }));

  /** A canvas-safe source for a product image: data URL for outside links, signed URL for uploads. */
  async function imageSrc(src: string) {
    const hit = imageCache.current.get(src);
    if (hit) return hit;
    let out: string;
    if (src.startsWith(STORAGE)) {
      const s = await supabase.storage
        .from("clips")
        .createSignedUrl(src.slice(STORAGE.length), 3600);
      if (s.error) throw s.error;
      out = s.data.signedUrl;
    } else out = (await proxy({ data: { url: src } })).dataUrl;
    imageCache.current.set(src, out);
    return out;
  }
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  async function loadThumbs(images: string[]) {
    for (const src of images) {
      if (thumbs[src]) continue;
      imageSrc(src)
        .then((u) => setThumbs((t) => ({ ...t, [src]: u })))
        .catch(() => undefined);
    }
  }

  async function readLink() {
    if (!user) {
      toast.error("Sign in to read product links.");
      return;
    }
    setBusy("read");
    try {
      const r = await read({ data: { url } });
      setProduct(r.product);
      setScenes([]);
      setResult(null);
      setAdId(null);
      void loadThumbs(r.product.images);
      toast.success(`Found “${r.product.title}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that page");
      if (!product.url) setP({ url });
    } finally {
      setBusy(null);
    }
  }

  async function addImages(files: FileList) {
    if (!user) return;
    const room = MAX_PRODUCT_IMAGES - product.images.length;
    const picked = [...files]
      .filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 8 * 1024 * 1024)
      .slice(0, room);
    if (!picked.length) {
      toast.error(
        room ? "Use PNG, JPG or WebP images under 8 MB." : `Up to ${MAX_PRODUCT_IMAGES} images.`,
      );
      return;
    }
    setBusy("upload");
    try {
      const added: string[] = [];
      for (const f of picked) {
        const path = `${user.id}/ads/${crypto.randomUUID()}.${f.type.split("/")[1]!.replace("jpeg", "jpg")}`;
        const up = await supabase.storage.from("clips").upload(path, f, { contentType: f.type });
        if (up.error) throw up.error;
        added.push(STORAGE + path);
      }
      setP({ images: [...product.images, ...added] });
      void loadThumbs(added);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function writeAd() {
    if (!user) {
      toast.error("Sign in to write ads.");
      return;
    }
    setBusy("plan");
    try {
      const r = await plan({
        data: {
          product,
          seconds: settings.seconds,
          tone: settings.tone,
          imageCount: product.images.length,
        },
      });
      setScenes(r.scenes.map((s) => ({ ...s, id: crypto.randomUUID() })));
      setResult(null);
      toast.success(`${r.scenes.length} scenes written`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't write the ad");
    } finally {
      setBusy(null);
    }
  }

  async function voiceScene(s: Scene) {
    const mine = settings.voice.startsWith("saved:")
      ? voices.data?.find((v) => v.id === settings.voice.slice(6))
      : undefined;
    const r = mine
      ? await speakMine({ data: { text: s.narration, voiceId: mine.eleven_voice_id } })
      : await speak({
          data: {
            text: s.narration,
            voice: settings.voice,
            style:
              settings.tone === "energetic"
                ? "Say with energy and excitement"
                : settings.tone === "premium"
                  ? "Say smoothly and confidently"
                  : "",
          },
        });
    const audio = `data:${r.mime};base64,${r.audio}`;
    patch(s.id, { audio, seconds: await audioSeconds(audio) });
  }
  async function aiShot(s: Scene) {
    await streamImage(
      "/api/generate-image",
      {
        prompt: `${s.imagePrompt}. Featuring: ${product.title}. Vertical 9:16 product lifestyle photo, no text.`,
      },
      (img, final) => final && patch(s.id, { aiImage: img }),
    );
  }

  async function makeAll() {
    setBusy("make");
    try {
      for (const s of scenesRef.current) {
        const cur = scenesRef.current.find((x) => x.id === s.id);
        if (!cur) continue;
        patch(cur.id, { busy: "Voicing…" });
        try {
          if (!cur.audio) await voiceScene(cur);
          if (cur.image === null && !cur.aiImage) {
            patch(cur.id, { busy: "Painting…" });
            await aiShot(cur);
          }
        } finally {
          patch(cur.id, { busy: undefined });
        }
      }
      toast.success("Every scene is ready — export your ad.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something failed");
    } finally {
      setBusy(null);
    }
  }

  async function exportAd() {
    if (scenes.some((s) => !s.audio || (s.image === null && !s.aiImage))) {
      toast.error("Make every scene first.");
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy("export");
    try {
      const render = [];
      for (const s of scenes) {
        const src = s.image !== null ? product.images[s.image] : undefined;
        render.push({
          image: src ? await imageSrc(src) : s.aiImage,
          audio: s.audio,
          seconds: s.seconds ?? 5,
          text: s.narration,
        });
      }
      const blob = await exportVideo(render, () => undefined, {
        ...exportOpts,
        badge: settings.badge ? priceLabel(product) : undefined,
        signal: ctrl.signal,
      });
      if (result) URL.revokeObjectURL(result.url);
      setResult({ url: URL.createObjectURL(blob), blob });
      toast.success("Your ad is ready");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setBusy(null);
      abort.current = null;
    }
  }

  async function saveProject() {
    if (!user) return;
    setBusy("save");
    try {
      const row = {
        source_url: product.url || url,
        product: product as unknown as never,
        scenes: scenes.map(({ narration, image, imagePrompt, motion }) => ({
          narration,
          image,
          imagePrompt,
          motion,
        })) as unknown as never,
        settings: settings as unknown as never,
      };
      if (adId) {
        const { error } = await supabase.from("ad_projects").update(row).eq("id", adId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("ad_projects")
          .insert(row)
          .select("id")
          .single();
        if (error) throw error;
        setAdId(data.id);
      }
      qc.invalidateQueries({ queryKey: ["ads"] });
      toast.success("Ad saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the ad");
    } finally {
      setBusy(null);
    }
  }

  async function openProject(id: string) {
    const { data, error } = await supabase
      .from("ad_projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast.error("Couldn't open that ad");
      return;
    }
    const p = { ...EMPTY_PRODUCT, ...(data.product as Partial<Product>) };
    setProduct(p);
    setUrl(data.source_url);
    setSettings((s) => ({ ...s, ...(data.settings as Partial<Settings>) }));
    setScenes(((data.scenes as AdScene[]) ?? []).map((s) => ({ ...s, id: crypto.randomUUID() })));
    setAdId(data.id);
    setResult(null);
    void loadThumbs(p.images);
  }

  async function saveVideo() {
    if (!user || !result) return;
    setBusy("save");
    try {
      const path = `${user.id}/ads/${crypto.randomUUID()}.${result.blob.type.includes("mp4") ? "mp4" : "webm"}`;
      const up = await supabase.storage
        .from("clips")
        .upload(path, result.blob, { contentType: result.blob.type });
      if (up.error) throw up.error;
      const { error } = await supabase
        .from("media")
        .insert({
          kind: "video",
          prompt: `Product ad: ${product.title}`.slice(0, 2000),
          storage_path: path,
        });
      if (error) {
        await supabase.storage.from("clips").remove([path]);
        throw error;
      }
      toast.success("Saved to My Library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the video");
    } finally {
      setBusy(null);
    }
  }

  const chars = scenes.filter((s) => !s.audio).reduce((a, s) => a + s.narration.length, 0);
  const aiShots = scenes.filter((s) => s.image === null && !s.aiImage).length;
  const ready =
    scenes.length > 0 && scenes.every((s) => s.audio && (s.image !== null || s.aiImage));
  const renderScenes = scenes.map((s) => ({ seconds: s.seconds ?? 0, text: s.narration }));

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">
          Product link <span className="text-primary">→ video ad</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Paste a Shopify or Etsy product link. Claude writes the ad, Vocalis voices it and builds a
          captioned vertical video.
        </p>
        {!user && <AISignIn />}

        <form
          className="mt-6 flex flex-col gap-2 rounded-2xl border bg-card p-5 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void readLink();
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourstore.com/products/…"
            aria-label="Product link"
          />
          <Button type="submit" disabled={!url.trim() || !user || !!busy}>
            {busy === "read" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Read product
          </Button>
        </form>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="space-y-3 rounded-2xl border bg-card p-5">
            <h2 className="font-display text-lg font-bold">Product</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_90px]">
              <Input
                value={product.title}
                onChange={(e) => setP({ title: e.target.value })}
                placeholder="Product name"
                maxLength={200}
                aria-label="Product name"
              />
              <Input
                value={product.price}
                onChange={(e) => setP({ price: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="Price"
                aria-label="Price"
              />
              <Input
                value={product.currency}
                onChange={(e) => setP({ currency: e.target.value.toUpperCase().slice(0, 3) })}
                placeholder="CAD"
                aria-label="Currency"
              />
            </div>
            <Input
              value={product.store}
              onChange={(e) => setP({ store: e.target.value })}
              placeholder="Shop name, e.g. Verolane"
              maxLength={80}
              aria-label="Shop name"
            />
            <Textarea
              value={product.description}
              onChange={(e) => setP({ description: e.target.value })}
              rows={4}
              placeholder="What makes it great? Materials, sizes, who it's for…"
              maxLength={1500}
              aria-label="Description"
            />
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Photos</span>
                <span className="text-xs text-muted-foreground">
                  {product.images.length}/{MAX_PRODUCT_IMAGES}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.images.map((src, i) => (
                  <div
                    key={src}
                    className="group relative h-24 w-20 overflow-hidden rounded-lg border bg-muted"
                  >
                    {thumbs[src] ? (
                      <img
                        src={thumbs[src]}
                        alt={`Photo ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Loader2 className="m-auto mt-9 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-[10px]">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute right-1 top-1 rounded bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      onClick={() => {
                        setP({ images: product.images.filter((x) => x !== src) });
                        setScenes([]);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {product.images.length < MAX_PRODUCT_IMAGES && (
                  <button
                    type="button"
                    disabled={!user || !!busy}
                    onClick={() => upload.current?.click()}
                    className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
                  >
                    {busy === "upload" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-5 w-5" />
                    )}
                    Add
                  </button>
                )}
                <input
                  ref={upload}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void addImages(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </section>

          <aside className="space-y-4 rounded-2xl border bg-card p-5">
            <h2 className="font-display text-lg font-bold">Ad settings</h2>
            <div>
              <p className="text-sm font-semibold">Length</p>
              <div className="mt-2 flex gap-2">
                {AD_LENGTHS.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={settings.seconds === n ? "default" : "outline"}
                    onClick={() => setSettings((s) => ({ ...s, seconds: n }))}
                  >
                    {n} sec
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">Tone</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {AD_TONES.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={settings.tone === t ? "default" : "outline"}
                    onClick={() => setSettings((s) => ({ ...s, tone: t }))}
                    className="capitalize"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <label className="block text-sm font-semibold">
              Voice
              <select
                value={settings.voice}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, voice: e.target.value }));
                  setScenes((xs) =>
                    xs.map((x) => ({ ...x, audio: undefined, seconds: undefined })),
                  );
                }}
                className="mt-2 h-9 w-full rounded-md border bg-background px-3 font-normal"
              >
                {VOICES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
                {voices.data?.map((v) => (
                  <option key={v.id} value={`saved:${v.id}`}>
                    {v.name} (your voice)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={settings.badge}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, badge: v }))}
                aria-label="Show price badge"
              />
              Price badge{" "}
              {priceLabel(product) && (
                <span className="text-muted-foreground">({priceLabel(product)})</span>
              )}
            </label>
            <Button
              className="w-full shadow-glow"
              disabled={!product.title.trim() || !user || !!busy}
              onClick={writeAd}
            >
              {busy === "plan" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Write my ad
            </Button>
            <div className="text-center">
              <CostHint kind="ad_planning" units={1} />
            </div>
          </aside>
        </div>

        {scenes.length > 0 && (
          <section className="mt-8">
            <div className="mb-4">{exportPanel}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={makeAll} disabled={!!busy}>
                {busy === "make" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clapperboard className="h-4 w-4" />
                )}
                Make all scenes
              </Button>
              <Button variant="secondary" onClick={exportAd} disabled={!ready || !!busy}>
                {busy === "export" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                Export ad
              </Button>
              {busy === "export" && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Cancel export"
                  onClick={() => abort.current?.abort()}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <SrtButton
                scenes={renderScenes}
                options={exportOpts}
                name="vocalis-ad-captions"
                disabled={!ready}
              />
              <Button variant="outline" onClick={saveProject} disabled={!user || !!busy}>
                <Save className="h-4 w-4" />
                {adId ? "Save changes" : "Save ad"}
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                To make:{" "}
                <CostHint
                  kind={settings.voice.startsWith("saved:") ? "cloned_tts" : "tts"}
                  units={chars}
                  times={scenes.some((s) => !s.audio) ? 1 : 0}
                />
                {aiShots > 0 && (
                  <>
                    {" "}
                    + <CostHint kind="image" units={1} times={aiShots} />
                  </>
                )}
              </span>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {scenes.map((s, i) => {
                const src = s.image !== null ? product.images[s.image] : undefined;
                const pic = src ? thumbs[src] : s.aiImage;
                return (
                  <div key={s.id} className="flex gap-4 rounded-2xl border bg-card p-4">
                    <div className="relative h-40 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {pic ? (
                        <img src={pic} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[10px] text-muted-foreground">
                          {s.image === null ? (
                            <>
                              <Sparkles className="h-5 w-5" />
                              AI shot
                            </>
                          ) : (
                            <ImageIcon className="h-5 w-5" />
                          )}
                        </div>
                      )}
                      {s.busy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Scene {i + 1}
                          {s.seconds ? ` · ${s.seconds.toFixed(1)}s` : ""}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove scene"
                          onClick={() => setScenes((xs) => xs.filter((x) => x.id !== s.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={s.narration}
                        rows={3}
                        onChange={(e) =>
                          patch(s.id, {
                            narration: e.target.value,
                            audio: undefined,
                            seconds: undefined,
                          })
                        }
                        aria-label={`Scene ${i + 1} narration`}
                      />
                      <select
                        value={s.image === null ? "ai" : String(s.image)}
                        onChange={(e) =>
                          patch(s.id, {
                            image: e.target.value === "ai" ? null : Number(e.target.value),
                          })
                        }
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        aria-label={`Scene ${i + 1} picture`}
                      >
                        {product.images.map((_, n) => (
                          <option key={n} value={n}>
                            Photo {n + 1}
                          </option>
                        ))}
                        <option value="ai">AI lifestyle shot</option>
                      </select>
                      {s.image === null && (
                        <Input
                          value={s.imagePrompt}
                          onChange={(e) =>
                            patch(s.id, { imagePrompt: e.target.value, aiImage: undefined })
                          }
                          className="h-8 text-xs"
                          aria-label="AI shot description"
                        />
                      )}
                      {s.audio && <audio src={s.audio} controls className="h-8 w-full" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {result && (
          <section className="mt-8 rounded-2xl border bg-card p-5">
            <h2 className="font-display text-lg font-bold">Your ad</h2>
            <video
              controls
              src={result.url}
              className="mt-3 max-h-[70vh] rounded-xl"
              aria-label="Finished ad"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  download(
                    result.url,
                    `vocalis-ad.${result.blob.type.includes("mp4") ? "mp4" : "webm"}`,
                  )
                }
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button variant="outline" onClick={saveVideo} disabled={!!busy}>
                <Save className="h-4 w-4" />
                Save to library
              </Button>
            </div>
          </section>
        )}

        {user && (ads.data?.length ?? 0) > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-lg font-bold">My ads</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ads.data!.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openProject(a.id)}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left hover:border-primary"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {(a.product as Partial<Product>)?.title || "Untitled ad"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.updated_at).toLocaleDateString()}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
