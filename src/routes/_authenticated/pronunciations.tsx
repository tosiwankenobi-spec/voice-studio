import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Play, Loader2, Save, X } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { generateSpeech, speakWithMyVoice, VOICES } from '@/lib/studio.functions';
import { listVoices } from '@/lib/voices';
import { useAuth } from '@/hooks/useAuth';
export const Route = createFileRoute('/_authenticated/pronunciations')({
  validateSearch: (s: Record<string, unknown>) => ({ term: typeof s['term'] === 'string' ? s['term'] : '' }),
  head: () => ({ meta: [{ title: 'Pronunciations — Vocalis' }, { name: 'description', content: 'Save personal pronunciation spellings and hear them in your chosen voice.' }, { property: 'og:title', content: 'Pronunciations — Vocalis' }, { property: 'og:description', content: 'Your personal pronunciation dictionary for every Vocalis voiceover.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: Pronunciations,
});
function Pronunciations() {
  const { user } = useAuth(), qc = useQueryClient(), search = Route.useSearch();
  const [term, setTerm] = useState(''), [sayAs, setSayAs] = useState(''), [editing, setEditing] = useState<string | null>(null);
  const [voice, setVoice] = useState('Kore'), [busy, setBusy] = useState<string | null>(null), [audio, setAudio] = useState('');
  const speak = useServerFn(generateSpeech), mine = useServerFn(speakWithMyVoice);
  const entries = useQuery({ queryKey: ['pronunciations', user?.id], queryFn: async () => {
    const { data, error } = await supabase.from('pronunciations').select('*').order('term');
    if (error) throw error; return data;
  } });
  const voices = useQuery({ queryKey: ['voices'], queryFn: listVoices });
  useEffect(() => { setTerm(search.term); }, [search.term]);
  async function save() {
    if (!term.trim() || !sayAs.trim()) return;
    setBusy('save');
    try {
      const row = { term: term.trim(), say_as: sayAs.trim() };
      const { error } = editing ? await supabase.from('pronunciations').update(row).eq('id', editing) : await supabase.from('pronunciations').insert(row);
      if (error) throw new Error(error.code === '23505' ? 'That term is already in your dictionary.' : error.message);
      await qc.invalidateQueries({ queryKey: ['pronunciations'] }); setTerm(''); setSayAs(''); setEditing(null); toast.success('Pronunciation saved');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save pronunciation.'); } finally { setBusy(null); }
  }
  async function remove(id: string) {
    setBusy(id);
    try { const { error } = await supabase.from('pronunciations').delete().eq('id', id); if (error) throw error; await qc.invalidateQueries({ queryKey: ['pronunciations'] }); toast.success('Pronunciation deleted'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete.'); } finally { setBusy(null); }
  }
  async function test(id: string, word: string) {
    setBusy(id); setAudio('');
    try {
      const text = `Here is how I say ${word}.`;
      const saved = voices.data?.find(v => `saved:${v.id}` === voice);
      const result = saved ? await mine({ data: { text, voiceId: saved.eleven_voice_id } }) : await speak({ data: { text, voice } });
      setAudio(`data:${result.mime};base64,${result.audio}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not generate speech.'); } finally { setBusy(null); }
  }
  return <div className="min-h-screen bg-background bg-glow"><SiteHeader /><main className="mx-auto max-w-4xl px-6 pb-16">
    <h1 className="font-display text-4xl font-bold">Pronunciations</h1>
    <form onSubmit={e => { e.preventDefault(); void save(); }} className="mt-8 flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1 text-sm">Term<Input className="mt-2" aria-label="Term" placeholder="Vocalis" value={term} maxLength={120} onChange={e => setTerm(e.target.value)} required /></label>
      <label className="min-w-48 flex-1 text-sm">Say it as<Input className="mt-2" aria-label="Say it as" placeholder="voh-cal-iss" value={sayAs} maxLength={240} onChange={e => setSayAs(e.target.value)} required /></label>
      <Button type="submit" disabled={!!busy}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editing ? 'Save changes' : 'Add'}</Button>
      {editing && <Button type="button" variant="ghost" size="icon" aria-label="Cancel edit" onClick={() => { setEditing(null); setTerm(''); setSayAs(''); }}><X className="h-4 w-4" /></Button>}
    </form>
    <div className="my-6 flex flex-wrap items-center gap-3"><span className="text-sm text-muted-foreground">Test voice</span><Select value={voice} onValueChange={setVoice}><SelectTrigger className="w-56" aria-label="Test voice"><SelectValue /></SelectTrigger><SelectContent>{VOICES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}{voices.data?.map(v => <SelectItem key={v.id} value={`saved:${v.id}`}>{v.name}</SelectItem>)}</SelectContent></Select>{busy && <span role="status" className="text-sm text-muted-foreground">Working…</span>}</div>
    {audio && <audio controls autoPlay src={audio} className="mb-6 w-full" />}
    {entries.isPending && <Loader2 className="animate-spin" />}{entries.error && <p className="text-destructive">Could not load your dictionary.</p>}
    {!entries.isPending && !entries.data?.length && <p className="py-12 text-center text-muted-foreground">Your dictionary is empty.</p>}
    <div className="divide-y border-y">{entries.data?.map(row => <div key={row.id} className="flex flex-wrap items-center gap-4 py-4"><div className="min-w-0 flex-1"><p className="break-words font-semibold">{row.term}</p><p className="break-words text-sm text-muted-foreground">{row.say_as}</p></div><Button variant="outline" size="sm" disabled={!!busy} onClick={() => test(row.id, row.term)}>{busy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Test</Button><Button variant="ghost" size="icon" aria-label={`Edit ${row.term}`} disabled={!!busy} onClick={() => { setEditing(row.id); setTerm(row.term); setSayAs(row.say_as); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${row.term}`} disabled={!!busy} onClick={() => remove(row.id)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
  </main></div>;
}