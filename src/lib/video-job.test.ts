// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { waitForVideo } from "./video-job";
afterEach(() => vi.useRealTimers());
it("returns an existing completed job without waiting or generating another", async () => {
  const poll = vi.fn(async () => ({ status: "done" as const, result: "video-url", progress: 100 }));
  expect(await waitForVideo({ poll })).toBe("video-url");
  expect(poll).toHaveBeenCalledTimes(1);
});
it("reports progress and polls the same job until it finishes", async () => {
  vi.useFakeTimers();
  const progress = vi.fn();
  const poll = vi
    .fn()
    .mockResolvedValueOnce({ status: "working", progress: 30 })
    .mockResolvedValueOnce({ status: "done", result: "video-url", progress: 100 });
  const result = waitForVideo({ poll, onProgress: progress });
  await vi.advanceTimersByTimeAsync(7000);
  expect(await result).toBe("video-url");
  expect(progress).toHaveBeenCalledWith(30);
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels promptly while waiting between polls", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const poll = vi.fn(async () => ({ status: "working" as const, progress: 0 }));
  const result = waitForVideo({ poll, signal: controller.signal });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await rejected;
  expect(poll).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("times out even if a polling request never resolves", async () => {
  vi.useFakeTimers();
  const poll = vi.fn(() => new Promise<never>(() => {}));
  const result = waitForVideo({ poll, timeoutMs: 100 });
  const rejected = expect(result).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});
it("does not poll when already cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  const poll = vi.fn();
  await expect(waitForVideo({ poll, signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(poll).not.toHaveBeenCalled();
});
it("surfaces provider failure", async () => {
  await expect(
    waitForVideo({
      poll: async () => ({ status: "failed", error: "Provider failed", progress: 0 }),
    }),
  ).rejects.toThrow("Provider failed");
});
