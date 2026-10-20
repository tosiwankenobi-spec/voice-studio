import { supabase } from '@/integrations/supabase/client';
import { audioExtension } from './studio-validation';
import { deliverySettings, type Delivery } from './take-delivery';
export type ScriptTake = { id: string; scriptId: string; lineIndex: number; lineText: string; voice: string; settings: Delivery; storagePath: string; url: string; chosen: boolean };

export async function loadTakes(scriptId: string): Promise<ScriptTake[]> {
  const { data, error } = await supabase.from('script_takes').select('*').eq('script_id', scriptId).order('created_at');
  if (error) throw error;
  if (!data.length) return [];
  const signed = await supabase.storage.from('clips').createSignedUrls(data.map(t => t.storage_path), 3600);
  if (signed.error) throw signed.error;
  const urls = new Map(signed.data.map(t => [t.path, t.signedUrl]));
  return data.map(t => ({ id: t.id, scriptId: t.script_id, lineIndex: t.line_index, lineText: t.line_text, voice: t.voice, settings: deliverySettings(t.settings as Partial<Delivery>), storagePath: t.storage_path, url: urls.get(t.storage_path) ?? '', chosen: t.chosen }));
}
export async function storeTake(opts: { scriptId: string; lineIndex: number; lineText: string; voice: string; settings: Delivery; url: string; chosen: boolean }): Promise<ScriptTake> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to save takes.');
  const blob = await (await fetch(opts.url)).blob();
  const path = `${auth.user.id}/takes/${crypto.randomUUID()}.${audioExtension(blob.type)}`;
  const up = await supabase.storage.from('clips').upload(path, blob, { contentType: blob.type });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from('script_takes').insert({ script_id: opts.scriptId, line_index: opts.lineIndex, line_text: opts.lineText, voice: opts.voice, settings: { ...opts.settings }, storage_path: path, chosen: opts.chosen }).select('id').single();
  if (error || !data) { await supabase.storage.from('clips').remove([path]); throw error ?? new Error('Could not save take.'); }
  return { ...opts, id: data.id, storagePath: path };
}
export async function chooseTake(take: ScriptTake) {
  const cleared = await supabase.from('script_takes').update({ chosen: false }).eq('script_id', take.scriptId).eq('line_index', take.lineIndex).eq('line_text', take.lineText);
  if (cleared.error) throw cleared.error;
  const updated = await supabase.from('script_takes').update({ chosen: true }).eq('id', take.id);
  if (updated.error) throw updated.error;
}
export async function deleteTake(take: ScriptTake) {
  const removed = await supabase.from('script_takes').delete().eq('id', take.id);
  if (removed.error) throw removed.error;
  const file = await supabase.storage.from('clips').remove([take.storagePath]);
  if (file.error) throw file.error;
}