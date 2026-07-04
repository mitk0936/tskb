import { relative } from "node:path";
import { producerOfRef, type ActionInstance, type AnyActionInstance } from "./action.ts";
import { log as logs } from "./log-collector/global.ts";
import { createRenderer } from "./log-collector/render.ts";
import { streamLog, writeLog } from "./output.ts";
import { marker } from "./markers.ts";

/**
 * A single action's failure, captured for the spin's verdict. Cascade failures —
 * actions that settled `{ ok: false }` only because teardown aborted them — are
 * deliberately excluded (see `launch`'s outcome handling), so this records
 * genuine faults, not fallout.
 */
export interface ActionFailure {
  /** The failing action's name. */
  readonly action: string;
  /** Whatever it failed with (the Outcome's `error`). */
  readonly error: unknown;
}

/**
 * The terminal verdict of a spin: did everything that mattered succeed, and if
 * not, what failed. {@link Spin.done} resolves (never rejects) with this, so a
 * single `await` yields the outcome instead of forcing a try/catch on awaiters.
 * A failing action is *recorded* here (so `ok` is false and the exit code is 1)
 * but does **not** tear the spin down — see {@link Spin}.
 */
export interface SpinResult {
  /** True when no genuine failure was recorded. */
  readonly ok: boolean;
  /** The genuine failures, in the order they surfaced. Empty when `ok`. */
  readonly failures: readonly ActionFailure[];
}

/**
 * The spin's lifecycle. It only ever moves forward:
 *
 *   open ──▶ closing ──▶ closed
 *
 * - **open** — launching and running actions; `.run(…)` is accepted.
 * - **closing** — teardown has begun (cancel, Ctrl-C, natural completion, or an
 *   uncaught fatal). The signal is aborted, in-flight actions are unwinding, and
 *   new `.run(…)` is refused. Note: a failing *action* does not begin teardown.
 * - **closed** — everything has settled, the log is flushed, the verdict is final.
 */
export type SpinState = "open" | "closing" | "closed";

/** A live spin: a set of actions sharing one abort controller and the global log. */
export interface Spin {
  /** The shared global log (output + events for everything in this spin). */
  readonly logs: typeof logs;
  /** The current lifecycle state — see {@link SpinState}. */
  readonly state: SpinState;
  /** Settles once the spin reaches `closed`, carrying the terminal {@link SpinResult}. */
  readonly done: Promise<SpinResult>;
  /** The spin's abort signal — for consumers that want to observe teardown. */
  readonly signal: AbortSignal;
  /**
   * Launch more actions into this same spin — same controller, same log. Chainable.
   *
   * Throws if the spin is no longer `open`: launching into a closing/closed spin
   * would bind the actions to an already-aborted signal, so they'd start and
   * immediately unwind, silently doing nothing. Launch before teardown, or from
   * a lifecycle event of an action that is still running (those fire while the
   * spin is still `open`).
   */
  run(...actions: AnyActionInstance[]): Spin;
  /** Begin teardown: abort the signal (killing procs, unblocking waits, stopping daemons). */
  cancel(): void;
  /**
   * Start streaming the global log live to a writer (console by default) in the
   * background; it stops on its own when the spin settles. Returns the spin, so it
   * chains. Await `.done` for the verdict.
   */
  drain(write?: (message: string) => void): Spin;
}

/** One spin per process — a single world over the one global log. See {@link run}. */
let started = false;

/** Narrate a run-lifecycle milestone into the global log (renders as a `[run]` line). */
const narrate = (message: string): void => logs.append({ source: "run", level: "run", message });

/** The entry script, relative to where node was invoked (so the log says what produced it). */
const scriptPath = (): string => {
  const entry = process.argv[1];
  return entry ? relative(process.cwd(), entry) : "(unknown)";
};

/** A constructed instance is an object carrying a `start` function. */
const isActionInstance = (value: unknown): value is AnyActionInstance =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ActionInstance).start === "function";

/** An *uncalled* action: the callable `action(name).run(…)` returns before it's invoked. */
const isUncalledAction = (value: unknown): boolean =>
  typeof value === "function" && typeof (value as { actionName?: unknown }).actionName === "string";

/**
 * Guard each launch argument: an action *instance* is required, not the action
 * itself. Forgetting the trailing `()` is an easy slip (the callable has no
 * `.start`), and silently treating it as something else would report a false
 * green — so fail loudly with the fix.
 */
function assertInstance(value: unknown): asserts value is AnyActionInstance {
  if (isActionInstance(value)) return;
  const hint = isUncalledAction(value)
    ? ` — that looks like an action that wasn't invoked; construct an instance by calling it: action("…").run(…)()`
    : "";
  throw new Error(`run() expects action instances; received ${typeof value}${hint}`);
}

