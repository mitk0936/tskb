import type { Logger } from "./log/LogsCollector.ts";
import { RunFolder } from "./folder/RunFolder.ts";
import { SnapshotStore } from "./snapshot/SnapshotStore.ts";
import { RunLog } from "./log/RunLog.ts";

/**
 * The run's output subsystem — the composition root that owns the per-run folder and
 * the writers layered on it, and hands them to the rest of the process.
 *
 * Each run owns one of these: its {@link SpinHost} constructs an `Output` over the
 * run's log and threads it to actions as `ctx.output`. Everything that was
 * module-global in the old `output.ts` (the folder path, the mkdir latch, the
 * snapshot sequence) now lives inside these three members, reachable as
 * `output.folder`, `output.snapshots`, `output.runLog` — so callers reach for a named
 * layer instead of a free function, and the shared state has one owner per run.
 */
export class Output {
  /** The per-run directory and artifact drop. */
  readonly folder: RunFolder;

  /** Sequenced JSON/text snapshot files + `[snapshot]` timeline lines. */
  readonly snapshots: SnapshotStore;

  /** The `run.jsonl` / `run.log` writer. */
  readonly runLog: RunLog;

  constructor(logger: Logger) {
    this.folder = new RunFolder();
    this.snapshots = new SnapshotStore(this.folder, logger);
    this.runLog = new RunLog(this.folder, this.snapshots);
  }
}
