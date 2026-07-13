/**
 * The rejection an awaited `.done`/`.ref` receives when its node is cancelled
 * (run teardown or a per-node `.cancel()`), so an awaiter can tell cancellation
 * from a genuine failure. A cancelled node is never a verdict failure.
 */
export class CancelledError extends Error {
  constructor(message = "cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

/** True if `error` is a {@link CancelledError}. */
export const isCancelled = (error: unknown): error is CancelledError =>
  error instanceof CancelledError;
