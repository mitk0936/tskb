import { mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ymd, hms } from "../../utils/format.ts";

/**
 * Owns this process's single output directory — `logs/<name>/<date>/<time>/`, where
 * `run.log`, `run.jsonl`, and snapshots all live together.
 *
 * One folder per run, one run per process: the path is computed **once, lazily**, so
 * a snapshot taken mid-run lands in the same folder as the log that's flushed later.
 * The {@link SnapshotStore} and {@link RunLog} take a shared instance rather than
 * reaching for module globals, so "where does this run's output go" has one owner.
 */
export class RunFolder {
  // Computed once on first access and cached — every consumer sees the same folder.
  private dir: string | undefined;

  // Memoized async mkdir; the promise is shared so concurrent callers await one op.
  private made: Promise<void> | undefined;

  // Whether the folder has been created synchronously (for `artifacts()`).
  private ensuredSync = false;

  /** The entry script's base name (the run's name), e.g. "tskb-build". */
  name(): string {
    const entry = process.argv[1];
    return entry ? path.basename(entry, path.extname(entry)) : "pipeline";
  }

  /** The run's output directory, `logs/<name>/<date>/<time>/` — computed once, lazily. */
  path(): string {
    if (this.dir) return this.dir;
    const now = new Date();
    this.dir = path.join("logs", this.name(), ymd(now), hms(now, "-"));
    return this.dir;
  }

  /** A path inside the run folder — `join(path(), name)`. */
  resolve(name: string): string {
    return path.join(this.path(), name);
  }

  /** Create the folder, memoized — every caller awaits the same underlying mkdir. */
  ensure(): Promise<void> {
    return (this.made ??= mkdir(this.path(), { recursive: true }).then(() => {}));
  }

  /**
   * Absolute path to the run folder, created **synchronously** so a caller can write
   * into it in the same tick. Absolute so it's safe to hand to a child process with a
   * different cwd. This is the artifact drop for actions that want to write beside
   * `run.log` (one folder per run; one run per process).
   */
  artifacts(): string {
    const abs = path.resolve(this.path());
    if (!this.ensuredSync) {
      mkdirSync(abs, { recursive: true });
      this.ensuredSync = true;
    }
    return abs;
  }
}
