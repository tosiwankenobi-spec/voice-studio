import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Scissors, Trash2, Undo2, Download, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cutSource, encodeWav, locate, move, quietestNear, renderSegments, segLen, splitAt, splitAtWord, totalLength, wordRange, wordsOnTimeline, type Segment, type Word } from "@/lib/audio";
import { changedSpan, patchRange, sliceTimeline, matchPatch } from '@/lib/patch';
import { AudioCleanup, type CleanupOptions } from './AudioCleanup';
import { pauseCuts, placedCleanupWords, reduceNoise, normalizeLoudness, integratedLoudness } from '@/lib/cleanup';

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const uid = () => crypto.randomUUID();

function Waveform({ buffer, seg }: { buffer: AudioBuffer; seg: Segment }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = (c.width = c.clientWidth * devicePixelRatio);
    const h = (c.height = c.clientHeight * devicePixelRatio);
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(c).color;
    const data = buffer.getChannelData(0);
    const s0 = Math.floor(seg.start * buffer.sampleRate);
    const per = Math.max(1, Math.floor((segLen(seg) * buffer.sampleRate) / w));
    for (let x = 0; x < w; x++) {
      let peak = 0;
      const from = s0 + x * per;
      for (let i = 0; i < per; i += 8) peak = Math.max(peak, Math.abs(data[from + i] ?? 0));
      const bar = Math.max(1, peak * h * 0.9);
      g.fillRect(x, (h - bar) / 2, 1, bar);
    }
  }, [buffer, seg]);
  return <canvas ref={ref} className="h-full w-full text-primary" />;
}

export type TimelineApi = { timelineWords: () => string[]; cutPlaced: (ks: number[]) => boolean; patch: (before: string, after: string, url: string) => Promise<void> };
type PatchRecord = { id: string; phrase: string; replaced: Segment[]; removedWords: Word[] };
type Snapshot = { segs: Segment[]; words: Word[]; patches: PatchRecord[]; buffer: AudioBuffer | null };

