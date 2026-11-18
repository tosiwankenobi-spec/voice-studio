import { pickVideoMime } from "./video-export";
import { mouthShapeAt, VISEME_SHAPES, type MouthShape, type VisemeFrame } from "./viseme";
import {
  faceMouthGeometry,
  photoLayout,
  photoMouthGeometry,
  type AvatarFace,
  type PhotoFaceSettings,
} from "./face";

export type AvatarPhoto = {
  image: HTMLImageElement;
  settings: PhotoFaceSettings;
};

type MouthGeometry = ReturnType<typeof faceMouthGeometry>;

function paintMouth(
  ctx: CanvasRenderingContext2D,
  face: AvatarFace,
  mouth: MouthShape,
  geometry: MouthGeometry,
) {
  const { width, height, lineWidth } = geometry;
  ctx.save();
  ctx.translate(geometry.x, geometry.y);
  if (mouth.closed > 0.55 && mouth.open < 0.08) {
    ctx.strokeStyle = face.eyeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-width, 0);
    ctx.quadraticCurveTo(0, 3 + mouth.round * 2, width, 0);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // Custom proportions scale the same viseme geometry used by preview and export.
  ctx.fillStyle = face.lipColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, width + 3, height + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = face.eyeColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  ctx.clip();
  if (mouth.teeth > 0.08 && height > 3) {
    ctx.globalAlpha = Math.min(1, mouth.teeth + 0.15);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(-width * 0.76, -height, width * 1.52, Math.max(2, height * 0.72), 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (mouth.tongue > 0.12 && height > 5) {
    ctx.fillStyle = face.lipColor;
    ctx.beginPath();
    ctx.ellipse(0, height * 0.7, width * 0.58, height * 0.5 * mouth.tongue, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = face.lipColor;
  ctx.lineWidth = Math.max(1.5, lineWidth * 0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, width + 1, height + 1, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, face: AvatarFace, mouth: MouthShape) {
  paintMouth(ctx, face, mouth, faceMouthGeometry(face, mouth));
}

function drawPhotoAvatar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  face: AvatarFace,
  mouth: MouthShape,
  photo: AvatarPhoto,
) {
  ctx.fillStyle = face.backgroundColor;
  ctx.fillRect(0, 0, W, H);
  const layout = photoLayout(
    W,
    H,
    photo.image.naturalWidth || photo.image.width,
    photo.image.naturalHeight || photo.image.height,
    photo.settings,
    face,
  );
  ctx.save();
  ctx.filter = `brightness(${photo.settings.brightness}%) saturate(${photo.settings.saturation}%)`;
  ctx.drawImage(photo.image, layout.x, layout.y, layout.width, layout.height);
  ctx.restore();
  if (photo.settings.warmth !== 0) {
    ctx.save();
    ctx.globalAlpha = Math.abs(photo.settings.warmth) / 250;
    ctx.fillStyle = photo.settings.warmth > 0 ? "#F59E0B" : "#22D3EE";
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
    ctx.restore();
  }
  paintMouth(ctx, face, mouth, photoMouthGeometry(layout, photo.settings, face, mouth));
}

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  face: AvatarFace,
  mouth: MouthShape,
  time: number,
  photo?: AvatarPhoto,
) {
  if (photo) {
    drawPhotoAvatar(ctx, W, H, face, mouth, photo);
    return;
  }
  ctx.fillStyle = face.backgroundColor;
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
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const round = (x: number, y: number, w: number, h: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };

  const sx = face.faceWidth / 100;
  const sy = face.faceHeight / 100;
  const w = 105 * sx;
  const h = 128 * sy;
  const centerY = -15;
  const lineWidth = 3.5 * (face.lineWeight / 100);

  ellipse(0, 182, 150, 92, face.bodyColor);
  round(-25 * sx, 95 * sy, 50 * sx, 70 * sy, 12, face.faceColor);
  ellipse(-w - 3, 8, 14 * (face.earSize / 100), 24 * (face.earSize / 100), face.faceColor);
  ellipse(w + 3, 8, 14 * (face.earSize / 100), 24 * (face.earSize / 100), face.faceColor);

  const upperRadius = 24 + (face.roundness / 100) * Math.min(w, h) * 0.85;
  const lowerRadius = 18 + (face.jaw / 100) * Math.min(w, h) * 0.9;
  ctx.fillStyle = face.faceColor;
  ctx.beginPath();
  ctx.roundRect(-w, centerY - h, w * 2, h * 2, [upperRadius, upperRadius, lowerRadius, lowerRadius]);
  ctx.fill();

  if (face.hairVolume > 0) {
    const volume = face.hairVolume / 100;
    const sweep = face.hairSweep * sx;
    ctx.fillStyle = face.hairColor;
    ctx.beginPath();
    ctx.moveTo(-w * 0.98, centerY - h * 0.42);
    ctx.bezierCurveTo(
      -w * 1.12,
      centerY - h * (1.05 + volume * 0.35),
      w * 1.08,
      centerY - h * (1.08 + volume * 0.32),
      w * 0.98,
      centerY - h * 0.4,
    );
    ctx.bezierCurveTo(
      w * 0.52 + sweep,
      centerY - h * (0.72 + volume * 0.12),
      w * 0.08 + sweep,
      centerY - h * 0.32,
      -w * 0.98,
      centerY - h * 0.42,
    );
    ctx.fill();
  }

  const blink = time % 4.8 > 4.65 ? 0.12 : 1;
  const eyeX = 39 * sx * (face.eyeSpacing / 100);
  const eyeY = -26 * sy;
  const eyeSize = 9 * (face.eyeSize / 100);
  const eyeHeight = eyeSize * (0.55 + (face.eyeOpen / 100) * 0.75) * blink;
  ellipse(-eyeX, eyeY, eyeSize, eyeHeight, face.eyeColor);
  ellipse(eyeX, eyeY, eyeSize, eyeHeight, face.eyeColor);

  const browY = eyeY - 25 * (face.eyeSize / 100);
  const browTilt = (face.browTilt / 40) * 6;
  ctx.strokeStyle = face.hairColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-eyeX - 14, browY + browTilt);
  ctx.lineTo(-eyeX + 14, browY - browTilt);
  ctx.moveTo(eyeX - 14, browY - browTilt);
  ctx.lineTo(eyeX + 14, browY + browTilt);
  ctx.stroke();

  if (face.blush > 0) {
    ctx.save();
    ctx.globalAlpha = (face.blush / 100) * 0.45;
    ellipse(-65 * sx, 35 * sy, 17, 9, face.lipColor);
    ellipse(65 * sx, 35 * sy, 17, 9, face.lipColor);
    ctx.restore();
  }

  const nose = face.noseSize / 70;
  ctx.strokeStyle = face.lipColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(2 * nose, -8 * sy);
  ctx.lineTo(-5 * nose, 20 * sy);
  ctx.lineTo(10 * nose, 20 * sy);
  ctx.stroke();
  drawMouth(ctx, face, mouth);
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
  face: AvatarFace,
  portrait: boolean,
  progress: (percent: number) => void,
  signal: AbortSignal,
  photo?: AvatarPhoto,
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
    drawAvatar(ctx, canvas.width, canvas.height, face, { ...VISEME_SHAPES.rest }, 0, photo);
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
        drawAvatar(ctx, canvas.width, canvas.height, face, mouthShapeAt(frames, t), t, photo);
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
