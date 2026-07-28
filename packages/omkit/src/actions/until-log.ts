import { action } from "../core/action.ts";
import type { LogEntry } from "../foundation/LogEntry.ts";

/** Predicate over a log entry — return `true` for the entry to wait for. */
export type LogMatcher = (entry: LogEntry) => boolean;

export interface UntilLogOptions {
  /** Reject if no entry matches within this many ms. Omit to wait indefinitely. */
  timeoutMs?: number;
  /** Replay buffered history before live entries (catch already-logged matches). */
  replay?: boolean;
}

/** Events emitted by {@link untilLog}. */
export interface UntilLogEvents {
  /** Fired with the matching entry the moment it's found, just before resolving. */
  match: LogEntry;
}

/**
 * Gate: resolves with the first log entry the `matcher` accepts (and emits
 * `match`). Subscribes to the readable run log and races each read against the
 * run's abort signal (and an optional timeout), so teardown unblocks a pending
 * wait instead of hanging.
 */
export const untilLog = action("untilLog")
  .emits<UntilLogEvents>()
  .run(
    (
      { logs, signal, emit },
      matcher: LogMatcher,
      { timeoutMs, replay = false }: UntilLogOptions = {}
    ) => {
      const iterator = logs.subscribe({ replay })[Symbol.asyncIterator]();

      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline =
        timeoutMs === undefined
          ? undefined
          : new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`untilLog: no match within ${timeoutMs}ms`)),
                timeoutMs
              );
            });

      let onAbort: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        if (signal.aborted) return reject(new Error("untilLog: aborted"));
        onAbort = (): void => reject(new Error("untilLog: aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
      });

      const scan = async (): Promise<LogEntry> => {
        try {
          for (;;) {
            const racers: Promise<IteratorResult<LogEntry>>[] = [iterator.next(), aborted];
            if (deadline) racers.push(deadline);

            const result = await Promise.race(racers);
            if (result.done) throw new Error("untilLog: stream ended before a match");
            if (matcher(result.value)) {
              emit("match", result.value);
              return result.value;
            }
          }
        } finally {
          if (timer) clearTimeout(timer);
          if (onAbort) signal.removeEventListener("abort", onAbort);
          await iterator.return?.();
        }
      };

      return scan();
    }
  );
