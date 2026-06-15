import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "./log-collector/global.ts";
import { createRenderer } from "./log-collector/render.ts";
import type { LogsCollector } from "./log-collector/LogsCollector.ts";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The entry script's base name (the run's name), e.g. "tskb-build". */
const pipelineName = (): string => {
  const entry = process.argv[1];
  return entry ? path.basename(entry, path.extname(entry)) : "pipeline";
};

// One output directory per run (one run per process): logs/<name>/<date>/<time>/.
// Computed once, lazily — so the log file and every snapshot land together, even
// when a snapshot is taken mid-run before the log is flushed.
let dir: string | undefined;
const runDir = (): string => {
  if (dir) return dir;
  const now = new Date();
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  dir = path.join("logs", pipelineName(), day, time);
  return dir;
};

let made: Promise<void> | undefined;
const ensureDir = (): Promise<void> =>
  (made ??= mkdir(runDir(), { recursive: true }).then(() => {}));

/**
 * Drains the collected log to two files in the run's output folder (the common
 * `logs/<name>/<date>/<time>/` convention, local time):
 *
 * - `run.log` — the pretty, human-scannable rendering: just the message lines.
 * - `run.jsonl` — the structured, machine-queryable record: one full {@link LogEntry}
 *   per line (sequence, timestamp, level, source, message), so an agent can filter
 *   and correlate by origin/level/time instead of parsing prose.
 *
 * Returns the `run.log` path (the one surfaced to the terminal).
 */
export const writeLog = async (logs: LogsCollector): Promise<string> => {
  await ensureDir();
  const entries = logs.snapshot();

  // Apply grouping/indentation at write time from the raw entries (the same
  // renderer `drain` uses live), so the stored messages stay presentation-free.
  const render = createRenderer();
  const file = path.join(runDir(), "run.log");
  const pretty = entries.map(render).join("\n");
  await writeFile(file, pretty ? `${pretty}\n` : "", "utf8");

  const jsonlFile = path.join(runDir(), "run.jsonl");
  const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
  await writeFile(jsonlFile, jsonl ? `${jsonl}\n` : "", "utf8");

  return file;
};

let seq = 0;

/** Serialize a value for a snapshot file, tolerating circular refs / non-JSON values. */
const serialize = (value: unknown): string => {
  try {
    // JSON.stringify returns undefined for functions/undefined — fall back to a string.
    return JSON.stringify(value, null, 2) ?? JSON.stringify(String(value));
  } catch {
    // Circular or otherwise non-serializable: keep a best-effort representation
    // rather than throwing and losing the value entirely.
    return JSON.stringify(String(value));
  }
};

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
 * Writes `value` as a sequenced JSON snapshot file (`<name>-NN.json`) in the run's
 * output folder and returns its path — **without** logging a pointer line. The
 * path is computed synchronously (so callers can reference it in the same tick)
 * while the write proceeds in the background. Use {@link snapshot} when you also
 * want a `[snapshot]` line in the timeline; the event bus uses this directly to
 * link a non-string payload from its own line.
 */
export const captureSnapshot = (name: string, value: unknown): SnapshotRef => {
  const safe = name.replace(/[^\w.-]+/g, "-");
  const file = path.join(runDir(), `${safe}-${pad(++seq)}.json`);
  const written = ensureDir().then(() => writeFile(file, `${serialize(value)}\n`, "utf8"));
  // Normalize to forward slashes so the reference is portable in the log artifact.
  const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
  return { file, rel, written };
};

/**
 * Captures any value as a JSON snapshot file (via {@link captureSnapshot}) and
 * records a `[snapshot] <name>: <path>` line in the timeline at the point it's
 * taken. Files are sequenced so repeated snapshots of the same name are kept as a
 * history rather than overwritten. Callable any time, anywhere in the run;
 * returns the file path once written.
 */
export const snapshot = (name: string, value: unknown): Promise<string> => {
  const { file, rel, written } = captureSnapshot(name, value);
  // Record the pointer synchronously, so it sits at the right spot in the timeline.
  log.append({
    source: "snapshot",
    level: "snapshot",
    message: `${name}: ${rel}`,
  });
  return written.then(() => file);
};
