import { supabase } from "@/integrations/supabase/client";
import { checkVideo, startVideo } from "@/lib/media.functions";
import { waitForVideo } from "./video-job";

/** Starts a video job and polls until it's stored. Returns a playable URL. */
export async function animate(opts: {
  prompt: string;
  image?: string | undefined;
  seconds?: number | undefined;
  jobId?: string | undefined;
  signal?: AbortSignal | undefined;
  onJobStarted?: (id: string) => void;
  onProgress?: (p: number) => void;
}) {
  opts.signal?.throwIfAborted();
  const id =
    opts.jobId ??
    (await startVideo({ data: { prompt: opts.prompt, image: opts.image, seconds: opts.seconds } }))
      .id;
  opts.onJobStarted?.(id);
  return waitForVideo({
    signal: opts.signal,
    onProgress: opts.onProgress,
    poll: async (signal) => {
      const r = await checkVideo({ data: { id, prompt: opts.prompt }, signal });
      return { ...r, ...(r.url ? { result: r.url } : {}) };
    },
  });
}

export async function saveImage(dataUrl: string, prompt: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to save images.");
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${u.user.id}/images/${crypto.randomUUID()}.png`;
  const up = await supabase.storage
    .from("clips")
    .upload(path, blob, { contentType: blob.type || "image/png" });
  if (up.error) throw up.error;
  const { error } = await supabase
    .from("media")
    .insert({ kind: "image", prompt: prompt.slice(0, 2000), storage_path: path });
  if (error) throw error;
}

export function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
