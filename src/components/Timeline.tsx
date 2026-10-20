import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Scissors, Trash2, Undo2, Download, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeWav, locate, move, renderSegments, segLen, splitAt, totalLength, type Segment } from "@/lib/audio";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const uid = () => crypto.randomUUID();

function Waveform({ buffer, seg }: { buffer: AudioBuffer; seg: Segment }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = (c.width = c.clientWidth * devicePixelRatio);
    const h = (c.height = c.clientHeight * devicePixelRatio);
    const g = c.getContext("2d")!;
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

export function Timeline({ file, onSave }: { file: File; onSave?: (blob: Blob) => void }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [segs, setSegs] = useState<Segment[]>([]);
  const [history, setHistory] = useState<Segment[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const clock = useRef({ ctxStart: 0, from: 0 });
  const raf = useRef(0);

  const total = useMemo(() => totalLength(segs), [segs]);

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

  const commit = (next: Segment[]) => {
    if (next === segs) return;
    stop();
    setHistory((h) => [...h.slice(-50), segs]);
    setSegs(next);
    setPlayhead((p) => Math.min(p, totalLength(next)));
  };

  const split = () => commit(splitAt(segs, playhead, uid));
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
    setSegs(prev);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); if (playing) stop(); else play(playhead); }
      else if (e.key === "s" || e.key === "S") split();
      else if (e.key === "Delete" || e.key === "Backspace") del();
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
          <span className="w-28 text-center font-mono text-sm tabular-nums text-muted-foreground">
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
              style={{ flexGrow: segLen(s), flexBasis: 0 }}
              className={`relative min-w-[6px] cursor-grab overflow-hidden rounded-lg border-2 bg-secondary active:cursor-grabbing ${
                selected === s.id ? "border-primary" : "border-transparent hover:border-border"
              }`}
              title={`${fmt(segLen(s))} — drag to rearrange`}
            >
              <Waveform buffer={buffer} seg={s} />
              <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground">{i + 1}</span>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Space play · S split · Del cut · Ctrl+Z undo · drag clips to rearrange · click the ruler to jump</p>
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
