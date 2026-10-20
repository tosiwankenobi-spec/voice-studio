import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Play, Pause, Download, Loader2, Upload, Save, X, AudioLines } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { AISignIn } from '@/components/AISignIn';
import { PronunciationHints } from '@/components/PronunciationHints';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateSpeech, speakWithMyVoice, VOICES } from '@/lib/studio.functions';
import { listVoices } from '@/lib/voices';
import { useAuth } from '@/hooks/useAuth';
import { avatarPalette, drawAvatar, mouthLevel, splitNarration, decodeNarration, exportAvatar, type AvatarStyle } from '@/lib/avatar';
import { supabase } from '@/integrations/supabase/client';
export const Route = createFileRoute('/avatar')({ head: () => ({ meta: [{ title: 'Talking Avatar — Vocalis' }, { name: 'description', content: 'Create animated character videos with your script and chosen narration voice.' }, { property: 'og:title', content: 'Talking Avatar — Vocalis' }, { property: 'og:description', content: 'Turn narration into a talking animated character video.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }), component: Avatar });
function Avatar() {
  const { user } = useAuth(), speak = useServerFn(generateSpeech), mine = useServerFn(speakWithMyVoice);
  const voices = useQuery({ queryKey: ['voices'], queryFn: listVoices, enabled: !!user });
  const [text, setText] = useState(''), [voice, setVoice] = useState('Kore'), [style, setStyle] = useState<AvatarStyle>('robot'), [portrait, setPortrait] = useState(false);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null), [playing, setPlaying] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [result, setResult] = useState(''), [mime, setMime] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null), input = useRef<HTMLInputElement>(null), playback = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode; start: number } | null>(null), abort = useRef<AbortController | null>(null);
  const resultRef = useRef('');
  function stop() { const p = playback.current; playback.current = null; if (p) { try { p.source.stop(); } catch { /* ended */ } void p.ctx.close(); } setPlaying(false); }
  useEffect(() => {
    const c = canvas.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
    let frame = 0;
    const tick = () => { const p = playback.current, t = p ? Math.max(0, p.ctx.currentTime - p.start) : 0;
      drawAvatar(ctx, c.width, c.height, style, p && buffer ? mouthLevel(buffer.getChannelData(0), buffer.sampleRate, t) : 0, t, avatarPalette(c));
      frame = requestAnimationFrame(tick);
    }; tick(); return () => cancelAnimationFrame(frame);
  }, [buffer, style, portrait]);
  useEffect(() => () => { abort.current?.abort(); const p = playback.current; if (p) void p.ctx.close(); if (resultRef.current) URL.revokeObjectURL(resultRef.current); }, []);
  function clearResult() { if (resultRef.current) URL.revokeObjectURL(resultRef.current); resultRef.current = ''; setResult(''); }
  async function narrate() {
    if (!user) return; stop(); clearResult(); setBusy(true);
    try {
      const parts = splitNarration(text), urls: string[] = [], saved = voices.data?.find(v => voice === `saved:${v.id}`);
      for (let i = 0; i < parts.length; i++) { setStatus(`Generating narration ${i + 1} of ${parts.length}…`); const part = parts[i]; if (!part) continue;
        const r = saved ? await mine({ data: { text: part, voiceId: saved.eleven_voice_id } }) : await speak({ data: { text: part, voice } }); urls.push(`data:${r.mime};base64,${r.audio}`);
      }
      setStatus('Preparing your avatar…'); setBuffer(await decodeNarration(urls)); toast.success('Narration ready');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Narration failed.'); } finally { setBusy(false); setStatus(''); }
  }
  async function upload(file: File) { stop(); clearResult(); setBusy(true); setStatus('Opening narration…'); try { setBuffer(await decodeNarration([URL.createObjectURL(file)])); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not open audio.'); } finally { setBusy(false); setStatus(''); } }
  async function play() { if (playing) { stop(); return; } if (!buffer) return; try { const ctx = new AudioContext(); await ctx.resume(); const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination); playback.current = { ctx, source, start: ctx.currentTime }; source.onended = () => stop(); source.start(); setPlaying(true); } catch (e) { toast.error(e instanceof Error ? e.message : 'Preview failed.'); } }
  async function render() {
    const c = canvas.current; if (!c || !buffer) return; stop(); clearResult(); setBusy(true); const controller = new AbortController(); abort.current = controller;
    try { const blob = await exportAvatar(buffer, style, portrait, avatarPalette(c), percent => setStatus(`Creating video… ${Math.round(percent)}%`), controller.signal); const url = URL.createObjectURL(blob); resultRef.current = url; setResult(url); setMime(blob.type); toast.success('Video ready'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Video export failed.'); } finally { setBusy(false); setStatus(''); abort.current = null; }
  }
  async function save() { if (!user || !result) return; setBusy(true); setStatus('Saving video…'); try { const blob = await (await fetch(result)).blob(); const path = `${user.id}/avatars/${crypto.randomUUID()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`; const up = await supabase.storage.from('clips').upload(path, blob, { contentType: blob.type }); if (up.error) throw up.error; const { error } = await supabase.from('media').insert({ kind: 'video', prompt: `Talking avatar: ${text || 'Uploaded narration'}`.slice(0, 2000), storage_path: path }); if (error) { await supabase.storage.from('clips').remove([path]); throw error; } toast.success('Video saved to My Library'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save video.'); } finally { setBusy(false); setStatus(''); } }
  return <div className="min-h-screen bg-background bg-glow"><SiteHeader /><main className="mx-auto max-w-6xl px-6 pb-16"><h1 className="font-display text-4xl font-bold">Talking avatar</h1><p className="mt-2 text-muted-foreground">Animated characters · Your script, your voice.</p>{!user && <AISignIn />}
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]"><div className="min-w-0"><canvas ref={canvas} width={portrait ? 720 : 1280} height={portrait ? 1280 : 720} aria-label="Talking avatar preview" className={`mx-auto w-full bg-background ${portrait ? 'aspect-[9/16] max-w-80' : 'aspect-video'}`} /><div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!buffer || busy} onClick={play}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Pause' : 'Preview'}</Button><span className="text-sm text-muted-foreground">{buffer ? `${buffer.duration.toFixed(1)} s narration` : 'No narration yet'}</span><Button className="ml-auto" disabled={!buffer || busy} onClick={render}><Download className="h-4 w-4" />Create video</Button></div>{status && <div role="status" className="mt-4 flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" />{status}{abort.current && <Button size="icon" variant="ghost" aria-label="Cancel export" onClick={() => abort.current?.abort()}><X className="h-4 w-4" /></Button>}</div>}{result && <div className="mt-6"><video controls src={result} aria-label="Created avatar video" className="max-h-96 w-full" /><div className="mt-3 flex gap-3"><Button asChild><a href={result} download={`vocalis-avatar.${mime.includes('mp4') ? 'mp4' : 'webm'}`}><Download className="h-4 w-4" />Download video</a></Button><Button variant="outline" disabled={!user || busy} onClick={save}><Save className="h-4 w-4" />Save to library</Button></div></div>}</div>
    <aside className="min-w-0 space-y-6"><div><h2 className="mb-3 font-display text-lg font-bold">Character</h2><div className="flex gap-2">{(['robot', 'presenter'] as const).map(value => <Button key={value} variant={style === value ? 'default' : 'outline'} disabled={busy} onClick={() => { setStyle(value); clearResult(); }}>{value === 'robot' ? 'Robot' : 'Presenter'}</Button>)}</div></div><div><h2 className="mb-3 font-display text-lg font-bold">Video size</h2><div className="flex gap-2"><Button size="sm" variant={!portrait ? 'default' : 'outline'} disabled={busy} onClick={() => { setPortrait(false); clearResult(); }}>YouTube · 16:9</Button><Button size="sm" variant={portrait ? 'default' : 'outline'} disabled={busy} onClick={() => { setPortrait(true); clearResult(); }}>Shorts · 9:16</Button></div></div><div><label className="font-display text-lg font-bold" htmlFor="avatar-script">Script</label><Textarea id="avatar-script" aria-label="Avatar script" className="mt-3 min-h-52" value={text} onChange={e => setText(e.target.value)} placeholder="Paste your video script…" disabled={busy} /><PronunciationHints text={text} /></div><div><label className="text-sm font-semibold">Voice</label><Select value={voice} onValueChange={setVoice} disabled={busy}><SelectTrigger className="mt-2" aria-label="Avatar voice"><SelectValue /></SelectTrigger><SelectContent>{VOICES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}{voices.data?.map(v => <SelectItem key={v.id} value={`saved:${v.id}`}>{v.name}</SelectItem>)}</SelectContent></Select></div><Button className="w-full" disabled={!text.trim() || !user || busy} onClick={narrate}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}Generate narration</Button><input ref={input} type="file" accept="audio/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} /><Button variant="outline" className="w-full" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />Upload narration</Button></aside></div>
  </main></div>;
}