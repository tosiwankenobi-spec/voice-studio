import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, Loader2, Save, Trash2, AudioLines } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateSpeech, speakWithMyVoice } from '@/lib/studio.functions';
import { listVoices } from '@/lib/voices';
import { loadTakes, storeTake, chooseTake, deleteTake, type ScriptTake } from '@/lib/takes';
import { DEFAULT_DELIVERY, PAUSES, assertTakeCapacity, sentences, type Delivery } from '@/lib/take-delivery';
import { exportTakes } from '@/lib/take-export';
import { saveClip } from '@/lib/library';

export function LineTakes({ text, scriptId, ensureScript, voice, style, signedIn, disabled, onVoiceChange }: {
  text: string; scriptId: string | null; ensureScript: () => Promise<string>; voice: string; style: string;
  signedIn: boolean; disabled: boolean; onVoiceChange: (voice: string) => void;
}) {
  const stock = useServerFn(generateSpeech), cloned = useServerFn(speakWithMyVoice);
  const voices = useQuery({ queryKey: ['voices'], queryFn: listVoices, enabled: signedIn });
  const [takes, setTakes] = useState<ScriptTake[]>([]);
  const [settings, setSettings] = useState<Record<string, Delivery>>({});
  const [busy, setBusy] = useState<number | 'export' | 'load' | null>(null);
  const [status, setStatus] = useState('');
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const active = useRef(false);
  const lines = sentences(text);
  const lineKey = (i: number, line: string) => `${i}:${line}`;
  const forLine = (i: number, line: string) => takes.filter(t => t.lineIndex === i && t.lineText === line);
  const chosen = lines.map((line, i) => forLine(i, line).find(t => t.chosen));
  const previousScript = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn) { setTakes([]); return; }
    if (!scriptId) return;
    let cancelled = false;
    if (previousScript.current && previousScript.current !== scriptId) setTakes([]);
    previousScript.current = scriptId;
    setBusy('load');
    loadTakes(scriptId).then(rows => {
      if (cancelled) return;
      setTakes(current => [...rows, ...current.filter(t => t.scriptId === scriptId && !rows.some(r => r.id === t.id))]);
      setSettings(current => {
        const restored = { ...current };
        rows.forEach(t => { if (t.chosen || !restored[lineKey(t.lineIndex, t.lineText)]) restored[lineKey(t.lineIndex, t.lineText)] = t.settings; });
        return restored;
      });
    }).catch(e => { if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not load takes.'); })
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, [scriptId, signedIn]);
  useEffect(() => { setFinalUrl(null); }, [text, takes]);
  const change = (i: number, line: string, value: Partial<Delivery>) => setSettings(s => ({ ...s, [lineKey(i, line)]: { ...DEFAULT_DELIVERY, ...s[lineKey(i, line)], ...value } }));

  async function generate(i: number, line: string) {
    if (!signedIn || active.current) return;
    active.current = true; setBusy(i); setStatus(`Generating line ${i + 1}…`);
    try {
      assertTakeCapacity(forLine(i, line).length);
      const id = scriptId ?? await ensureScript();
      // Read durable rows before spending, including takes created in other tabs.
      const existing = await loadTakes(id);
      const current = existing.filter(t => t.lineIndex === i && t.lineText === line);
      assertTakeCapacity(current.length);
      const delivery = settings[lineKey(i, line)] ?? DEFAULT_DELIVERY;
      const savedVoice = voices.data?.find(v => `saved:${v.id}` === voice);
      if (voice.startsWith('saved:') && !savedVoice) throw new Error('Choose one of your saved voices.');
      const result = savedVoice
        ? await cloned({ data: { text: line, voiceId: savedVoice.eleven_voice_id, delivery } })
        : await stock({ data: { text: line, voice, style, delivery } });
      setStatus(`Saving line ${i + 1}…`);
      const take = await storeTake({ scriptId: id, lineIndex: i, lineText: line, voice: savedVoice?.name ?? voice, settings: delivery, url: `data:${result.mime};base64,${result.audio}`, chosen: !current.some(t => t.chosen) });
      setTakes(t => [...t.filter(x => x.id !== take.id), take]);
      toast.success(`Take ${current.length + 1} saved`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Generation failed.'); }
    finally { active.current = false; setBusy(null); setStatus(''); }
  }
  async function pick(take: ScriptTake) {
    if (active.current) return;
    active.current = true; setBusy(take.lineIndex);
    try {
      await chooseTake(take);
      setTakes(t => t.map(x => x.lineIndex === take.lineIndex && x.lineText === take.lineText ? { ...x, chosen: x.id === take.id } : x));
      setSettings(s => ({ ...s, [lineKey(take.lineIndex, take.lineText)]: take.settings }));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not choose take.'); }
    finally { active.current = false; setBusy(null); }
  }
  async function remove(take: ScriptTake) {
    if (active.current) return;
    active.current = true; setBusy(take.lineIndex);
    try { await deleteTake(take); setTakes(t => t.filter(x => x.id !== take.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete take.'); }
    finally { active.current = false; setBusy(null); }
  }
  async function join(save: boolean) {
    if (active.current || chosen.some(t => !t)) return;
    active.current = true; setBusy('export'); setStatus('Joining chosen takes…');
    try {
      const ordered = chosen.filter((t): t is ScriptTake => !!t);
      const blob = await exportTakes(ordered);
      const url = URL.createObjectURL(blob);
      setFinalUrl(url);
      if (save) { await saveClip({ dataUrl: url, voice: 'Chosen takes', text, scriptId }); toast.success('Joined takes saved to your library'); }
      else { const a = document.createElement('a'); a.href = url; a.download = 'vocalis-chosen-takes.wav'; a.click(); }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not join takes.'); }
    finally { active.current = false; setBusy(null); setStatus(''); }
  }
  return <section className="mt-6 border-t pt-6" aria-label="Line takes">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-xl font-bold">Lines & takes</h2>
      {!!voices.data?.length && <Select value={voice} onValueChange={onVoiceChange}><SelectTrigger className="w-52" aria-label="Take voice"><SelectValue placeholder="Voice" /></SelectTrigger><SelectContent>
        {!voice.startsWith('saved:') && <SelectItem value={voice}>{voice}</SelectItem>}
        {voice.startsWith('saved:') && <SelectItem value="Kore">Kore</SelectItem>}
        {voices.data.map(v => <SelectItem key={v.id} value={`saved:${v.id}`}>{v.name}</SelectItem>)}
      </SelectContent></Select>}
    </div>
    {lines.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No lines yet.</p>}
    <div className="mt-3 divide-y">
      {lines.map((line, i) => {
        const delivery = settings[lineKey(i, line)] ?? DEFAULT_DELIVERY;
        const list = forLine(i, line);
        const locked = disabled || busy !== null || !signedIn;
        return <article key={lineKey(i, line)} className="py-4" aria-label={`Line ${i + 1}`}>
          <div className="flex items-start gap-3"><span className="mt-1 w-5 shrink-0 text-sm text-muted-foreground">{i + 1}</span><p className="min-w-0 flex-1 break-words leading-relaxed">{line}</p><span className="shrink-0 text-xs text-muted-foreground">{list.length}/3</span></div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Pace<Select value={delivery.pace} onValueChange={v => change(i, line, { pace: v as Delivery['pace'] })} disabled={locked}><SelectTrigger className="mt-1 w-28" aria-label={`Pace line ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{['slower', 'normal', 'faster'].map(p => <SelectItem key={p} value={p}>{p[0]?.toUpperCase()}{p.slice(1)}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-xs text-muted-foreground">Emphasis<Select value={delivery.emphasis || '__none'} onValueChange={v => change(i, line, { emphasis: v === '__none' ? '' : v })} disabled={locked}><SelectTrigger className="mt-1 w-32" aria-label={`Emphasis line ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">None</SelectItem>{[...new Set(line.split(/\s+/))].map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-xs text-muted-foreground">Pause after<Select value={String(delivery.pause)} onValueChange={v => change(i, line, { pause: Number(v) })} disabled={locked}><SelectTrigger className="mt-1 w-28" aria-label={`Pause line ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{PAUSES.map(p => <SelectItem key={p} value={String(p)}>{p} s</SelectItem>)}</SelectContent></Select></label>
            <Button size="sm" disabled={locked || list.length >= 3} onClick={() => generate(i, line)}>{busy === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}Generate take</Button>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-3">{list.map((take, n) => <div key={take.id} className={`min-w-0 rounded-lg border p-3 ${take.chosen ? 'border-primary bg-primary/10' : 'bg-muted'}`}>
            <div className="flex items-center justify-between"><Button variant={take.chosen ? 'secondary' : 'ghost'} size="sm" disabled={locked} onClick={() => pick(take)} aria-label={`Choose take ${n + 1} line ${i + 1}`}>{take.chosen && <Check className="h-3 w-3" />}Take {n + 1}</Button><Button variant="ghost" size="icon" disabled={locked} onClick={() => remove(take)} aria-label={`Delete take ${n + 1} line ${i + 1}`}><Trash2 className="h-4 w-4" /></Button></div>
            <audio controls src={take.url} className="mt-2 h-9 w-full min-w-0" />
            <p className="mt-2 break-words text-xs text-muted-foreground">{take.voice} · {take.settings.pace} · {take.settings.pause} s{take.settings.emphasis ? ` · ${take.settings.emphasis}` : ''}</p>
          </div>)}</div>
        </article>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={!signedIn || busy !== null || !lines.length || chosen.some(t => !t)} onClick={() => join(false)}><Download className="h-4 w-4" />Export chosen takes</Button><Button disabled={!signedIn || busy !== null || !lines.length || chosen.some(t => !t)} onClick={() => join(true)}><Save className="h-4 w-4" />Save joined audio</Button></div>
    {status && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />{status}</p>}
    {finalUrl && <audio aria-label="Joined takes" controls src={finalUrl} className="mt-4 w-full" />}
  </section>;
}