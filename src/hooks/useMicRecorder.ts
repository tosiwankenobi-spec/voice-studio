import { useRef, useState } from "react";
import { toast } from "sonner";

/** Records from the microphone and hands back a File when stopped. */
export function useMicRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const ref = useRef<{ rec: MediaRecorder; timer: number } | null>(null);

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("Microphone access was blocked. Allow it in your browser and try again.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = (rec.mimeType || "audio/webm").split(";")[0] ?? "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      if (blob.size < 1000) {
        toast.error("That recording was empty.");
        return;
      }
      onDone(new File([blob], `Microphone recording.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime }));
    };
    rec.start(500);
    setSecs(0);
    ref.current = { rec, timer: window.setInterval(() => setSecs((s) => s + 1), 1000) };
    setRecording(true);
  }

  function stop() {
    const r = ref.current;
    if (!r) return;
    clearInterval(r.timer);
    r.rec.stop();
    ref.current = null;
    setRecording(false);
  }

  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return { recording, clock, start, stop };
}
