import { pickVideoMime } from "./video-export";
import { mouthShapeAt, VISEME_SHAPES, type MouthShape, type VisemeFrame } from "./viseme";
export type AvatarStyle = "robot" | "presenter";
export type AvatarPalette = {
  background: string;
  face: string;
  accent: string;
  ink: string;
  light: string;
  body: string;
};
export function avatarPalette(element: HTMLElement): AvatarPalette {
  const css = getComputedStyle(element);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: token("--background"),
    face: token("--primary"),
    accent: token("--accent"),
    ink: token("--primary-foreground"),
    light: token("--foreground"),
    body: token("--chart-3"),
  };
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  style: AvatarStyle,
  mouth: MouthShape,
  p: AvatarPalette,
) {
  const width = (style === "robot" ? 31 : 36) * mouth.width;
  const height = 1.5 + mouth.open * (style === "robot" ? 29 : 34);
  ctx.save();
  ctx.translate(0, 64);
  if (mouth.closed > 0.55 && mouth.open < 0.08) {
    ctx.strokeStyle = style === "robot" ? p.light : p.ink;
    ctx.lineWidth = style === "robot" ? 5 : 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-width, 0);
    ctx.quadraticCurveTo(0, 3 + mouth.round * 2, width, 0);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // The outer lips change width and rounding; the inner mouth reveals teeth and tongue by viseme.
  ctx.fillStyle = style === "robot" ? p.ink : p.accent;
  ctx.beginPath();
  ctx.ellipse(0, 0, width + 3, height + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  ctx.clip();
  if (mouth.teeth > 0.08 && height > 3) {
    ctx.globalAlpha = Math.min(1, mouth.teeth + 0.15);
    ctx.fillStyle = p.light;
    ctx.beginPath();
    ctx.roundRect(-width * 0.76, -height, width * 1.52, Math.max(2, height * 0.72), 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (mouth.tongue > 0.12 && height > 5) {
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.ellipse(0, height * 0.7, width * 0.58, height * 0.5 * mouth.tongue, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (style === "presenter") {
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, width + 1, height + 1, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  style: AvatarStyle,
  mouth: MouthShape,
  time: number,
  p: AvatarPalette,
) {
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  const size = Math.min(W / 600, H / 450);
  ctx.translate(W / 2, H * 0.48);
  ctx.scale(size, size);
  const bob = Math.sin(time * 1.8) * 2.5;
  ctx.translate(0, bob);
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const round = (x: number, y: number, w: number, h: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  ellipse(0, 182, 150, 92, p.body);
  round(-25, 95, 50, 70, 12, p.face);
  if (style === "robot") {
    round(-112, -99, 224, 204, 42, p.face);
    round(-135, -30, 23, 70, 10, p.accent);
    round(112, -30, 23, 70, 10, p.accent);
    round(-6, -145, 12, 46, 5, p.body);
    ellipse(0, -150, 14, 14, p.accent);
    round(-89, -60, 178, 85, 22, p.ink);
    const blink = time % 4.8 > 4.65 ? 3 : 16;
    ellipse(-42, -20, 16, blink, p.light);
    ellipse(42, -20, 16, blink, p.light);
    for (let i = 0; i < 3; i++) round(-69 + i * 10, 48, 5, 13, 2, p.accent);
  } else {
    ellipse(0, -15, 105, 128, p.face);
    ellipse(-108, 8, 14, 24, p.face);
    ellipse(108, 8, 14, 24, p.face);
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.moveTo(-100, -55);
    ctx.bezierCurveTo(-122, -170, 95, -181, 103, -50);
    ctx.bezierCurveTo(45, -125, 16, -48, -100, -55);
    ctx.fill();
    const blink = time % 4.8 > 4.65 ? 2 : 11;
    ellipse(-39, -26, 9, blink, p.ink);
    ellipse(39, -26, 9, blink, p.ink);
    round(-54, -52, 28, 5, 2, p.ink);
    round(26, -52, 28, 5, 2, p.ink);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ellipse(-65, 35, 17, 9, p.accent);
    ellipse(65, 35, 17, 9, p.accent);
    ctx.restore();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(-5, 20);
    ctx.lineTo(10, 20);
    ctx.stroke();
  }
  drawMouth(ctx, style, mouth, p);
  ctx.restore();
}
export function splitNarration(text: string, limit = 4500) {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let at = rest.lastIndexOf(" ", limit);
    if (at < limit / 2) at = limit;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
export async function decodeNarration(urls: string[]) {
  const ctx = new AudioContext();
  try {
    const buffers: AudioBuffer[] = [];
    for (const url of urls)
      buffers.push(await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()));
    const length = buffers.reduce((n, b) => n + b.length, 0);
    if (!length) throw new Error("No narration to animate.");
    const combined = ctx.createBuffer(
      Math.max(...buffers.map((b) => b.numberOfChannels)),
      length,
      ctx.sampleRate,
    );
    let at = 0;
    for (const buffer of buffers) {
      for (let ch = 0; ch < combined.numberOfChannels; ch++)
        combined
          .getChannelData(ch)
          .set(buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1)), at);
      at += buffer.length;
    }
    return combined;
  } finally {
    await ctx.close();
  }
}
export async function exportAvatar(
  buffer: AudioBuffer,
  frames: VisemeFrame[],
  style: AvatarStyle,
  portrait: boolean,
  palette: AvatarPalette,
  progress: (percent: number) => void,
  signal: AbortSignal,
) {
  const canvas = document.createElement("canvas");
  canvas.width = portrait ? 720 : 1280;
  canvas.height = portrait ? 1280 : 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Video export is not supported in this browser.");
  const ac = new AudioContext(),
    destination = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(destination);
  const video = canvas.captureStream(30),
    stream = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  let recorder: MediaRecorder | undefined;
  try {
    await ac.resume();
    const mime = pickVideoMime();
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve, reject) => {
      if (recorder) {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Video export failed."));
      }
    });
    drawAvatar(ctx, canvas.width, canvas.height, style, { ...VISEME_SHAPES.rest }, 0, palette);
    recorder.start(500);
    const start = ac.currentTime + 0.05;
    src.start(start);
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal.aborted) {
          reject(new Error("Export cancelled."));
          return;
        }
        const t = Math.max(0, ac.currentTime - start);
        drawAvatar(ctx, canvas.width, canvas.height, style, mouthShapeAt(frames, t), t, palette);
        progress(Math.min(100, (t / buffer.duration) * 100));
        if (t >= buffer.duration + 0.05) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    recorder.stop();
    await done;
    return new Blob(chunks, { type: mime.split(";")[0] ?? "video/webm" });
  } finally {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    try {
      src.stop();
    } catch {
      /* completed */
    }
    stream.getTracks().forEach((t) => t.stop());
    video.getTracks().forEach((t) => t.stop());
    await ac.close();
  }
}
