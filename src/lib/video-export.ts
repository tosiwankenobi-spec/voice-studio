import {
  buildCues,
  cueAt,
  estimateWordTimes,
  wrapLines,
  type CaptionStyle,
  type Cue,
} from "./captions";
import { contrastText, type BrandKit } from "./brand";

export type RenderScene = {
  image?: string | undefined;
  video?: string | undefined;
  audio?: string | undefined;
  seconds: number;
  /** Narration text, used for captions. */
  text?: string | undefined;
};

export type VideoFormat = "16:9" | "9:16" | "1:1";
export const VIDEO_FORMATS: { value: VideoFormat; label: string; w: number; h: number }[] = [
  { value: "16:9", label: "YouTube · 16:9", w: 1920, h: 1080 },
  { value: "9:16", label: "Shorts / Reels / TikTok · 9:16", w: 1080, h: 1920 },
  { value: "1:1", label: "Square feed · 1:1", w: 1080, h: 1080 },
];

export type ExportOptions = {
  format?: VideoFormat;
  captions?: CaptionStyle;
  /** Brand kit to apply (logo, colours, intro/outro cards). */
  brand?: (BrandKit & { logoUrl: string | null }) | null;
  /** Small badge in the top-left corner, e.g. a price. */
  badge?: string | undefined;
  /** Adds an "AI-generated voice" label to the video. */
  aiDisclosure?: boolean;
  signal?: AbortSignal;
};

