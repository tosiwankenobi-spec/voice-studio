import { supabase } from "@/integrations/supabase/client";

export async function saveScript(content: string, id?: string | null) {
  const title = content.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80) || "Untitled script";
  if (id) {
    const { error } = await supabase.from("scripts").update({ content, title }).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("scripts")
    .insert({ content, title })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function saveClip(opts: {
  dataUrl: string;
  voice: string;
  text: string;
  scriptId?: string | null;
}) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sign in to save clips.");
  const blob = await (await fetch(opts.dataUrl)).blob();
  const ext = blob.type.includes("mpeg") ? "mp3" : "wav";
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("clips").upload(path, blob, { contentType: blob.type });
  if (up.error) throw up.error;
  const { error } = await supabase.from("clips").insert({
    voice: opts.voice,
    text: opts.text.slice(0, 5000),
    storage_path: path,
    script_id: opts.scriptId ?? null,
  });
  if (error) throw error;
}
