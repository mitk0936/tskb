import type { LogEntry } from "../foundation/LogEntry.ts";
import type { PromptSpec } from "../core/interaction.ts";
import type { Registry, RegistrationSet } from "./registry.ts";

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

/** Node inspector wiring for a run's forked child, so a debugger can attach to the om. */
export interface InspectOptions {
  /** Inspector port the child listens on. */
  readonly port: number;
}

/** Options for launching a run. */
export interface RunOptions {
  /** Working directory for the child process (defaults to the om file's directory). */
  readonly cwd?: string;
  /** When set, fork the child with the Node inspector open so a debugger can attach. */
  readonly inspect?: InspectOptions;
  /** Extra environment for the child, merged over the parent's — how `OMKIT_ARGS` travels. */
  readonly env?: Record<string, string>;
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
  /** A pending prompt was withdrawn by the child (timed out or torn down) — clear it from the UI. */
  promptDone: (id: string) => void;
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
  /** The `tsconfig.omkit.json` path this client scans and runs against — the single source of it. */
  readonly tsconfig: string;
  /** Statically scan the project's `tsconfig.omkit.json` for oms and actions. */
  discover(): Promise<Registry>;
  /**
   * Read what the project's oms and actions declare, by importing them in a throwaway
   * child. Unlike {@link OmkitClient.discover} this executes user code, so it is never on
   * the `omkit ls` path — only a caller that needs real schemas should ask for it.
   */
  discoverRegistrations(): Promise<RegistrationSet>;
  /** Spawn an om file as a supervised child and return its live session (the Ink UI drives this). */
  run(omFile: string, opts?: RunOptions): RunSession;
  /** Spawn an om file bare — inherited stdio, no supervision — and resolve its exit code. */
  runBare(omFile: string, opts?: RunOptions): Promise<number>;
  /** Typecheck the project (`tsc --noEmit`) and return diagnostics. */
  check(): Promise<Diagnostic[]>;
}
