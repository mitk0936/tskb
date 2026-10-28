import { AsyncResource } from "node:async_hooks";
import { watch as fsWatch } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { action } from "../core/action.ts";

export interface TailLogOptions {
  /** Replay the file's existing content first. Default false (start at the end). */
  fromStart?: boolean;
  /** Text encoding of the file. Default "utf8". */
  encoding?: BufferEncoding;
  /** Coalesce rapid writes within this window. Default 50ms. */
  debounceMs?: number;
  /**
   * Also re-check the file's size this often (ms), independent of watch events; 0 disables.
   * Needed on Windows, where appends through a handle another process keeps open often raise
   * no directory notification until that handle closes. Default 500ms.
   */
  pollMs?: number;
  /**
   * Log `[diag]` lines (watch events, filter decisions, pump/read activity, sizes and
   * offsets — never file contents) into this action's log. Default: on when
   * `OMKIT_DEBUG` is set.
   */
  diagnostics?: boolean;
}

/**
 * Tails a (possibly not-yet-existing) text file and streams each appended line
 * into the run's log — like `proc` streams a child's stdout, but for a file some
 * *other* process writes. Tracks a byte offset and reads only the delta, buffering
 * a partial trailing line until its newline; a shrink is treated as truncation
 * (offset resets). Daemon: runs until torn down, then flushes any partial line.
 */
export const tailLog = action("tailLog").run(
  async ({ signal }, target: string, opts: TailLogOptions = {}) => {
    const file = resolve(target);
    const dir = dirname(file);
    const name = basename(file);
    const {
      fromStart = false,
      encoding = "utf8",
      debounceMs = 50,
      pollMs = 500,
      diagnostics = Boolean(process.env.OMKIT_DEBUG),
    } = opts;
    const diag = diagnostics ? (msg: string): void => console.log(`[diag] ${msg}`) : undefined;

    let pos = 0; // bytes consumed so far
    let pending = ""; // partial trailing line, buffered until its newline
    let decoder = new StringDecoder(encoding);

    const feed = (text: string): void => {
      pending += text;
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (line) console.log(line);
      }
    };

    const readDelta = async (): Promise<void> => {
      let size: number;
      try {
        size = (await stat(file)).size;
      } catch (err) {
        diag?.(`stat failed: ${(err as NodeJS.ErrnoException).code ?? err}`);
        return; // missing/unreadable — wait for the next event
      }
      if (size !== pos) diag?.(`read size=${size} pos=${pos}`); // quiet on idle poll ticks

      if (size < pos) {
        // Truncation/rotation: restart from the top, drop stale buffers.
        diag?.(`truncated ${pos} -> ${size}, restarting from 0`);
        pos = 0;
        pending = "";
        decoder = new StringDecoder(encoding);
      }
      if (size <= pos) return;

      const handle = await open(file, "r");
      try {
        const CHUNK = 64 * 1024;
        const buffer = Buffer.allocUnsafe(CHUNK);
        while (pos < size) {
          const length = Math.min(CHUNK, size - pos);
          const { bytesRead } = await handle.read(buffer, 0, length, pos);
          if (bytesRead === 0) break;
          pos += bytesRead;
          diag?.(`read bytes=${bytesRead} pos=${pos}`);
          feed(decoder.write(buffer.subarray(0, bytesRead)));
        }
      } finally {
        await handle.close();
      }
    };

    // Serialize reads; coalesce extra triggers into a single follow-up pass.
    let reading = false;
    let again = false;
    let stopped = false;
    const pump = (): void => {
      if (stopped) return;
      if (reading) {
        again = true;
        diag?.("pump: read in flight, queued follow-up");
        return;
      }
      reading = true;
      void (async () => {
        try {
          do {
            again = false;
            await readDelta();
          } while (again);
        } catch (err) {
          diag?.(`read failed: ${(err as NodeJS.ErrnoException).code ?? err}`);
          throw err;
        } finally {
          reading = false;
        }
      })();
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      diag?.(`schedule pump in ${debounceMs}ms${timer ? " (reset pending timer)" : ""}`);
      timer = setTimeout(() => {
        timer = undefined;
        pump();
      }, debounceMs);
    };

    try {
      pos = fromStart ? 0 : (await stat(file)).size;
    } catch {
      pos = 0;
    }

    console.log(`tailing ${file}${fromStart ? " (from start)" : ""}`);
    diag?.(`watching dir=${dir} name=${name} startPos=${pos}`);
    if (fromStart) pump();
    // Fallback for missed notifications. Goes through the serialized pump and reads are
    // offset-based, so a tick racing a watch-triggered read can't overlap or duplicate it.
    const poll = pollMs > 0 ? setInterval(pump, pollMs) : undefined;

    const watcher = fsWatch(dir, (event, filename) => {
      const accepted = filename === null || filename === name;
      diag?.(`watch ${event} filename=${filename} ${accepted ? "accepted" : "ignored"}`);
      if (accepted) schedule();
    });
    if (diag) {
      // Observe only: rethrow so a watcher error stays as loud as it is without a listener.
      watcher.on("error", (err) => {
        diag(`watcher error: ${err.message}`);
        throw err;
      });
    }

    return new Promise<void>((resolveRun) => {
      // Bound to this action's async context: the abort listener otherwise runs in the
      // canceller's, and the flushed partial line would be attributed to that node instead.
      const stop = AsyncResource.bind((): void => {
        diag?.(`stop: aborted, pos=${pos} pendingChars=${pending.length}`);
        stopped = true;
        if (timer) clearTimeout(timer);
        if (poll) clearInterval(poll);
        watcher.close();
        const tail = pending.replace(/\r$/, "");
        pending = "";
        if (tail) console.log(tail);
        resolveRun();
      });
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    });
  }
);
