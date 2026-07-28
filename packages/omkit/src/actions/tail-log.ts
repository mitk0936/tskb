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
    const { fromStart = false, encoding = "utf8", debounceMs = 50 } = opts;

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
      } catch {
        return; // missing/unreadable — wait for the next event
      }

      if (size < pos) {
        // Truncation/rotation: restart from the top, drop stale buffers.
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
          feed(decoder.write(buffer.subarray(0, bytesRead)));
        }
      } finally {
        await handle.close();
      }
    };

    // Serialize reads; coalesce extra triggers into a single follow-up pass.
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

    try {
      pos = fromStart ? 0 : (await stat(file)).size;
    } catch {
      pos = 0;
    }

    console.log(`tailing ${file}${fromStart ? " (from start)" : ""}`);
    if (fromStart) pump();

    const watcher = fsWatch(dir, (_event, filename) => {
      if (filename === null || filename === name) schedule();
    });

    return new Promise<void>((resolveRun) => {
      const stop = (): void => {
        if (timer) clearTimeout(timer);
        watcher.close();
        const tail = pending.replace(/\r$/, "");
        if (tail) console.log(tail);
        resolveRun();
      };
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    });
  }
);
