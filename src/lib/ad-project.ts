import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { AdScene } from "./ad.functions";
import { audioExtension } from "./studio-validation";

export type AdProjectScene = AdScene & {
  id: string;
  audio?: string | undefined;
  audioPath?: string | undefined;
  seconds?: number | undefined;
  aiImage?: string | undefined;
  aiImagePath?: string | undefined;
  busy?: string | undefined;
};

type StoredScene = AdScene & {
  id: string;
  audioPath?: string;
  aiImagePath?: string;
  seconds?: number;
};

/** Save storage references, never expiring signed URLs or large data URLs, in scene JSON. */
export async function saveAdProject(input: {
  userId: string;
  id: string | null;
  sourceUrl: string;
  product: Json;
  settings: Json;
  scenes: AdProjectScene[];
}) {
  const bucket = supabase.storage.from("clips");
  const uploaded: string[] = [];
  let committed = false;
  const paths = (value: Json) =>
    (Array.isArray(value) ? value : []).flatMap((scene) => {
      if (!scene || typeof scene !== "object" || Array.isArray(scene)) return [];
      return [scene.audioPath, scene.aiImagePath].filter(
        (path): path is string =>
          typeof path === "string" && path.startsWith(`${input.userId}/ads/`) && !path.includes(".."),
      );
    });
  const store = async (url: string, kind: "audio" | "image") => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not read a generated ad asset.");
    const blob = await response.blob();
    const ext =
      kind === "audio"
        ? audioExtension(blob.type)
        : blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const path = `${input.userId}/ads/${crypto.randomUUID()}.${ext}`;
    const result = await bucket.upload(path, blob, { contentType: blob.type });
    if (result.error) throw result.error;
    uploaded.push(path);
    return path;
  };
  try {
    let previous: string[] = [];
    if (input.id) {
      const prior = await supabase.from("ad_projects").select("scenes").eq("id", input.id).single();
      if (prior.error) throw prior.error;
      previous = paths(prior.data.scenes);
    }
    const scenes: StoredScene[] = [];
    for (const scene of input.scenes) {
      const audioPath =
        scene.audioPath || (scene.audio ? await store(scene.audio, "audio") : undefined);
      const aiImagePath =
        scene.aiImagePath || (scene.aiImage ? await store(scene.aiImage, "image") : undefined);
      scenes.push({
        id: scene.id,
        narration: scene.narration,
        image: scene.image,
        imagePrompt: scene.imagePrompt,
        motion: scene.motion,
        ...(audioPath ? { audioPath } : {}),
        ...(aiImagePath ? { aiImagePath } : {}),
        ...(scene.seconds !== undefined ? { seconds: scene.seconds } : {}),
      });
    }
    const row = {
      source_url: input.sourceUrl,
      product: input.product,
      settings: input.settings,
      scenes: scenes as unknown as Json,
    };
    let id = input.id;
    if (id) {
      const saved = await supabase
        .from("ad_projects")
        .update(row)
        .eq("id", id)
        .select("id")
        .single();
      if (saved.error) throw saved.error;
    } else {
      const saved = await supabase.from("ad_projects").insert(row).select("id").single();
      if (saved.error) throw saved.error;
      id = saved.data.id;
    }
    committed = true;
    const retained = new Set(paths(row.scenes));
    const superseded = [...new Set(previous)].filter((path) => !retained.has(path));
    if (superseded.length) {
      // Cleanup failure must not roll back assets referenced by the committed row.
      try {
        const cleanup = await bucket.remove(superseded);
        if (cleanup.error) console.warn("Could not remove superseded ad assets.", cleanup.error);
      } catch (error) {
        console.warn("Could not remove superseded ad assets.", error);
      }
    }
    return { id, scenes };
  } catch (error) {
    if (!committed && uploaded.length) await bucket.remove(uploaded);
    throw error;
  }
}

/** New signed URLs on every open; old projects containing only scene text still load. */
export async function restoreAdScenes(value: Json, userId: string): Promise<AdProjectScene[]> {
  if (!Array.isArray(value)) return [];
  const bucket = supabase.storage.from("clips");
  const sign = async (path: unknown) => {
    if (typeof path !== "string" || !path.startsWith(`${userId}/ads/`) || path.includes(".."))
      throw new Error("Invalid saved ad asset.");
    const result = await bucket.createSignedUrl(path, 3600);
    if (result.error) throw result.error;
    return result.data.signedUrl;
  };
  return Promise.all(
    value.map(async (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid saved ad scene.");
      const scene = raw as unknown as StoredScene;
      const [audio, aiImage] = await Promise.all([
        scene.audioPath ? sign(scene.audioPath) : undefined,
        scene.aiImagePath ? sign(scene.aiImagePath) : undefined,
      ]);
      return { ...scene, id: scene.id || crypto.randomUUID(), audio, aiImage };
    }),
  );
}
