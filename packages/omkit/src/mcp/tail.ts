import fs from "node:fs";
import path from "node:path";
import type { LogEntry } from "../foundation/LogEntry.ts";

export interface TailPage {
  readonly entries: LogEntry[];
  /** Pass this back as `cursor` to continue where this page stopped. */
  readonly nextCursor: number;
  /** The oldest sequence still available, when the live buffer has dropped older lines. */
  readonly dropped: number;
}

const page = (entries: LogEntry[], cursor: number, dropped: number): TailPage => ({
  entries,
  nextCursor: entries.length ? entries[entries.length - 1]!.sequence : cursor,
  dropped,
});

/**
 * A page from a live run's buffer. `sequence` is the run-global monotonic key the log
 * store stamps, so it doubles as the cursor with nothing extra to track.
 */
export function tailLive(
  run: { entries: readonly LogEntry[]; dropped: number },
  cursor: number,
  limit: number
): TailPage {
  const after = run.entries.filter((e) => e.sequence > cursor).slice(0, limit);
  return page(after, cursor, run.dropped);
}

/**
 * A page from a settled run's `raw.jsonl` — the complete record, which the bounded live
 * buffer is not. Read whole and filtered: run logs are bounded by the run, and a streaming
 * reader would buy little for a lot of machinery.
 *
 * An unparseable line is skipped rather than fatal: `raw.jsonl` is appended to during the
 * run, so a tail can catch a line mid-write.
 */
export function tailFile(folder: string, cursor: number, limit: number): TailPage {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(folder, "raw.jsonl"), "utf8");
  } catch {
    return { entries: [], nextCursor: cursor, dropped: 0 };
  }
  const entries: LogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: LogEntry;
    try {
      parsed = JSON.parse(line) as LogEntry;
    } catch {
      continue;
    }
    if (typeof parsed.sequence !== "number" || parsed.sequence <= cursor) continue;
    entries.push(parsed);
    if (entries.length >= limit) break;
  }
  return page(entries, cursor, 0);
}

/**
 * Trim an entry to what a client can act on. `nodeId` is an internal attribution key and
 * says nothing a reader can use — `path` already names the node readably.
 */
export function publicEntry(e: LogEntry): {
  sequence: number;
  ts: number;
  path: string;
  level: string;
  source: string;
  message: string;
} {
  return {
    sequence: e.sequence,
    ts: e.ts,
    path: e.path,
    level: e.level,
    source: e.source,
    message: e.message,
  };
}
