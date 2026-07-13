import type { Outcome } from "./types.ts";

/** Duck-type an exit code off a thrown error (zx's ProcessOutput, command's exit error). */
export function exitCodeOf(error: unknown): number | undefined {
  const code = (error as { exitCode?: unknown } | null | undefined)?.exitCode;
  return typeof code === "number" ? code : undefined;
}

/**
 * Build the failure {@link Outcome} for a thrown error: `{ ok: false, error }`,
 * carrying `exitCode` when the error is a process failure (see {@link exitCodeOf}).
 * Assignable to `Outcome<Result>` for any `Result` — the failure branch is
 * result-independent.
 */
export function failureOutcome(error: unknown): Outcome<never> {
  const exitCode = exitCodeOf(error);
  return exitCode === undefined ? { ok: false, error } : { ok: false, error, exitCode };
}