const INTRO_SECONDS = 2;
const OUTRO_SECONDS = 3;

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Couldn't load a scene image."));
    i.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  zoom: number,
  W: number,
  H: number,
) {
  const scale = Math.max(W / sw, H / sh) * zoom;
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

/**
 * Fits the picture to the frame. When its shape is close to the frame it fills it; otherwise the
 * picture is shown whole over a blurred, zoomed copy of itself (no black bars).
 */
export function drawFitted(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  zoom: number,
  W: number,
  H: number,
) {
  const mismatch = Math.abs(Math.log(sw / sh / (W / H)));
  if (mismatch < 0.18) return drawCover(ctx, src, sw, sh, zoom, W, H);
  ctx.save();
  ctx.filter = "blur(40px) brightness(0.6)";
  drawCover(ctx, src, sw, sh, 1.15, W, H);
  ctx.restore();
  const scale = Math.min(W / sw, H / sh) * 0.94 * zoom;
  const w = sw * scale,
    h = sh * scale;
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

/** MP4 (H.264 + AAC) plays on every phone and editor; fall back to WebM only where the browser can't record MP4. */
export function pickVideoMime() {
  const order = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  return order.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Largest font size (up to `size`) at which `text` fits in `maxW`; sets ctx.font to it. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  family: string,
  maxW: number,
) {
  let s = size;
  ctx.font = `${weight} ${s}px "${family}", sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    s = Math.max(12, Math.floor((s * maxW) / w));
    ctx.font = `${weight} ${s}px "${family}", sans-serif`;
  }
  return s;
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  cue: Cue,
  t: number,
  style: CaptionStyle,
  W: number,
  H: number,
  font: string,
  highlight: string,
) {
  const base = Math.min(W, H);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (style === "subtitle") {
    const size = Math.round(base * 0.045);
    ctx.font = `600 ${size}px "${font}", sans-serif`;
    const lines = wrapLines(cue.text, W > H ? 48 : 28);
    const lh = size * 1.3;
    const y0 = H * 0.86 - (lines.length - 1) * lh;
    lines.forEach((line, i) => {
      const w = ctx.measureText(line).width + size;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      roundRect(ctx, W / 2 - w / 2, y0 + i * lh - lh / 2, w, lh, size * 0.25);
      ctx.fillStyle = "#fff";
      ctx.fillText(line, W / 2, y0 + i * lh);
    });
  } else {
    const bold = style === "bold";
    const text = bold ? cue.text.toUpperCase() : cue.text;
    const size = fitFont(
      ctx,
      text + " ",
      800,
      Math.round(base * (bold ? 0.1 : 0.065)),
      font,
      W * 0.9,
    );
    const y = bold ? H * 0.5 : H * (W > H ? 0.82 : 0.72);
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    if (bold) {
      ctx.strokeText(text, W / 2, y);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, W / 2, y);
    } else {
      // Word-by-word: draw each word, highlighting the one being spoken.
      const words = cue.words.map((w) => w.w);
      const widths = words.map((w) => ctx.measureText(w + " ").width);
      let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
      ctx.textAlign = "left";
      words.forEach((w, i) => {
        const active = t >= cue.words[i]!.s && t < (cue.words[i + 1]?.s ?? cue.e);
        ctx.strokeText(w, x, y);
        ctx.fillStyle = active ? highlight : "#fff";
        ctx.fillText(w, x, y);
        x += widths[i]!;
      });
    }
  }
  ctx.restore();
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  bg: string,
  fg: string,
  lines: string[],
  font: string,
  logo: HTMLImageElement | null,
  fade: number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = fade;
  const base = Math.min(W, H);
  let y = H / 2 - (lines.length - 1) * base * 0.05;
  if (logo) {
    const lw = base * 0.28,
      lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.drawImage(logo, W / 2 - lw / 2, y - lh - base * 0.06, lw, lh);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = fg;
  lines.forEach((line, i) => {
    const target = Math.round(base * (i === 0 ? 0.075 : 0.05));
    wrapLines(line, W > H ? 36 : 20, 3).forEach((l) => {
      const size = fitFont(ctx, l, i === 0 ? 800 : 600, target, font, W * 0.88);
      ctx.fillText(l, W / 2, y);
      y += size * 1.25;
    });
    y += base * 0.02;
  });
  ctx.restore();
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  opts: ExportOptions,
  logo: HTMLImageElement | null,
  font: string,
) {
  const base = Math.min(W, H);
  const pad = base * 0.04;
  if (logo) {
    const lw = base * 0.14,
      lh = (logo.naturalHeight / logo.naturalWidth) * lw;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, W - pad - lw, pad, lw, lh);
    ctx.restore();
  }
  if (opts.badge) {
    const size = Math.round(base * 0.055);
    ctx.save();
    ctx.font = `800 ${size}px "${font}", sans-serif`;
    const w = ctx.measureText(opts.badge).width + size * 1.2;
    const bg = opts.brand?.primary ?? "#f5a524";
    ctx.fillStyle = bg;
    roundRect(ctx, pad, pad, w, size * 1.6, size * 0.8);
    ctx.fillStyle = contrastText(bg);
    ctx.textBaseline = "middle";
    ctx.fillText(opts.badge, pad + size * 0.6, pad + size * 0.8);
    ctx.restore();
  }
  if (opts.aiDisclosure) {
    const size = Math.round(base * 0.022);
    ctx.save();
    ctx.font = `600 ${size}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textBaseline = "bottom";
    ctx.fillText("AI-generated voice", pad, H - pad * 0.6);
    ctx.restore();
  }
}

/** Seconds the finished video will run, including intro/outro cards. */
export function exportLength(scenes: RenderScene[], opts: ExportOptions = {}) {
  const b = opts.brand;
  return (
    scenes.reduce((a, s) => a + s.seconds, 0) +
    (b?.introText ? INTRO_SECONDS : 0) +
    (b && (b.outroText || b.cta) ? OUTRO_SECONDS : 0)
  );
}

/** Caption cues for the whole video, on the video's own timeline (for .srt export). */
export function videoCues(scenes: RenderScene[], opts: ExportOptions = {}): Cue[] {
  const style = opts.captions && opts.captions !== "none" ? opts.captions : "subtitle";
  let t = opts.brand?.introText ? INTRO_SECONDS : 0;
  const out: Cue[] = [];
  for (const s of scenes) {
    out.push(...buildCues(estimateWordTimes(s.text ?? "", s.seconds, t), style));
    t += s.seconds;
  }
  return out;
}

/** Preload media before recording, then schedule every scene on the same audio clock. */
export async function exportVideo(
  scenes: RenderScene[],
  onProgress: (i: number) => void,
  opts: ExportOptions = {},
): Promise<Blob> {
  if (!scenes.length || scenes.some((s) => !Number.isFinite(s.seconds) || s.seconds <= 0))
    throw new Error("Every scene needs a valid duration before export.");
  opts.signal?.throwIfAborted();
  const fmt = VIDEO_FORMATS.find((f) => f.value === (opts.format ?? "16:9"))!;
  const W = opts.format ? fmt.w : 1280,
    H = opts.format ? fmt.h : 720;
  const brand = opts.brand ?? null;
  const font = brand?.font ?? "Plus Jakarta Sans";
  const highlight = brand?.primary ?? "#f5a524";
  const style = opts.captions ?? "none";
  const ac = new AudioContext();
  const videos: HTMLVideoElement[] = [];
  const sources: AudioBufferSourceNode[] = [];
  let stream: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let recording: Promise<void> | null = null;
  let recorderStarted = false;
  let recorderError: unknown = null;
  const prepareController = new AbortController();
  const stopPreparing = () => prepareController.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", stopPreparing, { once: true });
  const signal = prepareController.signal;
  // Even a stalled decoder/load must be cancellable before the recorder exists.
  const preparing = <T>(work: Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(
        () => prepareController.abort(new Error("Media loading timed out. Try exporting again.")),
        30000,
      );
      const cleanup = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      work.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
  try {
    await preparing(ac.resume());
    if (opts.signal?.aborted) stopPreparing();
    await preparing(
      document.fonts?.load('800 40px "' + font + '"').catch(() => undefined) ?? Promise.resolve(),
    );
    const logo = brand?.logoUrl
      ? await preparing(loadImg(brand.logoUrl)).catch((e) => {
          if (signal.aborted) throw e;
          return null;
        })
      : null;
    const prepared: {
      scene: RenderScene;
      video: HTMLVideoElement | null;
      image: HTMLImageElement | null;
      audio: AudioBuffer | null;
      cues: Cue[];
    }[] = [];
    // Sequential preload bounds decoder/network pressure on phones.
    for (const scene of scenes) {
      signal.throwIfAborted();
      let video: HTMLVideoElement | null = null;
      let image: HTMLImageElement | null = null;
      let audio: AudioBuffer | null = null;
      if (scene.video) {
        video = document.createElement("video");
        videos.push(video);
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "auto";
        const loaded = new Promise<void>((resolve, reject) => {
          video!.onloadeddata = () => resolve();
          video!.onerror = () => reject(new Error("Couldn't load a scene video."));
          video!.src = scene.video!;
          video!.load();
        });
        await preparing(loaded);
      } else if (scene.image) image = await preparing(loadImg(scene.image));
      if (scene.audio) {
        const response = await preparing(fetch(scene.audio, { signal }));
        if (!response.ok) throw new Error("Couldn't load a scene's audio.");
        const data = await preparing(response.arrayBuffer());
        audio = await preparing(ac.decodeAudioData(data));
      }
      prepared.push({
        scene,
        video,
        image,
        audio,
        cues: buildCues(estimateWordTimes(scene.text ?? "", scene.seconds), style),
      });
    }
    opts.signal?.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Video export isn't supported in this browser.");
    const dest = ac.createMediaStreamDestination();
    stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    const mime = pickVideoMime();
    rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: W * H > 1_000_000 ? 8_000_000 : 5_000_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recording = new Promise<void>((resolve) => {
      rec!.onstop = () => resolve();
    });
    rec.onerror = () => {
      recorderError = new Error("The browser couldn't finish recording the video.");
    };
    const intro = brand?.introText ? INTRO_SECONDS : 0;
    const sceneEnd = intro + scenes.reduce((sum, s) => sum + s.seconds, 0);
    const duration = exportLength(scenes, opts);
    let current = -1;
    let playbackError: unknown = null;
    const draw = (time: number) => {
      if (brand?.introText && time < intro) {
        drawCard(
          ctx,
          W,
          H,
          brand.secondary,
          contrastText(brand.secondary),
          [brand.introText],
          font,
          logo,
          Math.max(0, Math.min(1, time / 0.3, (intro - time) / 0.3)),
        );
        return;
      }
      let at = intro;
      for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i]!;
        if (time < at + p.scene.seconds) {
          if (current !== i) {
            if (current >= 0) prepared[current]?.video?.pause();
            current = i;
            onProgress(i);
            if (p.video) {
              p.video.currentTime = 0;
              p.video.play().catch((error) => {
                playbackError = error;
              });
            }
          }
          const local = time - at;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, W, H);
          if (p.video?.videoWidth)
            drawFitted(ctx, p.video, p.video.videoWidth, p.video.videoHeight, 1, W, H);
          else if (p.image)
            drawFitted(
              ctx,
              p.image,
              p.image.naturalWidth,
              p.image.naturalHeight,
              1 + 0.12 * Math.min(1, local / p.scene.seconds),
              W,
              H,
            );
          const cue = cueAt(p.cues, local);
          if (cue) drawCaption(ctx, cue, local, style, W, H, font, highlight);
          drawOverlays(ctx, W, H, opts, logo, font);
          const fade = Math.max(0, Math.min(1, local / 0.4, (p.scene.seconds - local) / 0.4));
          if (fade < 1) {
            ctx.fillStyle = "rgba(0,0,0," + (1 - fade) + ")";
            ctx.fillRect(0, 0, W, H);
          }
          return;
        }
        at += p.scene.seconds;
      }
      if (current >= 0) prepared[current]?.video?.pause();
      if (brand && (brand.outroText || brand.cta)) {
        const lines = [brand.outroText, brand.cta].filter(Boolean);
        if (opts.aiDisclosure) lines.push("Voice generated with AI");
        drawCard(
          ctx,
          W,
          H,
          brand.secondary,
          contrastText(brand.secondary),
          lines,
          font,
          logo,
          Math.max(0, Math.min(1, (time - sceneEnd) / 0.3, (duration - time) / 0.3)),
        );
      }
    };
    draw(0);
    const startedAt = ac.currentTime;
    rec.start(1000);
    recorderStarted = true;
    let offset = intro;
    for (const p of prepared) {
      if (p.audio) {
        const source = ac.createBufferSource();
        sources.push(source);
        source.buffer = p.audio;
        source.connect(dest);
        source.start(startedAt + offset, 0, Math.min(p.scene.seconds, p.audio.duration));
      }
      offset += p.scene.seconds;
    }
    await new Promise<void>((resolve, reject) => {
      let frame = 0;
      const finish = (error?: unknown) => {
        cancelAnimationFrame(frame);
        opts.signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(new DOMException("Export cancelled.", "AbortError"));
      const tick = () => {
        try {
          if (opts.signal?.aborted) return abort();
          if (recorderError) return finish(recorderError);
          if (playbackError) return finish(playbackError);
          const time = ac.currentTime - startedAt;
          draw(Math.min(time, duration));
          if (time >= duration) finish();
          else frame = requestAnimationFrame(tick);
        } catch (error) {
          finish(error);
        }
      };
      opts.signal?.addEventListener("abort", abort, { once: true });
      tick();
    });
    rec.stop();
    await recording;
    if (recorderError) throw recorderError;
    return new Blob(chunks, { type: mime.split(";")[0] ?? "video/webm" });
  } finally {
    opts.signal?.removeEventListener("abort", stopPreparing);
    sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
      source.disconnect();
    });
    videos.forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    if (rec && rec.state !== "inactive") rec.stop();
    if (recording && recorderStarted) await recording;
    stream?.getTracks().forEach((track) => track.stop());
    await ac.close();
  }
}

export function audioSeconds(src: string) {
  return new Promise<number>((res) => {
    const a = new Audio(src);
    a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 5);
    a.onerror = () => res(5);
  });
}
