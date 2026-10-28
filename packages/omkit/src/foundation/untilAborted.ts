/**
 * Resolves once `signal` aborts (immediately if it already has). Never rejects. Unlike a raw
 * `"abort"` listener, code after `await untilAborted(signal)` resumes in the *awaiting* async
 * context, so its `console.*` output stays attributed to the node that waited — a listener
 * runs in the canceller's context instead.
 */
export function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
