import type { Logger } from "../output/log/LogsCollector.ts";

/**
 * An inline check injected into every action's `ctx` and the `spin` body. Passes
 * when `value` is `true`. Every call is logged; a failure is recorded into the
 * run's verdict — as data, not a throw — so the run keeps going and later
 * assertions still fire. Returns the pass boolean so a body can branch on it.
 *
 *   assert(page.isVisible(), "page loaded")
 */
export type Assert = (value: boolean, what: string) => boolean;

/** Marks a failed assertion in the spin's verdict, distinct from an action's own error. */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

/**
 * Build an {@link Assert} bound to one action (or the spin body): `name` is its
 * launch path (used for attribution in the log line and the error), `logs` is the
 * logger to append to, and `onResult` is invoked once per call with the pass
 * boolean (and, on failure, an {@link AssertionError} to record into the verdict) —
 * so the host can tally passes/failures and record faults in one place. The factory
 * is file-agnostic — it only appends `level: "assert"` entries; the dedicated
 * `assertions.log` is a downstream projection of that stream.
 */
export function createAssert(
  name: string,
  logs: Logger,
  onResult: (pass: boolean, error?: AssertionError) => void
): Assert {
  return (value, what): boolean => {
    const pass = value;
    const glyph = pass ? "✓" : "✗";
    const message = `${name} · ${glyph} ${what}`;
    logs.append({ source: "assert", level: "assert", message });
    onResult(pass, pass ? undefined : new AssertionError(`${name}: ${what}`));
    return pass;
  };
}
