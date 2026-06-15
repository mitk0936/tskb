import { AsyncQueue } from "../helpers/AsyncQueue.ts";

export interface LogEntry {
  sequence: number;
  timestamp: number;
  /**
   * Who emitted this line — an action/proc name, or `"event"`/`"run"`/`"snapshot"`.
   * Retained so the structured log can be filtered and correlated by origin.
   */
  source: string;
  level: string;
  message: string;
}

/** Input to a logger. `source` drives the header line and is retained on the entry. */
export interface LogInput {
  source: string;
  level: string;
  message: string;
}

export interface SubscribeOptions {
  /**
   * Replay the buffered history before live entries, so a late subscriber sees
   * everything logged so far. Default: false (live entries only).
   */
  replay?: boolean;
}

/**
 * What actions and the `proc` primitive log into: a raw append-only store. It
 * keeps no presentation — grouping headers and indentation are applied at read
 * time by the renderer (see `render.ts`), so every entry stays raw and queryable.
 */
export interface Logger {
  /** Streams a raw text/byte source into the log, split into lines. */
  attach(stream: AsyncIterable<unknown>, source: string, level: string): void;
  /** Appends a single entry. */
  append(entry: LogInput): void;
  /** Subscribes to entries, optionally replaying history first. */
  subscribe(options?: SubscribeOptions): AsyncIterable<LogEntry>;
}

export class LogsCollector implements Logger {
  private sequence = 0;

  private readonly history: LogEntry[] = [];

  private readonly subscribers = new Set<AsyncQueue<LogEntry>>();

  // Set once the bound signal aborts: the log has reached EOF for readers.
  private ended = false;

  /**
   * Streams a raw text/byte source (e.g. a child process's stdout) into the
   * collector: splits it into lines and appends each under the given
   * `source`/`level`. Partial lines are buffered across chunks and a non-empty
   * trailing fragment is flushed when the stream ends.
   */
  attach(stream: AsyncIterable<unknown>, source: string, level: string): void {
    void splitLines(stream, (message) => this.append({ source, level, message }));
  }

  /** Raw store: records the line verbatim, source included; presentation is the renderer's job. */
  append(entry: LogInput): void {
    const log: LogEntry = {
      source: entry.source,
      level: entry.level,
      message: entry.message,
      sequence: ++this.sequence,
      timestamp: Date.now(),
    };

    this.history.push(log);

    for (const subscriber of this.subscribers) {
      // push the log into the queue for every subscriber to receive
      subscriber.push(log);
    }
  }

  /**
   * Bind the run's abort signal: when it aborts (teardown), every subscription
   * ends — each parked or future `for await` returns — so subscribers don't each
   * have to watch the signal. The collector *is* the world's log and the signal
   * is the world ending; the log closes with it.
   */
  endOn(signal: AbortSignal): void {
    if (signal.aborted) this.closeAll();
    else signal.addEventListener("abort", () => this.closeAll(), { once: true });
  }

  /** EOF for readers: end every live subscription and refuse to register new ones. */
  private closeAll(): void {
    this.ended = true;
    for (const queue of this.subscribers) queue.close();
    this.subscribers.clear();
  }

  subscribe({ replay = false }: SubscribeOptions = {}): AsyncIterable<LogEntry> {
    // create a log queue for the new subscriber
    const queue = new AsyncQueue<LogEntry>();

    // Optionally replay buffered history before live entries. Synchronous, so no
    // append can interleave between the replay and registration — a late
    // subscriber sees every entry, with no gap and no duplicate.
    if (replay) for (const entry of this.history) queue.push(entry);

    // If the run has already ended, this subscription is EOF after the replay —
    // don't register it for entries that will never come. Otherwise, fan it in.
    if (this.ended) queue.close();
    else this.subscribers.add(queue);

    const { subscribers } = this;

    // logs queue for the current subscriber
    const inner = queue[Symbol.asyncIterator]();

    return {
      [Symbol.asyncIterator]() {
        return {
          // iterates the subscriber's log queue
          next: () => inner.next(),
          // Unsubscribe on early exit (break/return), so a consumer that stops
          // reading (e.g. waitForLog on a match) doesn't leave a dead queue that
          // append keeps pushing into forever.
          return: () => {
            subscribers.delete(queue);
            queue.close();
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
  }

  snapshot(): readonly LogEntry[] {
    return this.history;
  }
}

/**
 * Splits a byte/string stream into lines, calling `onLine` for each. Partial
 * lines are buffered across chunks and a non-empty trailing fragment is flushed
 * when the stream ends.
 */
async function splitLines(
  stream: AsyncIterable<unknown>,
  onLine: (line: string) => void
): Promise<void> {
  let buffer = "";

  for await (const chunk of stream) {
    buffer += String(chunk);

    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);

      if (line) onLine(line);
    }
  }

  const tail = buffer.replace(/\r$/, "");
  if (tail) onLine(tail);
}
