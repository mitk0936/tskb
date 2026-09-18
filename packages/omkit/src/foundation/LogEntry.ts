/**
 * One row on the run's timeline, and the read-only log view. Plain data shapes in
 * foundation so every layer (output writers, core, actions) can name them without
 * depending on the output layer. Attribution is lightweight — `nodeId`/`path`, not
 * the full ActionRef — so name/tags aren't repeated per row.
 */
export interface LogEntry {
  /** The run-global monotonic sequence — the cross-file merge/ordering key. */
  readonly sequence: number;
  /** Epoch millis when appended. */
  readonly ts: number;
  /** The owning node's id (attribution key). */
  readonly nodeId: string;
  /** The owning node's execution path (`main/chromePage_9f3c`). */
  readonly path: string;
  /** `info` | `error` | `event` | `assert` | `snapshot` | `artifact` | `tag` | `child` | `run`. */
  readonly level: string;
  /** Finer origin within the node (proc name, `event`, `run`, …). */
  readonly source: string;
  readonly message: string;
}

/** What an appender supplies; the store stamps `sequence` and `ts`. */
export type LogInput = Omit<LogEntry, "sequence" | "ts">;

/** The read-only view handed to actions — they can observe the log, never write it. */
export interface ReadableLog {
  subscribe(options?: { replay?: boolean }): AsyncIterable<LogEntry>;
}
