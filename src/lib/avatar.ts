import { pickVideoMime } from "./video-export";
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
export function mouthLevel(samples: Float32Array, sr: number, time: number) {
  const start = Math.max(0, Math.floor(time * sr)),
    end = Math.min(samples.length, start + Math.round(sr * 0.03));
  let energy = 0;
  for (let i = start; i < end; i++) energy += (samples[i] ?? 0) ** 2;
  return Math.min(1, Math.max(0, (Math.sqrt(energy / Math.max(1, end - start)) - 0.006) * 9));
}
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  style: AvatarStyle,
  mouth: number,
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
  // Shoulders, collar and head remain fully visible in both landscape and portrait.
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
    ellipse(-65, 35, 17, 9, p.accent);
    ellipse(65, 35, 17, 9, p.accent);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(-5, 20);
    ctx.lineTo(10, 20);
    ctx.stroke();
  }
  ellipse(0, 61, 29 - mouth * 10, 3 + mouth * 24, p.ink);
  if (mouth > 0.25) ellipse(0, 67 + mouth * 7, 12, mouth * 6, p.accent);
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
    drawAvatar(ctx, canvas.width, canvas.height, style, 0, 0, palette);
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
        drawAvatar(
          ctx,
          canvas.width,
          canvas.height,
          style,
          mouthLevel(buffer.getChannelData(0), buffer.sampleRate, t),
          t,
          palette,
        );
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
