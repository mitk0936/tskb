import { relative } from "node:path";
import type { ActionInstance } from "./action.ts";
import { log as logs } from "./log-collector/global.ts";
import { createRenderer } from "./log-collector/render.ts";
import { streamLog, writeLog } from "./output.ts";
import { marker } from "./markers.ts";

/**
 * A single action's failure, captured for the run's verdict. Cascade failures —
 * actions that reject only because teardown killed them — are deliberately
 * excluded (see `launch`'s catch), so this records genuine faults, not fallout.
 */
export interface ActionFailure {
  /** The failing action's name. */
  readonly action: string;
  /** Whatever it threw or rejected with. */
  readonly error: unknown;
}

/**
 * The terminal verdict of a run: did everything that mattered succeed, and if
 * not, what failed. {@link Run.done} resolves (never rejects) with this, so a
 * single `await` yields the outcome instead of forcing a try/catch on awaiters.
 */
export interface RunResult {
  /** True when no genuine failure was recorded. */
  readonly ok: boolean;
  /** The genuine failures, in the order they surfaced. Empty when `ok`. */
  readonly failures: readonly ActionFailure[];
}

/**
 * The run's lifecycle. It only ever moves forward:
 *
 *   open ──▶ closing ──▶ closed
 *
 * - **open** — launching and running actions; `.run(…)` is accepted.
 * - **closing** — teardown has begun (cancel, first failure, Ctrl-C, or natural
 *   completion). The signal is aborted, in-flight actions are unwinding, and new
 *   `.run(…)` is refused.
 * - **closed** — everything has settled, the log is flushed, the verdict is final.
 */
export type RunState = "open" | "closing" | "closed";

/** Tunes a run's failure policy. */
export interface RunOptions {
  /**
   * Abort the whole run the moment the first genuine failure surfaces
   * (default `true`). Set `false` to let every action finish and collect all
   * failures into the verdict — useful when you want the complete picture of
   * what broke rather than just the first cause.
   */
  readonly failFast?: boolean;
}

/** A live run: a set of actions sharing one abort controller and the global log. */
export interface Run {
  /** The shared global log (output + events for everything in this run). */
  readonly logs: typeof logs;
  /** The current lifecycle state — see {@link RunState}. */
  readonly state: RunState;
  /** Settles once the run reaches `closed`, carrying the terminal {@link RunResult}. */
  readonly done: Promise<RunResult>;
  /** The run's abort signal — for consumers that want to observe teardown. */
  readonly signal: AbortSignal;
  /**
   * Launch more actions into this same run — same controller, same log. Chainable.
   *
   * Throws if the run is no longer `open`: launching into a closing/closed run
   * would bind the actions to an already-aborted signal, so they'd start and
   * immediately unwind, silently doing nothing. Launch before teardown, or from
   * a lifecycle event of an action that is still running (those fire while the
   * run is still `open`).
   */
  run(...actions: ActionInstance[]): Run;
  /** Begin teardown: abort the signal (killing procs, unblocking waits, stopping daemons). */
  cancel(): void;
  /**
   * Start streaming the global log live to a writer (console by default) in the
   * background; it stops on its own when the run settles. Returns the run, so it
   * chains. Await `.done` for the verdict.
   */
  drain(write?: (message: string) => void): Run;
}

/** One run per process — a single world over the one global log. See {@link run}. */
let started = false;

/** Narrate a run-lifecycle milestone into the global log (renders as a `[run]` line). */
const narrate = (message: string): void => logs.append({ source: "run", level: "run", message });

/** The entry script, relative to where node was invoked (so the log says what produced it). */
const scriptPath = (): string => {
  const entry = process.argv[1];
  return entry ? relative(process.cwd(), entry) : "(unknown)";
};

/** A constructed instance is an object carrying a `start` function. */
const isActionInstance = (value: unknown): value is ActionInstance =>
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
function assertInstance(value: unknown): asserts value is ActionInstance {
  if (isActionInstance(value)) return;
  const hint = isUncalledAction(value)
    ? ` — that looks like an action that wasn't invoked; construct an instance by calling it: action("…").run(…)()`
    : "";
  throw new Error(`run() expects action instances; received ${typeof value}${hint}`);
}

/**
 * Starts the run: launches the given actions in parallel under one abort
 * controller, against the process-wide global log. Returns a {@link Run} — add
 * more actions on demand with `.run(…)`, observe `.done` for the verdict, stop
 * with `.cancel()`. An optional leading {@link RunOptions} tunes failure policy.
 *
 * **Callable once per process.** A run *is* the world being modelled, and there's
 * one global log per world; a second `run(…)` would silently share that log, so
 * it throws instead. Attach further actions — including event-driven ones — to
 * the returned {@link Run} via its `.run(…)` method, not by calling this again.
 *
 * Each action runs against its own child logger (which headers and indents its
 * lines into the global log) and the run's shared abort signal — both injected
 * into its context, where the framework also binds a `proc` to them so child
 * processes stream into the right log and die on teardown. On Ctrl-C, `.cancel()`,
 * the first failure (under fail-fast), or natural completion, the run transitions
 * through {@link RunState} to `closed`.
 */
