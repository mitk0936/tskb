import type { LogEntry } from "../../foundation/LogEntry.ts";
import type { PromptSpec } from "../../core/interaction.ts";
import type { Registry } from "./registry.ts";

/** A run's terminal verdict, resolved when the child settles. */
export interface Verdict {
  readonly ok: boolean;
  /** The absolute run-folder path the child reported. */
  readonly folder: string;
  /** The end-of-run recap lines (run folder + sibling log paths + assert tally), the same
   *  block a bare run prints to its terminal. Empty if the child closed without settling. */
  readonly summary: readonly string[];
}

/** A typecheck diagnostic from `check()`. */
export interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

/** Options for launching a run. */
export interface RunOptions {
  /** Working directory for the child process (defaults to the om file's directory). */
  readonly cwd?: string;
}

/** A prompt the running om is waiting on — surfaced to the frontend, answered via `answer`. */
export interface PromptRequest {
  readonly id: string;
  readonly spec: PromptSpec;
}

/** Handler map for {@link RunSession.on}. */
export interface RunEvents {
  log: (entry: LogEntry) => void;
  prompt: (request: PromptRequest) => void;
  settled: (verdict: Verdict) => void;
}

/** A live handle to one supervised run. */
export interface RunSession {
  on<K extends keyof RunEvents>(event: K, handler: RunEvents[K]): void;
  /** Answer a pending prompt (`via` defaults to "input"). */
  answer(id: string, value: string, via?: string): void;
  /** Request graceful teardown of the run. */
  cancel(): void;
  /** Resolves when the run settles (or the child exits without settling → ok:false). */
  readonly result: Promise<Verdict>;
}

/** The headless engine behind every omkit frontend. */
export interface OmkitClient {
  /** Statically scan the project's `tsconfig.omkit.json` for oms and actions. */
  discover(): Promise<Registry>;
  /** Spawn an om file as a supervised child and return its live session. */
  run(omFile: string, opts?: RunOptions): RunSession;
  /** Typecheck the project (`tsc --noEmit`) and return diagnostics. */
  check(): Promise<Diagnostic[]>;
}
