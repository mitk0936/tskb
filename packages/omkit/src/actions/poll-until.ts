import { setTimeout as sleep } from "node:timers/promises";
import { action } from "../core/action.ts";

/** What a {@link pollUntil} predicate returns: `false`, `null` or `undefined` mean "not yet". */
export type PollValue<T> = T | false | null | undefined;

export interface PollUntilOptions {
  /** Delay between checks. Default 200ms. */
  intervalMs?: number;
  /** Reject after this long overall. Default 30000ms; pass `Infinity` to wait until teardown. */
  timeoutMs?: number;
}

/**
 * Gate: calls `predicate` every `intervalMs` until it returns something other than `false`,
 * `null` or `undefined`, and resolves with that value — so it can find a thing as well as wait
 * for one. The node is named after `description` (like `command`), which also heads the
 * timeout error. The predicate gets this node's abort signal to cancel its own work (a
 * `fetch`, say); a predicate that throws fails the gate rather than being retried.
 */
export function pollUntil<T>(
  description: string,
  predicate: (signal: AbortSignal) => PollValue<T> | Promise<PollValue<T>>,
  options: PollUntilOptions = {}
) {
  const { intervalMs = 200, timeoutMs = 30_000 } = options;
  return action(description).run(async ({ signal }): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    let attempts = 0;
    for (;;) {
      signal.throwIfAborted();
      attempts++;
      const value = await predicate(signal);
      if (value !== false && value !== null && value !== undefined) {
        console.log(`met after ${attempts} ${attempts === 1 ? "check" : "checks"}`);
        return value;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`${description}: not met within ${timeoutMs}ms (${attempts} checks)`);
      }
      await sleep(Math.min(intervalMs, remaining), undefined, { signal });
    }
  })();
}