export function run(...actions: ActionInstance[]): Run;
export function run(options: RunOptions, ...actions: ActionInstance[]): Run;
export function run(...args: ActionInstance[] | [RunOptions, ...ActionInstance[]]): Run {
  if (started) {
    throw new Error(
      "run() may only be called once per process — attach more actions to the existing run with its .run(…) method."
    );
  }

  // Peel an optional leading options bag off the variadic actions, keeping the
  // bare `run(...actions)` call form working unchanged. Options are a plain
  // object (no `.start`); a *function* first arg is never options — it's an
  // uncalled action, which `assertInstance` below reports clearly.
  const first: unknown = args[0];
  const hasOptions = first !== undefined && !isActionInstance(first) && typeof first !== "function";
  const options: RunOptions = hasOptions ? (first as RunOptions) : {};
  const actions = (hasOptions ? args.slice(1) : args) as ActionInstance[];
  const failFast = options.failFast ?? true;

  // Validate eagerly, before the one-run latch flips, so a bad argument throws
  // cleanly and leaves the process's single run slot still usable.
  for (const instance of actions) assertInstance(instance);
  started = true;

  const controller = new AbortController();
  // The log closes when the run tears down, so every `logs.subscribe(…)` ends on
  // its own — no subscriber has to watch the signal.
  logs.endOn(controller.signal);

  // ── Lifecycle state ──────────────────────────────────────────────────────
  // The single source of truth for "where in its life is this run". Only
  // `beginClosing` and the finalize step below mutate it, and only forward.
  let state: RunState = "open";
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

  /** Record a genuine fault and, under fail-fast, kick off teardown. */
  const recordFailure = (action: string, error: unknown): void => {
    failures.push({ action, error });
    if (failFast) beginClosing(`failed: ${action}`);
  };

  // Ctrl-C tears the run down gracefully through the lifecycle, like cancel().
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
      // signal aborts is the run's own (mirrors `launch`'s cascade rule); a throw
      // during unwind is logged but doesn't pollute the verdict. Either way tear
      // down — an uncaught fault leaves the process state undefined, so we always
      // finish and flush, even under `failFast: false`.
      if (!controller.signal.aborted) failures.push({ action: kind, error });
      beginClosing(kind);
    };
  const onUncaught = onFatal("uncaughtException");
  const onUnhandled = onFatal("unhandledRejection");
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUnhandled);

  narrate(`run started · ${scriptPath()}`);

  // Start streaming log entries to disk immediately — incremental writes survive
  // hard kills where the final writeLog never runs.
  void streamLog(logs).catch(() => {});

  const launch = (instance: ActionInstance): void => {
    narrate(`launch ${instance.name}`);
    // The action logs into the one shared store (entries carry their `source`;
    // grouping is applied at render time) and gets the run's signal directly; the
    // framework injects a `proc` bound to both, so there's no ambient context.
    const promise = instance.start({ logs, signal: controller.signal }).catch((error: unknown) => {
      // Always record the fault in the action's own log, under its name.
      logs.append({
        source: instance.name,
        level: "error",
        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      // Genuine failure vs. teardown fallout: if the signal was already aborted
      // when this surfaced, the rejection is almost certainly the abort killing
      // the action (a cascade), not its own fault — so it must not pollute the
      // verdict. The *first* real error is caught here before `recordFailure`
      // triggers the abort, so `signal.aborted` is still false for it.
      if (!controller.signal.aborted) recordFailure(instance.name, error);
    });
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
  };

  for (const instance of actions) launch(instance);

  // Drives the run to `closed`. The loop re-checks `inFlight` because actions can
  // be added (or daemons can settle on abort) while we await. A synchronous
  // `.run(…)` from a settling action's lifecycle event lands before that action's
  // `finally` removes it, so `inFlight` never spuriously hits 0 mid-handoff.
  const done: Promise<RunResult> = (async (): Promise<RunResult> => {
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
    const file = await writeLog(logs);
    // Direct to the terminal — the file's already written, so this line isn't in it.
    console.log(marker("run", `log → ${file}`));

    const result: RunResult = { ok: failures.length === 0, failures };
    // One process = one run = one verdict; reflect pass/fail in the exit code so
    // shells and CI see it without parsing the log. Only set it on failure, so a
    // code a failing action's own handler may have set isn't clobbered to 0.
    if (!result.ok) process.exitCode = 1;
    return result;
  })();
  // `done` resolves with the verdict and never rejects; guard anyway so a stray
  // finalize error can't surface as an unhandled rejection.
  done.catch(() => {});

  const drain = (write: (message: string) => void = (message) => console.log(message)): Run => {
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

  const self: Run = {
    logs,
    get state() {
      return state;
    },
    done,
    signal: controller.signal,
    run(...more) {
      if (state !== "open") {
        throw new Error(
          `run.run(…) rejected: the run is "${state}", not "open". Launch actions before ` +
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
