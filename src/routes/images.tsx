import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Film, ImageIcon, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SiteHeader } from "@/components/SiteHeader";
import { AISignIn } from "@/components/AISignIn";
import { useAuth } from "@/hooks/useAuth";
import { streamImage } from "@/lib/stream-image";
import { VideoJobFailedError } from "@/lib/video-job";
import { animate, download, saveImage } from "@/lib/media-client";

export const Route = createFileRoute("/images")({
  head: () => ({
    meta: [
      { title: "Image Studio — Vocalis" },
      {
        name: "description",
        content: "Create AI images from a description and bring them to life as video.",
      },
      { property: "og:title", content: "Image Studio — Vocalis" },
      {
        property: "og:description",
        content: "Create AI images from a description and bring them to life as video.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImageStudio,
});

type Item = {
  id: string;
  prompt: string;
  src: string;
  final: boolean;
  video?: string | undefined;
  animating?: boolean | undefined;
  jobId?: string | undefined;
  progress?: number | undefined;
};

function ImageStudio() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const patch = (id: string, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function generate() {
    if (!user) {
      toast.error("Sign in to create images.");
      return;
    }
    const text = prompt.trim();
    if (!text) {
      toast.error("Describe the image first.");
      return;
    }
    const id = crypto.randomUUID();
    setBusy(true);
    setItems((xs) => [{ id, prompt: text, src: "", final: false }, ...xs]);
    try {
      await streamImage("/api/generate-image", { prompt: text }, (src, final) =>
        patch(id, { src, final }),
      );
    } catch (e) {
      setItems((xs) => xs.filter((x) => x.id !== id));
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bringToLife(it: Item) {
    if (!user) {
      toast.error("Sign in to animate images.");
      return;
    }
    patch(it.id, { animating: true, progress: 0 });
    try {
      const url = await animate({
        prompt: `${it.prompt}. Gentle cinematic camera movement`,
        image: it.src,
        jobId: it.jobId,
        onJobStarted: (jobId) => patch(it.id, { jobId }),
        onProgress: (p) => patch(it.id, { progress: p }),
      });
      patch(it.id, { video: url, animating: false, jobId: undefined });
      toast.success("Video ready — saved to your library.");
    } catch (e) {
      patch(it.id, {
        animating: false,
        ...(e instanceof VideoJobFailedError ? { jobId: undefined } : {}),
      });
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">
          Image <span className="text-primary">studio</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Describe a picture, then bring it to life as a short video.
        </p>
        {!user && <AISignIn />}
        <div className="mt-6 rounded-2xl border bg-card p-5">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="A cozy bakery at sunrise, warm light through the window, film photo"
          />
          <div className="mt-3 flex justify-end">
            <Button onClick={generate} disabled={busy || !user}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}{" "}
              Create image
            </Button>
          </div>
        </div>
        {items.length === 0 && (
          <div className="mt-10 flex flex-col items-center text-muted-foreground">
            <ImageIcon className="h-10 w-10" />
            <p className="mt-2 text-sm">Your images will appear here.</p>
          </div>
        )}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {items.map((it) => (
            <div key={it.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="aspect-square bg-muted">
                {it.video ? (
                  <video
                    src={it.video}
                    controls
                    autoPlay
                    loop
                    className="h-full w-full object-cover"
                  />
                ) : it.src ? (
                  <img
                    src={it.src}
                    alt={it.prompt}
                    className={`h-full w-full object-cover transition-[filter] duration-500 ${it.final ? "blur-0" : "blur-2xl"}`}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="line-clamp-2 text-sm text-muted-foreground">{it.prompt}</p>
                {it.final && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => download(it.src, "vocalis-image.png")}
                    >
                      <Download className="h-4 w-4" />
                      Image
                    </Button>
                    {user && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          saveImage(it.src, it.prompt).then(
                            () => toast.success("Saved to library"),
                            (e) => toast.error(e.message),
                          )
                        }
                      >
                        <Save className="h-4 w-4" />
                        Save
                      </Button>
                    )}
                    {it.video ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => download(it.video!, "vocalis-video.mp4")}
                      >
                        <Download className="h-4 w-4" />
                        Video
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => bringToLife(it)} disabled={it.animating}>
                        {it.animating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Animating… {it.progress ? `${Math.round(it.progress)}%` : ""}
                          </>
                        ) : (
                          <>
                            <Film className="h-4 w-4" />
                            {it.jobId ? "Resume animation" : "Bring to life"}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
