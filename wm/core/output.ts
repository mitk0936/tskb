import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "./logs/global.ts";
import { marker } from "./markers.ts";
import type { LogsCollector } from "./logs/LogsCollector.ts";

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
 * Drains the collected log to `<runDir>/run.log` (the common
 * `logs/<name>/<date>/<time>/` convention, local time). Returns the path written.
 */
export const writeLog = async (logs: LogsCollector): Promise<string> => {
  await ensureDir();
  const file = path.join(runDir(), "run.log");
  const body = logs
    .snapshot()
    .map((entry) => entry.message)
    .join("\n");
  await writeFile(file, body ? `${body}\n` : "", "utf8");
  return file;
};

let seq = 0;

/**
 * Captures any value as a JSON snapshot file in the run's output folder, next to
 * its log, and records a `[snapshot] <name>: <path>` line in the timeline at the
 * point it's taken. Files are sequenced (`<name>-NN.json`) so repeated snapshots
 * of the same name are kept as a history rather than overwritten. Callable any
 * time, anywhere in the run; returns the file path.
 */
export const snapshot = (name: string, value: unknown): Promise<string> => {
  const safe = name.replace(/[^\w.-]+/g, "-");
  const file = path.join(runDir(), `${safe}-${pad(++seq)}.json`);
  // Record the pointer synchronously, so it sits at the right spot in the timeline.
  log.append({
    source: "snapshot",
    level: "snapshot",
    message: marker("snapshot", `${name}: ${path.relative(process.cwd(), file)}`),
  });
  return ensureDir()
    .then(() => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"))
    .then(() => file);
};
