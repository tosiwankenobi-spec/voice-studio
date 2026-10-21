import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Trash2, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "My Library — Vocalis" },
      { name: "description", content: "Your saved scripts and voice clips." },
      { property: "og:title", content: "My Library — Vocalis" },
      { property: "og:description", content: "Your saved scripts and voice clips." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Library,
});

async function loadLibrary() {
  const [s, c, m] = await Promise.all([
    supabase.from("scripts").select("*").order("updated_at", { ascending: false }),
    supabase.from("clips").select("*").order("created_at", { ascending: false }),
    supabase.from("media").select("*").order("created_at", { ascending: false }),
  ]);
  if (s.error) throw s.error;
  if (c.error) throw c.error;
  if (m.error) throw m.error;
  const paths = [...c.data.map((x) => x.storage_path), ...m.data.map((x) => x.storage_path)];
  const signed = paths.length
    ? await supabase.storage.from("clips").createSignedUrls(paths, 3600)
    : { data: [] };
  const urls = new Map((signed.data ?? []).map((x) => [x.path, x.signedUrl]));
  return {
    scripts: s.data,
    clips: c.data.map((x) => ({ ...x, url: urls.get(x.storage_path) ?? "" })),
    media: m.data.map((x) => ({ ...x, url: urls.get(x.storage_path) ?? "" })),
  };
}

function Library() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["library"], queryFn: loadLibrary });

  async function delScript(id: string) {
    const { error } = await supabase.from("scripts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["library"] });
  }
  async function delMedia(id: string, path: string) {
    await supabase.storage.from("clips").remove([path]);
    const { error } = await supabase.from("media").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["library"] });
  }
  async function delClip(id: string, path: string) {
    await supabase.storage.from("clips").remove([path]);
    const { error } = await supabase.from("clips").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  return (
    <div className="min-h-screen bg-background bg-glow font-sans">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <h1 className="font-display text-4xl font-bold">
          My <span className="text-primary">library</span>
        </h1>
        {isLoading && <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" />}
        {error && <p className="mt-8 text-destructive">{(error as Error).message}</p>}
        {data && (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="font-display text-lg font-bold">Scripts ({data.scripts.length})</h2>
              {data.scripts.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">No saved scripts yet.</p>
              )}
              <div className="mt-3 flex flex-col gap-3">
                {data.scripts.map((s) => (
                  <div key={s.id} className="rounded-xl bg-muted p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold">
                        <FileText className="h-4 w-4 text-primary" />
                        {s.title}
                      </div>
                      <div className="flex gap-1">
                        <Button asChild size="icon" variant="ghost" aria-label="Open in studio">
                          <Link to="/" search={{ script: s.id }}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          onClick={() => delScript(s.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{s.content}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(s.updated_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="font-display text-lg font-bold">Voice clips ({data.clips.length})</h2>
              {data.clips.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">No saved clips yet.</p>
              )}
              <div className="mt-3 flex flex-col gap-3">
                {data.clips.map((c) => (
                  <div key={c.id} className="rounded-xl bg-muted p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {c.voice} · {new Date(c.created_at).toLocaleString()}
                      </span>
                      <div className="flex gap-2">
                        <a href={c.url} download aria-label="Download">
                          <Download className="h-4 w-4 hover:text-primary" />
                        </a>
                        <button aria-label="Delete" onClick={() => delClip(c.id, c.storage_path)}>
                          <Trash2 className="h-4 w-4 hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                    <audio controls src={c.url} className="w-full" />
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.text}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border bg-card p-6 lg:col-span-2">
              <h2 className="font-display text-lg font-bold">
                Images &amp; videos ({data.media.length})
              </h2>
              {data.media.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">No saved images or videos yet.</p>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.media.map((m) => (
                  <div key={m.id} className="overflow-hidden rounded-xl bg-muted">
                    {m.kind === "video" ? (
                      <video src={m.url} controls className="aspect-video w-full object-cover" />
                    ) : (
                      <img
                        src={m.url}
                        alt={m.prompt}
                        className="aspect-video w-full object-cover"
                      />
                    )}
                    <div className="flex items-start justify-between gap-2 p-3 text-xs text-muted-foreground">
                      <span className="line-clamp-2">{m.prompt || m.kind}</span>
                      <div className="flex shrink-0 gap-2">
                        <a href={m.url} download aria-label="Download">
                          <Download className="h-4 w-4 hover:text-primary" />
                        </a>
                        <button aria-label="Delete" onClick={() => delMedia(m.id, m.storage_path)}>
                          <Trash2 className="h-4 w-4 hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
