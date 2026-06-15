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
