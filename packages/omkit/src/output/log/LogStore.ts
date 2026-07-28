import { AsyncQueue } from "../../foundation/AsyncQueue.ts";
import type { LogEntry, LogInput, ReadableLog } from "../../foundation/LogEntry.ts";

/**
 * The run's single append-only timeline. Owns the run-global `sequence`, keeps the
 * full history (for replay + finalize projections), and fans live entries out to
 * subscribers. It holds no presentation — headers/prefixes are applied by writers
 * at read time. Actions receive it only as {@link ReadableLog}.
 */
export class LogStore implements ReadableLog {
  private seq = 0;
  private readonly history: LogEntry[] = [];
  private readonly subscribers = new Set<AsyncQueue<LogEntry>>();
  private ended = false;

  /** Append one entry; stamps `sequence`/`ts`, retains it, fans it out. */
  append(input: LogInput): LogEntry {
    const entry: LogEntry = { ...input, sequence: ++this.seq, ts: Date.now() };
    this.history.push(entry);
    for (const subscriber of this.subscribers) subscriber.push(entry);
    return entry;
  }

  subscribe({ replay = false } = {}): AsyncIterable<LogEntry> {
    const queue = new AsyncQueue<LogEntry>();
    if (replay) for (const entry of this.history) queue.push(entry);
    if (this.ended) queue.close();
    else this.subscribers.add(queue);

    const subscribers = this.subscribers;
    const inner = queue[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => inner.next(),
          return: () => {
            subscribers.delete(queue);
            queue.close();
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
  }

  /** EOF for readers: end every live subscription and refuse new ones. Called once at finalize. */
  close(): void {
    this.ended = true;
    for (const queue of this.subscribers) queue.close();
    this.subscribers.clear();
  }

  /** The complete history — the source for finalize-time projections (per-node logs, rollups). */
  entries(): readonly LogEntry[] {
    return this.history;
  }
}
