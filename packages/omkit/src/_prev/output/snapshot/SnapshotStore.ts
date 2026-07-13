import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../log/LogsCollector.ts";
import type { RunFolder } from "../folder/RunFolder.ts";
import { pad } from "../../utils/format.ts";
import { serialize } from "../../utils/serialize.ts";

/** A written (or in-flight) snapshot file and where to find it. */
export interface SnapshotRef {
  /** Absolute path to the snapshot file. */
  readonly file: string;
  /** Path relative to cwd — what a log line references. */
  readonly rel: string;
  /** Resolves once the file is flushed to disk. */
  readonly written: Promise<void>;
}

/**
 * Writes sequenced snapshot files into the run folder and (for {@link snapshot})
 * drops a `[snapshot]` pointer line into the timeline.
 *
 * Sequence numbers make repeated snapshots of the same name a history rather than an
 * overwrite. Paths are computed synchronously so a caller can reference the file in
 * the same tick while the write proceeds in the background. Depends on a
 * {@link RunFolder} (where the files land) and a {@link Logger} (only `snapshot`
 * writes a timeline line).
 */
export class SnapshotStore {
  private seq = 0;

  private readonly folder: RunFolder;

  private readonly log: Logger;

  constructor(folder: RunFolder, log: Logger) {
    this.folder = folder;
    this.log = log;
  }

  /**
   * Writes `value` as a sequenced JSON snapshot file (`<name>-NN.json`) and returns its
   * path — **without** logging a pointer line. The path is computed synchronously while
   * the write proceeds in the background. Use {@link snapshot} when you also want a
   * `[snapshot]` line in the timeline; the event bus uses this directly to link a
   * non-string payload from its own line.
   */
  captureJson(name: string, value: unknown): SnapshotRef {
    return this.capture(name, "json", `${serialize(value)}\n`);
  }

  /**
   * Writes raw text `lines` as a sequenced `.log` snapshot file — the text sibling of
   * {@link captureJson}. {@link RunLog.write} uses it to off-load a collapsed output run
   * from `run.log`, keeping the burst's full text one click away.
   */
  captureText(name: string, lines: readonly string[]): SnapshotRef {
    return this.capture(name, "log", lines.length ? `${lines.join("\n")}\n` : "");
  }

  /**
   * Captures a value as a JSON snapshot (via {@link captureJson}) and records a
   * `[snapshot] <name>: <path>` line in the timeline at the point it's taken. Callable
   * any time, anywhere in the run; resolves with the file path once written.
   */
  snapshot(name: string, value: unknown): Promise<string> {
    const { file, rel, written } = this.captureJson(name, value);
    // Record the pointer synchronously, so it sits at the right spot in the timeline.
    this.log.append({ source: "snapshot", level: "snapshot", message: `${name}: ${rel}` });
    return written.then(() => file);
  }

  /** Shared writer: sequence + sanitize the name, write in the background, return its refs. */
  private capture(name: string, ext: "json" | "log", body: string): SnapshotRef {
    const safe = name.replace(/[^\w.-]+/g, "-");
    const file = this.folder.resolve(`${safe}-${pad(++this.seq)}.${ext}`);
    const written = this.folder.ensure().then(() => writeFile(file, body, "utf8"));
    // Normalize to forward slashes so the reference is portable in the log artifact.
    const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
    return { file, rel, written };
  }
}
