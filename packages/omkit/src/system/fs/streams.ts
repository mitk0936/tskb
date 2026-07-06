import type { createWriteStream } from "node:fs";

/**
 * Flush and close a write stream, resolving once its file descriptor is released.
 *
 * Resolves on `close` *or* `error` — a stream error still frees the file, and a
 * caller waiting to re-read or truncate that file must not hang because the write
 * end failed. The one shared fs primitive behind both `run.jsonl` and `run.log`
 * writers, where "the bytes are on disk and the fd is closed" is the exact barrier
 * the finalize step waits on.
 */
export const closeStream = (stream: ReturnType<typeof createWriteStream>): Promise<void> =>
  new Promise((resolve) => {
    stream.on("close", () => resolve());
    stream.on("error", () => resolve()); // a stream error still frees the file; don't hang
    stream.end();
  });