export function Timeline({ file, words: inputWords = [], onSave, apiRef, onTranscriptSync }: { file: File; words?: Word[]; onSave?: ((blob: Blob) => void) | undefined; apiRef?: RefObject<TimelineApi | null>; onTranscriptSync?: (text: string) => void }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [segs, setSegs] = useState<Segment[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [words, setWords] = useState<Word[]>(inputWords);
  const [patches, setPatches] = useState<PatchRecord[]>([]);
  useEffect(() => { setWords(inputWords); }, [inputWords]);
  const [selected, setSelected] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const clock = useRef({ ctxStart: 0, from: 0 });
  const raf = useRef(0);
  const cleanupBefore = useRef<Snapshot | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);

  const total = useMemo(() => totalLength(segs), [segs]);
  const placed = useMemo(() => wordsOnTimeline(segs, words), [segs, words]);
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null);
  const currentWord = useMemo(() => {
    let k = -1;
    placed.forEach((p, idx) => { if (p.at <= playhead + 0.02) k = idx; });
    return k;
  }, [placed, playhead]);

  useEffect(() => {
    let cancelled = false;
    setBuffer(null);
    (async () => {
      try {
        const ctx = (ctxRef.current ??= new AudioContext());
        const buf = await ctx.decodeAudioData(await file.arrayBuffer());
        if (cancelled) return;
        setBuffer(buf);
        setSegs([{ id: uid(), start: 0, end: buf.duration }]);
        setHistory([]);
        setPatches([]);
        setPlayhead(0);
      } catch {
        toast.error("This file's audio couldn't be opened on the timeline.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const stop = useCallback(() => {
    sources.current.forEach((s) => {
      s.onended = null;
      try { s.stop(); } catch { /* already stopped */ }
    });
    sources.current = [];
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const play = useCallback(
    (from: number) => {
      const ctx = ctxRef.current;
      if (!ctx || !buffer || !segs.length) return;
      stop();
      if (from >= total - 0.01) from = 0;
      void ctx.resume();
      const hit = locate(segs, from)!;
      const t0 = ctx.currentTime + 0.05;
      let at = t0;
      segs.slice(hit.index).forEach((s, i) => {
        const off = i === 0 ? hit.offset : 0;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(at, s.start + off, segLen(s) - off);
        at += segLen(s) - off;
        sources.current.push(src);
      });
      clock.current = { ctxStart: t0, from };
      setPlaying(true);
      const tick = () => {
        const t = clock.current.from + Math.max(0, ctx.currentTime - clock.current.ctxStart);
        if (t >= total) {
          setPlayhead(total);
          stop();
          return;
        }
        setPlayhead(t);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [buffer, segs, total, stop],
  );

  const syncText = (next: Segment[], timed = words) => onTranscriptSync?.(wordsOnTimeline(next, timed).map(p => timed[p.i]?.w ?? '').join(' '));
  const commit = (next: Segment[]) => {
    if (next === segs) return;
    stop();
    setHistory((h) => [...h.slice(-50), { segs, words, patches }]);
    setSegs(next);
    setPlayhead((p) => Math.min(p, totalLength(next)));
    syncText(next);
  };

  const split = () =>
    commit(words.length && buffer ? splitAtWord(segs, playhead, words, uid, (t) => quietestNear(buffer, t)) : splitAt(segs, playhead, uid));
  const cutPlaced = (ks: number[]) => {
    if (!buffer || !ks.length) return false;
    let next = segs;
    for (const k of ks) {
      const p = placed[k];
      if (!p) continue;
      const { a, b } = wordRange(words, p.i);
      const qa = p.i === 0 ? a : quietestNear(buffer, a, 0.15);
      const qb = p.i === words.length - 1 ? b : quietestNear(buffer, b, 0.15);
      next = cutSource(next, Math.min(qa, words[p.i]!.s), Math.max(qb, words[p.i]!.e), uid);
    }
    if (!next.length) { toast.error("You can't cut every word."); return false; }
    commit(next);
    setPicked(null);
    return true;
  };
  const cutWords = () => {
    if (!picked) return;
    const lo = Math.min(picked.from, picked.to);
    const hi = Math.max(picked.from, picked.to);
    cutPlaced(Array.from({ length: hi - lo + 1 }, (_, n) => lo + n));
  };
  async function patch(before: string, after: string, url: string) {
    const ctx = ctxRef.current;
    if (!ctx || !buffer) throw new Error('Wait for the timeline to load.');
    const span = changedSpan(before, after);
    if (!span) throw new Error('Rewrite or add a word first.');
    const range = patchRange(segs, words, span.oldStart, span.oldEnd, t => quietestNear(buffer, t, 0.15));
    const rendered = await renderSegments(buffer, segs);
    const replacement = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const original = Array.from({ length: rendered.numberOfChannels }, (_, i) => rendered.getChannelData(i));
    const samples = Array.from({ length: replacement.numberOfChannels }, (_, i) => replacement.getChannelData(i));
    const matched = matchPatch(original, samples, ctx.sampleRate, range.start, range.end);
    const patchLength = matched.channels[0]?.length ?? 0;
    const combined = ctx.createBuffer(buffer.numberOfChannels, buffer.length + patchLength, ctx.sampleRate);
    for (let ch = 0; ch < combined.numberOfChannels; ch++) {
      combined.getChannelData(ch).set(buffer.getChannelData(ch));
      combined.getChannelData(ch).set(matched.channels[Math.min(ch, matched.channels.length - 1)] ?? [], buffer.length);
    }
    const id = uid(), sourceStart = buffer.duration, sourceEnd = combined.duration;
    const replaced = sliceTimeline(segs, matched.start, matched.end);
    const removedWords = wordsOnTimeline(replaced, words).map(p => words[p.i]).filter((w): w is Word => !!w);
    const phraseWords = span.phrase.split(/\s+/);
    const weight = phraseWords.reduce((sum, w) => sum + Math.max(1, w.length), 0);
    let time = sourceStart;
    const newWords = phraseWords.map(w => { const s = time; time += (sourceEnd - sourceStart) * Math.max(1, w.length) / weight; return { w, s, e: time, patchId: id }; });
    const nextWords = [...words, ...newWords].sort((a, b) => a.s - b.s);
    const next = [...sliceTimeline(segs, 0, matched.start), { id: uid(), start: sourceStart, end: sourceEnd, patchId: id }, ...sliceTimeline(segs, matched.end, total)];
    stop();
    setHistory(h => [...h.slice(-50), { segs, words, patches }]);
    setBuffer(combined); setSegs(next); setWords(nextWords);
    setPatches(p => [...p, { id, phrase: span.phrase, replaced, removedWords }]);
    setPlayhead(matched.start); setPicked(null);
    onTranscriptSync?.(after);
  }
  function undoPatch(record: PatchRecord) {
    const indices = segs.map((s, i) => s.patchId === record.id ? i : -1).filter(i => i >= 0);
    const first = indices[0], last = indices.at(-1);
    if (first === undefined || last === undefined) return;
    if (indices.length !== last - first + 1) { toast.error('Undo rearrangement before undoing this patch.'); return; }
    if (patches.some(p => p.id !== record.id && p.replaced.some(s => s.patchId === record.id))) { toast.error('Undo the newer overlapping patch first.'); return; }
    const next = [...segs.slice(0, first), ...record.replaced, ...segs.slice(last + 1)];
    const timed = words.filter(w => w.patchId !== record.id);
    stop(); setHistory(h => [...h.slice(-50), { segs, words, patches }]);
    setSegs(next); setWords(timed); setPatches(p => p.filter(x => x.id !== record.id)); syncText(next, timed);
  }
  if (apiRef) apiRef.current = { timelineWords: () => placed.map((p) => words[p.i]?.w ?? ''), cutPlaced, patch };
  const pickWord = (k: number, extend: boolean) => {
    setPicked((cur) => (extend && cur ? { from: cur.from, to: k } : { from: k, to: k }));
    const at = placed[k]?.at ?? 0;
    setPlayhead(at);
    if (playing) play(at);
  };
  const del = () => {
    if (!selected || segs.length <= 1) return;
    commit(segs.filter((s) => s.id !== selected));
    setSelected(null);
  };
  const shift = (dir: -1 | 1) => {
    const i = segs.findIndex((s) => s.id === selected);
    if (i >= 0) commit(move(segs, i, i + dir));
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    stop();
    setHistory((h) => h.slice(0, -1));
    setSegs(prev.segs); setWords(prev.words); setPatches(prev.patches); syncText(prev.segs, prev.words);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); if (playing) stop(); else play(playhead); }
      else if (e.key === "s" || e.key === "S") split();
      else if (e.key === "Delete" || e.key === "Backspace") { if (picked) cutWords(); else del(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function exportAudio(save: boolean) {
    if (!buffer) return;
    setExporting(true);
    try {
      const blob = encodeWav(await renderSegments(buffer, segs));
      if (save && onSave) onSave(blob);
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "vocalis-edit.wav";
        a.click();
      }
    } finally {
      setExporting(false);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(total, ((e.clientX - r.left) / r.width) * total));
    setPlayhead(t);
    if (playing) play(t);
  }

  if (!buffer) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 rounded-2xl border bg-card text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading timeline…
      </div>
    );
  }

  const selIdx = segs.findIndex((s) => s.id === selected);

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Timeline</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => (playing ? stop() : play(playhead))} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <span className="w-36 whitespace-nowrap text-center font-mono text-sm tabular-nums text-muted-foreground">
            {fmt(playhead)} / {fmt(total)}
          </span>
          <Button size="sm" variant="outline" onClick={split} title="Split at playhead (S)"><Scissors className="h-4 w-4" /> Split</Button>
          <Button size="sm" variant="outline" onClick={del} disabled={!selected || segs.length <= 1} title="Delete clip (Del)"><Trash2 className="h-4 w-4" /> Cut</Button>
          <Button size="icon" variant="outline" onClick={() => shift(-1)} disabled={selIdx <= 0} aria-label="Move left"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => shift(1)} disabled={selIdx < 0 || selIdx >= segs.length - 1} aria-label="Move right"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={undo} disabled={!history.length} aria-label="Undo"><Undo2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="relative mt-4 select-none">
        <div className="flex h-24 gap-1 overflow-hidden rounded-xl bg-muted p-1">
          {segs.map((s, i) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null) commit(move(segs, dragIdx, i)); setDragIdx(null); }}
              onClick={(e) => { e.stopPropagation(); setSelected(s.id); }}
              style={{ flexGrow: total ? (segLen(s) / total) * 1000 : 1, flexBasis: 0 }}
              className={`relative min-w-[6px] cursor-grab overflow-hidden rounded-lg border-2 bg-secondary active:cursor-grabbing ${
                s.patchId ? "border-accent bg-accent/20" : selected === s.id ? "border-primary" : "border-transparent hover:border-border"
              }`}
              title={`${fmt(segLen(s))} — drag to rearrange`}
            >
              <Waveform buffer={buffer} seg={s} />
              <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground">{s.patchId ? 'Patch' : i + 1}</span>
            </div>
          ))}
        </div>
        {/* Ruler + playhead */}
        <div className="relative mt-1 h-6 cursor-pointer rounded bg-muted/50" onClick={seek} aria-label="Seek">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} className="absolute top-1 -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${i * 10}%` }}>
              {i % 2 === 0 ? fmt((total * i) / 10) : "·"}
            </span>
          ))}
        </div>
        <div
          className="pointer-events-none absolute top-0 h-[7.5rem] w-0.5 bg-accent shadow-glow"
          style={{ left: `calc(${total ? (playhead / total) * 100 : 0}%)` }}
        />
      </div>

      {words.length > 0 && (
        <div className="mt-4 rounded-xl bg-muted p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Words in timeline order — click a word to jump, shift-click to select several, then cut them.</p>
            <Button size="sm" variant="outline" disabled={!picked} onClick={cutWords}><Scissors className="h-4 w-4" /> Cut words</Button>
          </div>
          <p className="leading-relaxed" aria-label="Timed words">
            {placed.map((p, k) => {
              const lo = picked ? Math.min(picked.from, picked.to) : -1;
              const hi = picked ? Math.max(picked.from, picked.to) : -1;
              const sel = k >= lo && k <= hi;
              return (
                <button
                  key={`${p.i}-${k}`}
                  onClick={(e) => pickWord(k, e.shiftKey)}
                  className={`mr-1 rounded px-0.5 ${sel ? "bg-primary text-primary-foreground" : words[p.i]?.patchId ? "bg-accent/30 text-accent" : k === currentWord ? "bg-accent/30 text-foreground" : "hover:bg-secondary"}`}
                >
                  {words[p.i]!.w}
                </button>
              );
            })}
          </p>
        </div>
      )}

      {patches.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{patches.map(p => <Button key={p.id} size="sm" variant="outline" disabled={!segs.some(s => s.patchId === p.id)} onClick={() => undoPatch(p)} title={`Undo patch: ${p.phrase}`}><Undo2 className="h-4 w-4" /><span className="max-w-48 truncate text-accent">{p.phrase}</span></Button>)}</div>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Space play · S split{words.length ? " (snaps to the nearest word gap)" : ""} · Del cut · Ctrl+Z undo · drag clips to rearrange · click the ruler to jump</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => exportAudio(false)}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
          </Button>
          {onSave && (
            <Button size="sm" disabled={exporting} onClick={() => exportAudio(true)}><Save className="h-4 w-4" /> Save to library</Button>
          )}
        </div>
      </div>
    </section>
  );
}
