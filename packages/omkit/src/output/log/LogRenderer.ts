import type { LogEntry } from "./LogsCollector.ts";

/** The special "title" log lines that get a distinguishing prefix. */
export type MarkerKind = "event" | "action" | "run" | "snapshot" | "assert";

const PREFIX: Record<MarkerKind, string> = {
  event: "⚡",
  action: "▸",
  run: "●",
  snapshot: "📎",
  assert: "⊨",
};

/**
 * Levels that render as their own top-level milestone line — marker-prefixed and
 * never grouped/indented. Everything else is action/proc output, which the
 * renderer groups under an `▸ <source>` header and indents.
 */
const MILESTONE: Record<string, MarkerKind> = {
  run: "run",
  event: "event",
  snapshot: "snapshot",
  assert: "assert",
};

/** Only runs *longer than* this collapse, so a trigger always hides a meaningful amount. */
const COLLAPSE_THRESHOLD = 15;

/** A run set aside for collapsing: its source and every output line, in order. */
export interface CollapsedRun {
  readonly source: string;
  readonly lines: readonly string[];
}

/**
 * One unit of batch-rendered output: either a ready-to-write text `line`
 * (identical to {@link LogRenderer.render}'s output for that entry) or a
 * `collapsed` run the caller must off-load and render via {@link LogRenderer.renderCollapsed}.
 */
export type DisplayItem = { kind: "line"; text: string } | { kind: "collapsed"; run: CollapsedRun };

/**
 * Turns raw {@link LogEntry} records into the pretty, grouped text form.
 * Presentation lives here and nowhere else: the collector stores raw entries; the
 * live drain and `run.log` writer each construct a renderer and feed it entries in
 * order. Two modes over the same grouping rules — pick per instance, don't mix:
 *
 * - **streaming** — {@link render} returns one entry's line as it arrives (live
 *   drain, incremental `run.log`).
 * - **batch** — {@link push}/{@link end} accumulate a same-source run and collapse
 *   it when it grows past the threshold, so one proc's burst can't drown the
 *   durable `run.log` (the caller off-loads the full run to a snapshot).
 *
 * Grouping is decided against the *single merged stream* (`lastSource`), not
 * per-producer — so interleaved concurrent sources re-header correctly. A
 * milestone line breaks the current group, so the next action line re-headers.
 */
export class LogRenderer {
  /** Lines of a collapsed run shown inline before the pointer. */
  static readonly COLLAPSE_HEAD = 5;

  /** Prefix a milestone/header line with its marker (`● run`, `▸ action`, …). */
  static marker(kind: MarkerKind, text: string): string {
    return `${PREFIX[kind]} ${text}`;
  }

  /**
   * Renders a {@link CollapsedRun} as its `head` lines under the `▸ <source>`
   * header, then a single indented `📎` pointer line to the off-loaded snapshot at
   * `rel` reporting how many lines were hidden. Pure — `rel` is supplied by the
   * caller after it writes the file.
   */
  static renderCollapsed(
    run: CollapsedRun,
    { rel, head = LogRenderer.COLLAPSE_HEAD }: { rel: string; head?: number }
  ): string {
    const shown = run.lines.slice(0, head);
    const lines = shown.map((message, i) =>
      i === 0 ? `${LogRenderer.marker("action", run.source)}\n\t${message}` : `\t${message}`
    );
    const hidden = run.lines.length - shown.length;
    lines.push(`\t${LogRenderer.marker("snapshot", `… +${hidden} more lines → ${rel}`)}`);
    return lines.join("\n");
  }

  // Streaming grouping state: the source of the group currently open.
  private lastSource: string | undefined;

  // Batch state: the same-source run currently being accumulated.
  private run: { source: string; lines: string[] } | undefined;

  private readonly threshold: number;

  constructor(threshold: number = COLLAPSE_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * Streaming: render one entry to its pretty line. A milestone renders as its own
   * marker line and breaks the group; other entries are grouped under an
   * `▸ <source>` header (first line of a group) and indented (the rest).
   */
  render(entry: LogEntry): string {
    const milestone = MILESTONE[entry.level];
    if (milestone) {
      // Reset grouping: after an interjection, the next action line re-headers.
      this.lastSource = undefined;
      return LogRenderer.marker(milestone, entry.message);
    }
    if (entry.source !== this.lastSource) {
      this.lastSource = entry.source;
      return `${LogRenderer.marker("action", entry.source)}\n\t${entry.message}`;
    }
    return `\t${entry.message}`;
  }

  /**
   * Batch: push an entry in order and get back the {@link DisplayItem}s that just
   * became final (0, 1, or a whole flushed run). Only the current same-source run
   * is held in memory, so segmenting a huge log stays bounded — the `run.log`
   * writer feeds this straight from `run.jsonl` on disk. Output is byte-identical
   * to {@link render} for non-collapsed runs. Pure — no filesystem.
   */
  push(entry: LogEntry): DisplayItem[] {
    const out: DisplayItem[] = [];
    const milestone = MILESTONE[entry.level];
    if (milestone) {
      // A milestone breaks the current run, then renders as its own line.
      this.flush(out);
      out.push({ kind: "line", text: LogRenderer.marker(milestone, entry.message) });
      return out;
    }
    if (this.run && this.run.source === entry.source) {
      this.run.lines.push(entry.message);
    } else {
      this.flush(out);
      this.run = { source: entry.source, lines: [entry.message] };
    }
    return out;
  }

  /** Batch: flush the last pending run (call once after the final {@link push}). */
  end(): DisplayItem[] {
    const out: DisplayItem[] = [];
    this.flush(out);
    return out;
  }

  // Flush the pending run into `out`: collapse it if it ran long, else emit grouped
  // lines exactly as `render` would (header first, indent the rest).
  private flush(out: DisplayItem[]): void {
    const run = this.run;
    if (!run) return;
    if (run.lines.length > this.threshold) {
      out.push({ kind: "collapsed", run: { source: run.source, lines: run.lines } });
    } else {
      run.lines.forEach((message, i) => {
        out.push({
          kind: "line",
          text:
            i === 0 ? `${LogRenderer.marker("action", run.source)}\n\t${message}` : `\t${message}`,
        });
      });
    }
    this.run = undefined;
  }
}
