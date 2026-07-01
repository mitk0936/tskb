import { watch as fsWatch } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { action } from "../core/action.ts";

export interface TailLogOptions {
  /** Label the lines are logged under. Default: the file's basename. */
  source?: string;
  /** Level for appended lines. Default "info". */
  level?: string;
  /**
   * Replay the file's existing content first. Default false — start at the
   * current end and only stream what's appended from now on (like `tail -f`).
   */
  fromStart?: boolean;
  /** Text encoding of the file. Default "utf8". */
  encoding?: BufferEncoding;
  /** Coalesce rapid writes within this window. Default 50ms. */
  debounceMs?: number;
}

/**
 * Tails a (possibly not-yet-existing) text/log file and streams each appended
 * line into the run's combined log — the way `proc` streams a child's stdout, but
 * for a file some *other* process writes. Useful for folding an external tool's
 * own log file into the one timeline.
 *
 * It tracks a byte offset and reads only the delta on each change, buffering a
 * partial trailing line until its newline arrives (so a line split across two
 * writes is logged once, whole). A shrink in size is treated as truncation or
 * rotation — the offset resets to 0 and reading resumes from the top. Since
 * `fs.watch` can't watch a missing path, it watches the parent directory and
 * filters by name, like {@link import("./watch.ts").watch}. Runs until the run's
 * signal aborts, then closes the watcher (flushing any trailing partial line).
 */
export const tailLog = action("Tail Log").run(
  async ({ logs, signal }, target: string, opts: TailLogOptions = {}) => {
    const file = resolve(target);
    const dir = dirname(file);
    const name = basename(file);
    const {
      source = name,
      level = "info",
      fromStart = false,
      encoding = "utf8",
      debounceMs = 50,
    } = opts;

    let pos = 0; // bytes consumed so far
    let pending = ""; // partial trailing line, buffered until its newline

    // Append every complete line in `text`, keeping any remainder for next time.
    const feed = (text: string): void => {
      pending += text;
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (line) logs.append({ source, level, message: line });
      }
    };

    // Read [pos, size) and feed it. Catches the file being absent (rotated away)
    // and resets on a shrink (truncation/rotation), so reading self-heals.
    const readDelta = async (): Promise<void> => {
      let size: number;
      try {
        size = (await stat(file)).size;
      } catch {
        return; // missing/unreadable — wait for the next event
      }
      if (size < pos) {
        pos = 0;
        pending = "";
      }
      if (size <= pos) return;

      const handle = await open(file, "r");
      try {
        const length = size - pos;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, pos);
        pos = size;
        feed(buffer.toString(encoding));
      } finally {
        await handle.close();
      }
    };

    // Serialize reads so a burst of events can't overlap; coalesce extra triggers
    // into a single follow-up pass.
    let reading = false;
    let again = false;
    const pump = (): void => {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      void (async () => {
        try {
          do {
            again = false;
            await readDelta();
          } while (again);
        } finally {
          reading = false;
        }
      })();
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(pump, debounceMs);
    };

    // Seed the offset: from the top when replaying, otherwise from the current end
    // so existing content is skipped. A missing file starts at 0 — its content
    // counts as "appended" once it appears.
    try {
      pos = fromStart ? 0 : (await stat(file)).size;
    } catch {
      pos = 0;
    }
    if (fromStart) pump();

    const watcher = fsWatch(dir, (_event, filename) => {
      if (filename === null || filename === name) schedule();
    });

    // Daemon: stay alive until torn down, then stop and flush any partial line.
    return new Promise<void>((resolveRun) => {
      const stop = (): void => {
        if (timer) clearTimeout(timer);
        watcher.close();
        const tail = pending.replace(/\r$/, "");
        if (tail) logs.append({ source, level, message: tail });
        resolveRun();
      };
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    });
  }
);
