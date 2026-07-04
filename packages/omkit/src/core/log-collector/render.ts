import type { LogEntry } from "./LogsCollector.ts";
import { marker, type MarkerKind } from "../markers.ts";

/**
 * Levels that render as their own top-level milestone line — marker-prefixed and
 * never grouped/indented. Everything else is action/proc output, which the
 * renderer groups under an `[action] <source>` header and indents.
 */
const MILESTONE: Record<string, MarkerKind> = {
  run: "run",
  event: "event",
  snapshot: "snapshot",
};

/**
 * Builds a stateful renderer that turns raw {@link LogEntry} records into the
 * pretty, grouped text form. Presentation lives here and nowhere else: the
 * collector stores raw entries; `writeLog` and `drain` each create a renderer and
 * feed it the entry stream in order.
 *
 * Grouping is decided against the *single merged stream* (the renderer's own
 * `lastSource`), not per-producer — so interleaved concurrent sources re-header
 * correctly, which the old per-child grouping got wrong. A milestone line breaks
 * the current group, so the next action line re-headers.
 */
export const createRenderer = (): ((entry: LogEntry) => string) => {
  let lastSource: string | undefined;

  return (entry) => {
    const milestone = MILESTONE[entry.level];
    if (milestone) {
      // Reset grouping: after an interjection, the next action line re-headers.
      lastSource = undefined;
      return marker(milestone, entry.message);
    }

    if (entry.source !== lastSource) {
      lastSource = entry.source;
      return `${marker("action", entry.source)}\n\t${entry.message}`;
    }
    return `\t${entry.message}`;
  };
};

// ── Collapsing large output runs (batch / file rendering) ───────────────────
//
// A *run* is a maximal stretch of consecutive non-milestone entries sharing one
// `source` — the same grouping `createRenderer` does. When a proc emits a burst
// (a build's file tree, tsc/vite chatter), that run can be dozens of lines and
// drowns the durable `run.log`. The batch renderer below collapses an
// over-threshold run to its head plus a pointer; the full run is off-loaded to a
// text snapshot by the caller (which owns the filesystem — this stays pure).

/** Lines of a collapsed run shown inline before the pointer. */
export const COLLAPSE_HEAD = 5;
/** Only runs *longer than* this collapse, so a trigger always hides a meaningful amount. */
export const COLLAPSE_THRESHOLD = 15;

/** A run set aside for collapsing: its source and every output line, in order. */
export interface CollapsedRun {
  readonly source: string;
  readonly lines: readonly string[];
}

/**
 * One unit of batch-rendered output: either a ready-to-write text `line`
 * (identical to {@link createRenderer}'s output for that entry) or a
 * `collapsed` run the caller must off-load and render via {@link renderCollapsed}.
 */
export type DisplayItem = { kind: "line"; text: string } | { kind: "collapsed"; run: CollapsedRun };

/** Tunes {@link segmentForFile}. Defaults to {@link COLLAPSE_HEAD}/{@link COLLAPSE_THRESHOLD}. */
export interface SegmentOptions {
  head?: number;
  threshold?: number;
}

/**
 * A stateful, **streaming** segmenter: `push` each {@link LogEntry} in order and
 * it returns the {@link DisplayItem}s that just became final (0, 1, or a whole
 * flushed run), then `end()` flushes the last pending run. Only the current
 * same-source run is held in memory, so segmenting a huge log stays bounded —
 * {@link writeLog} feeds it straight from `run.jsonl` on disk. Output is
 * byte-identical to {@link segmentForFile}. Pure — no filesystem.
 */
export const createFileSegmenter = ({ threshold = COLLAPSE_THRESHOLD }: SegmentOptions = {}) => {
  // The run currently being accumulated: a same-source stretch of output lines.
  let run: { source: string; lines: string[] } | undefined;

  // Flush the pending run into `out`: collapse it if it ran long, else emit
  // grouped lines exactly as createRenderer would (header first, indent the rest).
  const flush = (out: DisplayItem[]): void => {
    if (!run) return;
    if (run.lines.length > threshold) {
      out.push({ kind: "collapsed", run: { source: run.source, lines: run.lines } });
    } else {
      run.lines.forEach((message, i) => {
        out.push({
          kind: "line",
          text: i === 0 ? `${marker("action", run!.source)}\n\t${message}` : `\t${message}`,
        });
      });
    }
    run = undefined;
  };

  return {
    push(entry: LogEntry): DisplayItem[] {
      const out: DisplayItem[] = [];
      const milestone = MILESTONE[entry.level];
      if (milestone) {
        // A milestone breaks the current run, then renders as its own line.
        flush(out);
        out.push({ kind: "line", text: marker(milestone, entry.message) });
        return out;
      }
      if (run && run.source === entry.source) {
        run.lines.push(entry.message);
      } else {
        flush(out);
        run = { source: entry.source, lines: [entry.message] };
      }
      return out;
    },
    end(): DisplayItem[] {
      const out: DisplayItem[] = [];
      flush(out);
      return out;
    },
  };
};

/**
 * Segments a full, ordered entry list into {@link DisplayItem}s (the array form of
 * {@link createFileSegmenter}). Milestones and runs no longer than `threshold`
 * become `line` items byte-identical to {@link createRenderer}; a run longer than
 * `threshold` becomes a single `collapsed` item carrying every line of the run.
 */
export const segmentForFile = (
  entries: readonly LogEntry[],
  options: SegmentOptions = {}
): DisplayItem[] => {
  const seg = createFileSegmenter(options);
  const items: DisplayItem[] = [];
  for (const entry of entries) items.push(...seg.push(entry));
  items.push(...seg.end());
  return items;
};

/**
 * Renders a {@link CollapsedRun} as its `head` lines under the `▸ <source>`
 * header, then a single indented `📎` pointer line to the off-loaded snapshot at
 * `rel` reporting how many lines were hidden. Pure — `rel` is supplied by the
 * caller after it writes the file.
 */
export const renderCollapsed = (
  run: CollapsedRun,
  { head, rel }: { head: number; rel: string }
): string => {
  const shown = run.lines.slice(0, head);
  const lines = shown.map((message, i) =>
    i === 0 ? `${marker("action", run.source)}\n\t${message}` : `\t${message}`
  );
  const hidden = run.lines.length - shown.length;
  lines.push(`\t${marker("snapshot", `… +${hidden} more lines → ${rel}`)}`);
  return lines.join("\n");
};
