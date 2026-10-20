export type RenderScene = { image?: string | undefined; video?: string | undefined; audio?: string | undefined; seconds: number };

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Couldn't load a scene image."));
    i.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, zoom: number, W: number, H: number) {
  const scale = Math.max(W / sw, H / sh) * zoom;
  const w = sw * scale;
  const h = sh * scale;
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

/** Records all scenes, in order, to a single WebM file in real time. No length limit. */
export async function exportVideo(scenes: RenderScene[], onProgress: (i: number) => void): Promise<Blob> {
  const W = 1280, H = 720;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = pickVideoMime();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(1000);

  for (let i = 0; i < scenes.length; i++) {
    onProgress(i);
    const s = scenes[i]!;
    let audioEl: HTMLAudioElement | null = null;
    if (s.audio) {
      audioEl = new Audio(s.audio);
      audioEl.crossOrigin = "anonymous";
      ac.createMediaElementSource(audioEl).connect(dest);
    }
    let videoEl: HTMLVideoElement | null = null;
    let img: HTMLImageElement | null = null;
    if (s.video) {
      videoEl = document.createElement("video");
      videoEl.crossOrigin = "anonymous";
      videoEl.src = s.video;
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      await videoEl.play();
    } else if (s.image) img = await loadImg(s.image);
    await audioEl?.play();
    const start = performance.now();
    const len = s.seconds * 1000;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = performance.now() - start;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        if (videoEl && videoEl.videoWidth) drawCover(ctx, videoEl, videoEl.videoWidth, videoEl.videoHeight, 1, W, H);
        else if (img) drawCover(ctx, img, img.naturalWidth, img.naturalHeight, 1 + 0.12 * Math.min(1, t / len), W, H);
        const fade = Math.min(1, t / 400, (len - t) / 400);
        if (fade < 1) {
          ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, fade)})`;
          ctx.fillRect(0, 0, W, H);
        }
        if (t >= len) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
    audioEl?.pause();
    videoEl?.pause();
  }
  rec.stop();
  await done;
  await ac.close();
  return new Blob(chunks, { type: mime.split(";")[0] ?? "video/webm" });
}

export function audioSeconds(src: string) {
  return new Promise<number>((res) => {
    const a = new Audio(src);
    a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 5);
    a.onerror = () => res(5);
  });
}
