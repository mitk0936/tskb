/**
 * The error a cancelled node reports — its `.ref` rejects with it and its `.result`
 * resolves `{ ok: false, error: CancelledError }` — so an awaiter can tell cancellation
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