/**
 * Starts the spin: launches the given actions in parallel under one abort
 * controller, against the process-wide global log. Returns a {@link Spin} — add
 * more actions on demand with `.run(…)`, observe `.done` for the verdict, stop
 * with `.cancel()`.
 *
 * **Callable once per process.** A spin *is* the world being modelled, and there's
 * one global log per world; a second call would silently share that log, so it
 * throws instead. Attach further actions — including event-driven ones — to the
 * returned {@link Spin} via its `.run(…)` method, not by calling this again.
 *
 * Each action runs against its own child logger (which headers and indents its
 * lines into the global log) and the spin's shared abort signal — both injected
 * into its context, where the framework also binds a `proc` to them so child
 * processes stream into the right log and die on teardown. A **failing action
 * never tears the spin down** — its `{ ok: false }` outcome is recorded in the
 * verdict (and sets exit code 1) and the spin keeps running. Teardown to `closed`
 * happens only on Ctrl-C, `.cancel()`, natural completion, or an uncaught fatal.
 */
export function run(...actions: AnyActionInstance[]): Spin {
  if (started) {
    throw new Error(
      "run() may only be called once per process — attach more actions to the existing run with its .run(…) method."
    );
  }

  // Validate eagerly, before the one-run latch flips, so a bad argument throws
  // cleanly and leaves the process's single run slot still usable.
  for (const instance of actions) assertInstance(instance);
  started = true;

  const controller = new AbortController();
  // The log stays open through teardown and is closed once at finalize (after the
  // last entry), so `streamLog` captures the whole run — including lines logged
  // *during* teardown — and its run.jsonl is complete before `writeLog` reads it.

  // ── Lifecycle state ──────────────────────────────────────────────────────
  // The single source of truth for "where in its life is this run". Only
  // `beginClosing` and the finalize step below mutate it, and only forward.
  let state: SpinState = "open";
  // Genuine failures (not teardown cascade). Frozen into the verdict at close.
  const failures: ActionFailure[] = [];
  // Every launched action's promise lives here until it settles; the drain loop
  // empties this set. Daemons keep it non-empty until the controller aborts.
  const inFlight = new Set<Promise<unknown>>();

  /**
   * Move `open → closing`: abort the signal (unwinding procs, waits, and
   * daemons), narrate the cause once, and stop accepting new actions. Idempotent
   * — only the first caller transitions; later triggers (a second failure, a
   * `cancel()` during teardown) are no-ops. This is the *only* path to abort, so
   * every teardown reason flows through one place.
   */
  const beginClosing = (reason: string): void => {
    if (state !== "open") return;
    state = "closing";
    narrate(`tearing down · ${reason}`);
    controller.abort();
  };

  /**
   * Record a genuine fault in the verdict. It does **not** tear the spin down — a
   * failing action is data, and the spin keeps running (only Ctrl-C / cancel /
   * completion / an uncaught fatal close it).
   */
  const recordFailure = (action: string, error: unknown): void => {
    failures.push({ action, error });
  };

  // Ctrl-C tears the spin down gracefully through the lifecycle, like cancel().
  const onSigint = (): void => beginClosing("interrupted (SIGINT)");
  process.once("SIGINT", onSigint);

  // A throw or rejection that escaped every action's own handling. Without a
  // handler Node prints it and exits *immediately* — before the run can flush its
  // log, which leaves a silent, empty log directory and no verdict. So catch it,
  // log it, fold it into the verdict, and drive teardown so the log still flushes
  // and the exit code reflects the fault — degrading a stray throw to a recorded
  // failure instead of a hard crash. Removed at finalize, so it only governs
  // while this run owns the process.
  const onFatal =
    (kind: "uncaughtException" | "unhandledRejection") =>
    (error: unknown): void => {
      logs.append({
        source: kind,
        level: "error",
        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      // Genuine fault vs. teardown fallout: only one that surfaces *before* the
      // signal aborts is the spin's own (mirrors `launch`'s cascade rule); a throw
      // during unwind is logged but doesn't pollute the verdict. Either way tear
      // down — unlike an action's own failure, an *uncaught* fatal leaves the
      // process state undefined, so we always finish and flush.
      if (!controller.signal.aborted) failures.push({ action: kind, error });
      beginClosing(kind);
    };
  const onUncaught = onFatal("uncaughtException");
  const onUnhandled = onFatal("unhandledRejection");
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUnhandled);

  narrate(`run started · ${scriptPath()}`);

  // Start streaming log entries to disk immediately — incremental writes survive
  // hard kills where the final writeLog never runs. Kept so finalize can await it
  // *before* writeLog rewrites the same files: otherwise a late flush from this
  // stream lands past writeLog's truncation and the OS zero-fills the gap (a
  // multi-MB NUL run in run.log).
  const streaming = streamLog(logs).catch(() => {});

  // Instances launched so far — used to verify a `.ref` dependency was launched
  // before the action that consumes its handle.
  const launched = new WeakSet<AnyActionInstance>();

  const launch = (instance: AnyActionInstance): void => {
    // A consumer built with another action's `.ref` (e.g. `chromePage(driver.ref)`)
    // must be launched *after* that producer — otherwise it awaits a handle that
    // never arrives and the spin hangs silently. Catch it and say how to fix it.
    for (const arg of instance.args) {
      const producer = producerOfRef(arg);
      if (producer && !launched.has(producer)) {
        throw new Error(
          `${instance.name} was launched before its dependency ${producer.name}: it ` +
            `consumes ${producer.name}'s .ref, so nod ${producer.name} first.`
        );
      }
    }
    launched.add(instance);
    narrate(`launch ${instance.name}`);
    // The action logs into the one shared store (entries carry their `source`;
    // grouping is applied at render time) and gets the spin's signal directly; the
    // framework injects a `proc` bound to both, so there's no ambient context.
    // `start()` resolves with the action's Outcome — it never rejects for the
    // action's own failure — so a failure is handled here as data, not a throw.
    const record = (error: unknown): void => {
      // Always record the fault in the action's own log, under its name.
      logs.append({
        source: instance.name,
        level: "error",
        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      // Genuine failure vs. teardown fallout: if the signal was already aborted
      // when this surfaced, the failure is almost certainly the abort killing the
      // action (a cascade), not its own fault — so it must not pollute the verdict.
      if (!controller.signal.aborted) recordFailure(instance.name, error);
    };
    const promise = instance
      .start({ logs, signal: controller.signal })
      .then((outcome) => {
        if (!outcome.ok) record(outcome.error);
      })
      // Defensive: `start()` shouldn't reject, but if the framework itself throws,
      // treat it as a fault rather than losing it to an unhandled rejection.
      .catch(record);
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
  };

  for (const instance of actions) launch(instance);

  // Drives the run to `closed`. The loop re-checks `inFlight` because actions can
  // be added (or daemons can settle on abort) while we await. A synchronous
  // `.run(…)` from a settling action's lifecycle event lands before that action's
  // `finally` removes it, so `inFlight` never spuriously hits 0 mid-handoff.
  const done: Promise<SpinResult> = (async (): Promise<SpinResult> => {
    for (;;) {
      if (inFlight.size === 0) {
        // Nothing left to run. If still open, every action finished on its own —
        // natural completion; tear down so daemons/listeners unwind uniformly.
        // If already closing, teardown is simply complete.
        if (state === "open") beginClosing("completed");
        break;
      }
      await Promise.allSettled([...inFlight]);
    }

    // ── Finalize (reached exactly once) ──────────────────────────────────────
    state = "closed";
    process.off("SIGINT", onSigint);
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onUnhandled);
    narrate("finished");
    // Close the log now (after the last entry) so `streamLog` drains and finishes
    // writing the complete run.jsonl, then wait for it to fully close its files —
    // both so its last flush can't corrupt run.log later, and so run.jsonl is done
    // before `writeLog` streams it into the final collapsed run.log.
    logs.close();
    await streaming;
    const file = await writeLog();
    // Direct to the terminal — the file's already written, so this line isn't in it.
    console.log(marker("run", `log → ${file}`));

    const result: SpinResult = { ok: failures.length === 0, failures };
    // One process = one run = one verdict; reflect pass/fail in the exit code so
    // shells and CI see it without parsing the log. Only set it on failure, so a
    // code a failing action's own handler may have set isn't clobbered to 0.
    if (!result.ok) process.exitCode = 1;
    return result;
  })();
  // `done` resolves with the verdict and never rejects; guard anyway so a stray
  // finalize error can't surface as an unhandled rejection.
  done.catch(() => {});

  const drain = (write: (message: string) => void = (message) => console.log(message)): Spin => {
    void (async () => {
      // A renderer applies grouping/indentation as entries stream by; its state
      // spans the replayed history and live entries as one continuous stream. The
      // subscription ends itself when the run tears down (the collector closes it),
      // so this loop simply runs to completion.
      const render = createRenderer();
      for await (const entry of logs.subscribe({ replay: true })) write(render(entry));
    })().catch(() => {});
    return self;
  };

  const self: Spin = {
    logs,
    get state() {
      return state;
    },
    done,
    signal: controller.signal,
    run(...more) {
      if (state !== "open") {
        throw new Error(
          `spin.run(…) rejected: the spin is "${state}", not "open". Launch actions before ` +
            `teardown, or from a lifecycle event of an action that is still running.`
        );
      }
      for (const instance of more) launch(instance);
      return self;
    },
    cancel: () => beginClosing("cancelled"),
    drain,
  };
  return self;
}
