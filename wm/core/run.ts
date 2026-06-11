import { relative } from "node:path";
import type { ActionInstance } from "./action.ts";
import { withAbort } from "./abort.ts";
import { log as logs } from "./logs/global.ts";
import { withLogs } from "./logs/context.ts";
import { writeLog } from "./output.ts";
import { marker } from "./markers.ts";

/** Narrate a run-lifecycle milestone into the global log (a `[run]` line). */
const narrate = (message: string): void =>
  logs.append({ source: "run", level: "run", message: marker("run", message) });

/** The entry script, relative to where node was invoked (so the log says what produced it). */
const scriptPath = (): string => {
  const entry = process.argv[1];
  return entry ? relative(process.cwd(), entry) : "(unknown)";
};

/** A live run: a set of actions sharing one abort controller and the global log. */
export interface Run {
  /** The shared global log (output + events for everything in this run). */
  readonly logs: typeof logs;
  /** Settles once all launched actions have settled (after teardown for daemons). */
  readonly done: Promise<void>;
  /** The run's abort signal — for consumers that want to observe teardown. */
  readonly signal: AbortSignal;
  /** Launch more actions into this same run — same controller, same log. Chainable. */
  run(...actions: ActionInstance[]): Run;
  /** Cancel everything: aborts the run (kills procs, unblocks waits, stops daemons). */
  cancel(): void;
  /**
   * Start streaming the global log live to a writer (console by default) in the
   * background; it stops on its own when the run settles. Returns the run, so it
   * chains. Await `.done` for completion.
   */
  drain(write?: (message: string) => void): Run;
}

/** One run per process — a single world over the one global log. See {@link run}. */
let started = false;

/**
 * Starts the run: launches the given actions in parallel under one abort
 * controller, against the process-wide global log. Returns a {@link Run} — add
 * more actions on demand with `.run(…)`, observe `.done`, stop with `.cancel()`.
 *
 * **Callable once per process.** A run *is* the world being modelled, and there's
 * one global log per world; a second `run(…)` would silently share that log, so
 * it throws instead. Attach further actions — including event-driven ones — to
 * the returned {@link Run} via its `.run(…)` method, not by calling this again.
 *
 * Each action runs against its own child logger (which headers and indents its
 * lines into the global log) and with the controller's signal made ambient, so
 * `proc` and other internals hook teardown to it without it being threaded
 * through. On Ctrl-C or `.cancel()` the controller aborts and everything unwinds.
 */
export const run = (...actions: ActionInstance[]): Run => {
  if (started) {
    throw new Error(
      "run() may only be called once per process — attach more actions to the existing run with its .run(…) method."
    );
  }
  started = true;

  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once("SIGINT", onSigint);

  narrate(`run started · ${scriptPath()}`);
  // Narrate teardown once, whatever triggers it (cancel / Ctrl-C / completion).
  controller.signal.addEventListener("abort", () => narrate("tearing down"), { once: true });

  // Every launched action's promise lives here until it settles; `done` drains
  // this set. Daemons keep it non-empty until the controller aborts.
  const inFlight = new Set<Promise<unknown>>();

  const launch = (instance: ActionInstance): void => {
    narrate(`launch ${instance.name}`);
    const log = logs.child();
    // withAbort wraps each launch (not the batch) so on-demand actions added
    // later still get the ambient signal. Failures are recorded into the
    // action's logger, then swallowed — `done` shouldn't reject on one action.
    const promise = withAbort(controller.signal, () =>
      withLogs(log, () => instance.start({ logs: log, signal: controller.signal }))
    ).catch((error: unknown) => {
      log.append({
        source: instance.name,
        level: "error",
        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
    });
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
  };

  for (const instance of actions) launch(instance);

  // `done`: settle once nothing is in flight. The loop re-checks because actions
  // can be added (or daemons can settle on abort) while we're awaiting. When the
  // set empties and stays empty, we tear down once and drain the log to a file.
  const done = (async () => {
    try {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    } finally {
      process.off("SIGINT", onSigint);
      controller.abort();
      narrate("finished");
      const file = await writeLog(logs);
      // Direct to the terminal — the file's already written, so this can't be in it.
      console.log(marker("run", `log → ${file}`));
    }
  })();
  done.catch(() => {});

  const drain = (write: (message: string) => void = (message) => console.log(message)): Run => {
    void (async () => {
      const iterator = logs.subscribe({ replay: true })[Symbol.asyncIterator]();
      const ended = done.then(() => "ended" as const).catch(() => "ended" as const);
      // Race each entry against run completion. While entries are buffered,
      // next() (first in the array) wins and flushes them; once the queue is
      // empty and the run is done, `ended` wins and we stop.
      for (;;) {
        const result = await Promise.race([iterator.next(), ended]);
        if (result === "ended" || result.done) break;
        write(result.value.message);
      }
      await iterator.return?.(); // unsubscribe
    })().catch(() => {});
    return self;
  };

  const self: Run = {
    logs,
    done,
    signal: controller.signal,
    run(...more) {
      for (const instance of more) launch(instance);
      return self;
    },
    cancel: () => controller.abort(),
    drain,
  };
  return self;
};
