import { supabase } from "@/integrations/supabase/client";
import { cloneMyVoice } from "@/lib/studio.functions";

export type SavedVoice = { id: string; name: string; eleven_voice_id: string; sample_path: string | null; created_at: string; sampleUrl: string };

export const PREVIEW_LINE = "Hi! This is a quick preview of how I sound in Vocalis.";

export async function listVoices(): Promise<SavedVoice[]> {
  const { data, error } = await supabase.from("voices").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const paths = data.map((v) => v.sample_path).filter((p): p is string => !!p);
  const signed = paths.length ? await supabase.storage.from("clips").createSignedUrls(paths, 3600) : { data: [] };
  const urls = new Map((signed.data ?? []).map((x) => [x.path, x.signedUrl]));
  return data.map((v) => ({ ...v, sampleUrl: v.sample_path ? urls.get(v.sample_path) ?? "" : "" }));
}

/** Copies a voice from a recording, stores the recording as its preview, and names it. */
export async function createVoice(file: File, name: string, consent: boolean) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to save voices.");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("consent", String(consent));
  fd.append("name", name);
  const { id, voiceId } = await cloneMyVoice({ data: fd });
  const ext = file.name.split(".").pop() || "webm";
  const path = `${u.user.id}/voices/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("clips").upload(path, file, { contentType: file.type || "audio/webm" });
  if (!up.error) {
    const { error } = await supabase.from("voices").update({ sample_path: path }).eq("id", id);
    if (error) await supabase.storage.from("clips").remove([path]);
  }
  return { id, voiceId };
}

export async function renameVoice(id: string, name: string) {
  const { error } = await supabase.from("voices").update({ name: name.trim().slice(0, 80) || "My voice" }).eq("id", id);
  if (error) throw error;
}
