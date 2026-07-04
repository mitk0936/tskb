import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { log } from "./log-collector/global.ts";
import {
  COLLAPSE_HEAD,
  createFileSegmenter,
  createRenderer,
  renderCollapsed,
  type DisplayItem,
} from "./log-collector/render.ts";
import type { LogEntry, LogsCollector } from "./log-collector/LogsCollector.ts";

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

let ensuredSync = false;
/**
 * Absolute path to this run's output folder — `logs/<name>/<date>/<time>/`, where
 * `run.log`, `run.jsonl`, and snapshots live. Exposed so actions can drop their
 * own **artifacts** into the same per-run folder (one folder per run; one run per
 * process). The folder is created on first access — synchronously, so a caller
 * can write into it in the same tick — and the path is absolute so it's safe to
 * hand to a child process with a different cwd.
 */
export const artifactsFolder = (): string => {
  const abs = path.resolve(runDir());
  if (!ensuredSync) {
    mkdirSync(abs, { recursive: true });
    ensuredSync = true;
  }
  return abs;
};

/** A compact header block for the top of run.log — legend + run identity. */
const logHeader = (): string => {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return [
    `─── ${pipelineName()} · ${date} ${time} ───`,
    `● run  ⚡ event  ▸ action  📎 snapshot  ⇥ output`,
    "",
  ].join("\n");
};

/**
 * Renders the final, collapsed `run.log` from the authoritative `run.jsonl` (the
 * complete record {@link streamLog} wrote), **streaming** it line by line so the
 * whole run is never held in memory. Grouping/indentation is applied here so the
 * stored `run.jsonl` stays presentation-free; large same-source runs are collapsed
 * — off-loaded to a text snapshot and replaced inline by their head plus a pointer
 * — so one proc's burst can't drown the timeline. `run.jsonl` is left as-is (it's
 * the full raw record). Returns the `run.log` path (surfaced to the terminal).
 *
 * Call only after {@link streamLog} has closed (the run's log is ended), so
 * `run.jsonl` is complete and no longer being written.
 */
export const writeLog = async (): Promise<string> => {
  await ensureDir();
  const jsonlFile = path.join(runDir(), "run.jsonl");
  const file = path.join(runDir(), "run.log");

  const out = createWriteStream(file);
  out.write(logHeader());

  const seg = createFileSegmenter();
  const writes: Promise<void>[] = [];
  const emit = (item: DisplayItem): void => {
    if (item.kind === "line") {
      out.write(item.text + "\n");
    } else {
      const snap = captureText(`output-${item.run.source}`, item.run.lines);
      writes.push(snap.written);
      out.write(renderCollapsed(item.run, { head: COLLAPSE_HEAD, rel: snap.rel }) + "\n");
    }
  };

  try {
    const rl = createInterface({ input: createReadStream(jsonlFile), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) continue;
      let entry: LogEntry;
      try {
        entry = JSON.parse(line) as LogEntry;
      } catch {
        continue; // a torn final line (dirty exit) — skip it
      }
      for (const item of seg.push(entry)) emit(item);
    }
  } catch {
    // run.jsonl missing/unreadable (e.g. a very early crash) — write what we have.
  }
  for (const item of seg.end()) emit(item);

  await streamClosed(out); // flush + close run.log before reporting it written
  await Promise.all(writes); // ensure every off-loaded run is on disk
  return file;
};

/**
 * Streams every log entry to `run.jsonl` (the complete, authoritative record) and
 * a live `run.log` incrementally as they arrive, so output survives a hard kill or
 * lost SIGINT. The log is closed once at finalize, after which {@link writeLog}
 * re-renders `run.log` from `run.jsonl` in collapsed form.
 *
 * Subscribes **synchronously, before any `await`** — so a fast synchronous
 * producer that appends (and trims the in-memory history) before the file setup
 * finishes still has its entries buffered on the subscription queue rather than
 * lost. `replay: true` covers anything already logged when this is called.
 */
export const streamLog = async (logs: LogsCollector): Promise<void> => {
  const entries = logs.subscribe({ replay: true });
  await ensureDir();
  const jsonlFile = path.join(runDir(), "run.jsonl");
  const logFile = path.join(runDir(), "run.log");

  const jsonl = createWriteStream(jsonlFile);
  const pretty = createWriteStream(logFile);
  const render = createRenderer();

  pretty.write(logHeader() + "\n");

  try {
    for await (const entry of entries) {
      jsonl.write(JSON.stringify(entry) + "\n");
      pretty.write(render(entry) + "\n");
    }
  } finally {
    // End AND wait for both streams to fully close before resolving. {@link writeLog}
    // re-renders run.log at finalize (from this run.jsonl); if a buffered chunk from
    // this stream landed *after* writeLog truncated run.log, the OS would zero-fill
    // the gap — a multi-MB run of NUL bytes. `run` awaits this promise before
    // calling `writeLog`, so this writer is guaranteed done first (and run.jsonl is
    // complete for writeLog to read).
    await Promise.all([streamClosed(jsonl), streamClosed(pretty)]);
  }
};

/** Resolve once a write stream has flushed and closed its file descriptor. */
const streamClosed = (stream: ReturnType<typeof createWriteStream>): Promise<void> =>
  new Promise((resolve) => {
    stream.on("close", () => resolve());
    stream.on("error", () => resolve()); // a stream error still frees the file; don't hang
    stream.end();
  });

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
 * Writes raw text `lines` as a sequenced `.log` snapshot file in the run's output
 * folder and returns its path refs — the text sibling of {@link captureSnapshot}
 * (which writes JSON). {@link writeLog} uses it to off-load a collapsed output
 * run from `run.log`, keeping the burst's full text one click away.
 */
export const captureText = (name: string, lines: readonly string[]): SnapshotRef => {
  const safe = name.replace(/[^\w.-]+/g, "-");
  const file = path.join(runDir(), `${safe}-${pad(++seq)}.log`);
  const body = lines.length ? `${lines.join("\n")}\n` : "";
  const written = ensureDir().then(() => writeFile(file, body, "utf8"));
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
