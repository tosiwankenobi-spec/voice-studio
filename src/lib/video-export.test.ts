// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { DEFAULT_BRAND } from "./brand";
import { exportVideo, videoCues, exportLength } from "./video-export";

const state = {
  clock: 0,
  events: [] as string[],
  starts: [] as number[],
  closed: false,
  stopped: 0,
  loadFails: false,
  loadAbort: null as AbortController | null,
  recordAbort: null as AbortController | null,
};
beforeEach(() => {
  Object.assign(state, {
    clock: 0,
    events: [],
    starts: [],
    closed: false,
    stopped: 0,
    loadFails: false,
    loadAbort: null,
    recordAbort: null,
  });
  const ctx = new Proxy(
    { measureText: (text: string) => ({ width: text.length * 10 }) },
    { get: (o, k) => Reflect.get(o, k) ?? (() => {}), set: (o, k, v) => Reflect.set(o, k, v) },
  );
  vi.stubGlobal("document", {
    fonts: { load: async () => [] },
    createElement: () => ({
      getContext: () => ctx,
      captureStream: () => ({ getVideoTracks: () => [{ stop: () => state.stopped++ }] }),
    }),
  });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 100;
      naturalHeight = 100;
      onload = () => {};
      onerror = () => {};
      set src(value: string) {
        state.events.push("load:" + value);
        queueMicrotask(() => {
          if (state.loadAbort) state.loadAbort.abort();
          else if (state.loadFails) this.onerror();
          else this.onload();
        });
      }
    },
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      get currentTime() {
        return state.clock;
      }
      async resume() {}
      async close() {
        state.closed = true;
      }
      createMediaStreamDestination() {
        return { stream: { getAudioTracks: () => [{ stop: () => state.stopped++ }] } };
      }
      async decodeAudioData() {
        state.events.push("decode");
        return { duration: 2 };
      }
      createBufferSource() {
        return {
          buffer: null,
          connect: () => {},
          disconnect: () => {},
          stop: () => {},
          start: (at: number) => state.starts.push(at),
        };
      }
    },
  );
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(private tracks: { stop: () => void }[]) {}
      getTracks() {
        return this.tracks;
      }
    },
  );
  vi.stubGlobal(
    "MediaRecorder",
    class {
      static isTypeSupported() {
        return true;
      }
      state = "inactive";
      onstop = () => {};
      ondataavailable = (event: { data: Blob }) => {
        void event;
      };
      start() {
        this.state = "recording";
        state.events.push("record");
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable({ data: new Blob(["video"]) });
        queueMicrotask(() => this.onstop());
      }
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    queueMicrotask(() => {
      if (state.recordAbort) state.recordAbort.abort();
      state.clock += 0.25;
      callback();
    });
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

it("preloads all images and audio, then schedules narration without per-scene loading gaps", async () => {
  const scenes = [
    { image: "one.png", audio: "data:audio/wav;base64,AA==", seconds: 2, text: "First scene" },
    { image: "two.png", audio: "data:audio/wav;base64,AA==", seconds: 2, text: "Second scene" },
  ];
  const options = {
    brand: { ...DEFAULT_BRAND, introText: "Hello", outroText: "Goodbye", logoUrl: null },
  };
  const blob = await exportVideo(scenes, () => {}, options);
  expect(state.events).toEqual(["load:one.png", "decode", "load:two.png", "decode", "record"]);
  expect(state.starts).toEqual([2, 4]);
  expect(state.clock).toBe(exportLength(scenes, options));
  expect(videoCues(scenes, options)[0]!.s - videoCues(scenes)[0]!.s).toBe(2);
  expect(blob.size).toBeGreaterThan(0);
  expect(state.closed).toBe(true);
  expect(state.stopped).toBe(2);
});
it("cancels during image preparation without starting a recorder", async () => {
  const controller = new AbortController();
  state.loadAbort = controller;
  await expect(
    exportVideo([{ image: "one.png", seconds: 2 }], () => {}, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(state.events).not.toContain("record");
  expect(state.closed).toBe(true);
});
it("stops recording and releases audio and capture tracks on cancellation", async () => {
  const controller = new AbortController();
  state.recordAbort = controller;
  await expect(
    exportVideo([{ image: "one.png", seconds: 2 }], () => {}, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(state.events).toContain("record");
  expect(state.closed).toBe(true);
  expect(state.stopped).toBe(2);
});
it("releases the audio context if a scene image fails to load", async () => {
  state.loadFails = true;
  await expect(exportVideo([{ image: "broken.png", seconds: 2 }], () => {})).rejects.toThrow(
    "Couldn't load a scene image",
  );
  expect(state.events).not.toContain("record");
  expect(state.closed).toBe(true);
});
it("rejects invalid durations before creating browser resources", async () => {
  await expect(exportVideo([{ seconds: NaN }], () => {})).rejects.toThrow("valid duration");
  expect(state.events).toEqual([]);
});
