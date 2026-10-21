export const VIDEO_JOB_TIMEOUT_MS = 15 * 60 * 1000;

export class VideoJobFailedError extends Error {
  override name = "VideoJobFailedError";
}

/** Poll an existing job without starting a second paid generation. */
export async function waitForVideo<T>(options: {
  poll: (signal: AbortSignal) => Promise<{
    status: "working" | "done" | "failed";
    result?: T;
    error?: string | null;
    progress: number;
  }>;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  onProgress?: ((progress: number) => void) | undefined;
}) {
  const controller = new AbortController();
  const abort = () =>
    controller.abort(new DOMException("Animation paused. You can resume this job.", "AbortError"));
  const timer = setTimeout(
    () =>
      controller.abort(new Error("Video generation timed out. Resume this job to check it again.")),
    options.timeoutMs ?? VIDEO_JOB_TIMEOUT_MS,
  );
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const checkAbort = () => {
    if (controller.signal.aborted) throw controller.signal.reason;
  };
  const delay = () =>
    new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(wait);
        reject(controller.signal.reason);
      };
      const wait = setTimeout(() => {
        controller.signal.removeEventListener("abort", cancel);
        resolve();
      }, 7000);
      controller.signal.addEventListener("abort", cancel, { once: true });
      if (controller.signal.aborted) cancel();
    });
  try {
    for (;;) {
      checkAbort();
      // Race the request as well as the delay: a stalled response must not defeat cancellation.
      const result = await new Promise<Awaited<ReturnType<typeof options.poll>>>(
        (resolve, reject) => {
          const cancel = () => reject(controller.signal.reason);
          controller.signal.addEventListener("abort", cancel, { once: true });
          Promise.resolve()
            .then(() => {
              checkAbort();
              return options.poll(controller.signal);
            })
            .then(resolve, reject)
            .finally(() => controller.signal.removeEventListener("abort", cancel));
        },
      );
      checkAbort();
      if (result.status === "failed")
        throw new VideoJobFailedError(result.error || "Video generation failed.");
      if (result.status === "done" && result.result !== undefined) return result.result;
      options.onProgress?.(result.progress);
      await delay();
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
