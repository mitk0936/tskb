import { relative } from "node:path";
import { producerOfRef } from "../action/action.ts";
import type { ActionInstance, AnyActionInstance, Nod } from "../action/types.ts";
import { LogsCollector, ScopedLogger } from "../../output/log/LogsCollector.ts";
import { LogRenderer } from "../../output/log/LogRenderer.ts";
import { Output } from "../../output/Output.ts";
import type { ActionFailure, SpinResult, SpinState } from "./types.ts";

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
 * A live spin over its own append-only log: constructing one launches the given
 * actions in parallel under a single abort controller and drives them to a terminal
 * {@link SpinResult}. Stop it with `.cancel()`, `await` its `.done` for the verdict.
 *
 * **A spin owns its world.** Each construction creates its *own* {@link LogsCollector}
 * and {@link Output} — the run's log, folder, and snapshots — rather than sharing a
 * process global, so runs don't bleed into each other and a fresh run can be created
 * in a living process (sequential re-runs, in-process tests). Attach further actions
 * to a running spin — including event-driven ones — via its `.run(…)` method.
 *
 * Each action runs against its own child logger (which headers and indents its
 * lines into this run's log) and the spin's shared abort signal — both injected
 * into its context, where the framework also binds a `proc` and the run's `output`
 * so child processes stream into the right log and die on teardown. A **failing
 * action never tears the spin down** — its `{ ok: false }` outcome is recorded in
 * the verdict (and sets exit code 1) and the spin keeps running. Teardown to
 * `closed` happens only on Ctrl-C, `.cancel()`, natural completion, or an uncaught
 * fatal. The process-level hooks (SIGINT/uncaught handlers, `exitCode`) are owned by
 * the run and cleaned at finalize, so they don't outlive it.
 */
export class SpinHost {
  /** This run's append-only log — its own store, not a process global. */
  readonly logs = new LogsCollector();

  /** This run's output subsystem (folder + snapshots + run-log writer), wired to {@link logs}. */
  readonly output = new Output(this.logs);

  /** The spin's abort signal — for consumers that want to observe teardown. */
  readonly signal: AbortSignal;

  /** Settles once the spin reaches `closed`, carrying the terminal verdict. Never rejects. */
  readonly done: Promise<SpinResult>;

  private readonly controller = new AbortController();

  // ── Lifecycle state ──────────────────────────────────────────────────────
  // The single source of truth for "where in its life is this run". Only
  // `beginClosing` and the finalize step below mutate it, and only forward.
  // The log stays open through teardown and is closed once at finalize (after the
  // last entry), so `streamLog` captures the whole run — including lines logged
  // *during* teardown — and its run.jsonl is complete before `writeLog` reads it.
  private phase: SpinState = "open";

  /** The current lifecycle state — see {@link SpinState}. */
  get state(): SpinState {
    return this.phase;
  }

  // Genuine failures (not teardown cascade). Frozen into the verdict at close.
  private readonly failures: ActionFailure[] = [];

  // Every launched action's promise lives here until it settles; the drive loop
  // empties this set. Daemons keep it non-empty until the controller aborts.
  private readonly inFlight = new Set<Promise<unknown>>();

  // Instances launched so far — used to verify a `.ref` dependency was launched
  // before the action that consumes its handle.
  private readonly launched = new WeakSet<AnyActionInstance>();

  // The incremental crash-insurance stream; awaited at finalize before writeLog.
  private readonly streaming: Promise<void>;

  // Ctrl-C tears the spin down gracefully through the lifecycle, like cancel().
  private readonly onSigint = (): void => this.beginClosing("interrupted (SIGINT)");

  private readonly onUncaught = this.onFatal("uncaughtException");

  private readonly onUnhandled = this.onFatal("unhandledRejection");

  constructor(...actions: AnyActionInstance[]) {
    // Validate eagerly so a bad argument throws cleanly before any work begins.
    for (const instance of actions) assertInstance(instance);

    this.signal = this.controller.signal;

    process.once("SIGINT", this.onSigint);
    process.on("uncaughtException", this.onUncaught);
    process.on("unhandledRejection", this.onUnhandled);

    this.narrate(`run started · ${scriptPath()}`);

    // Start streaming log entries to disk immediately — incremental writes survive
    // hard kills where the final writeLog never runs. Kept so finalize can await it
    // *before* writeLog rewrites the same files: otherwise a late flush from this
    // stream lands past writeLog's truncation and the OS zero-fills the gap (a
    // multi-MB NUL run in run.log).
    this.streaming = this.output.runLog.stream(this.logs).catch(() => {});

    // Live-render the log to the console for the whole run (replay + live). Always
    // on — the run's terminal output, no flag or call required.
    this.drain();

    for (const instance of actions) this.launch(instance, undefined);

    // Launch before driving: the drive loop breaks on an empty `inFlight`, so it
    // must not start until the initial actions have populated it.
    this.done = this.drive();
    // `done` resolves with the verdict and never rejects; guard anyway so a stray
    // finalize error can't surface as an unhandled rejection.
    this.done.catch(() => {});
  }

  /**
   * Launch more actions into this same spin — same controller, same log. Chainable.
   *
   * Throws if the spin is no longer `open`.
   */
  run(...more: AnyActionInstance[]): this {
    for (const instance of more) this.nodInto(instance, undefined);
    return this;
  }

  /**
   * Launch `instance` into the spin under an optional `parentPath` (the nodding
   * action's path, or `undefined` for a top-level nod). The single guarded entry to
   * launching — `run` (top-level) and an action's own scoped `nod` both route here,
   * so the "spin is open" check lives in one place.
   */
  private nodInto(instance: AnyActionInstance, parentPath: string | undefined): void {
    if (this.phase !== "open") {
      throw new Error(
        `spin.run(…) rejected: the spin is "${this.phase}", not "open". Launch actions before ` +
          `teardown, or from a lifecycle event of an action that is still running.`
      );
    }
    this.launch(instance, parentPath);
  }

  /** Begin teardown: abort the signal (killing procs, unblocking waits, stopping daemons). */
  cancel(): void {
    this.beginClosing("cancelled");
  }

  /**
   * Live-render the log to the console. Started automatically from the constructor
   * — every spin drains, with no flag to disable and nothing for the caller to
   * invoke (for now). A single {@link LogRenderer} applies grouping/indentation as
   * entries stream by; its state spans the replayed history and live entries as one
   * continuous stream. The subscription ends itself when the run tears down (the
   * collector closes it), so this loop simply runs to completion.
   */
  private drain(): void {
    void (async () => {
      const renderer = new LogRenderer();
      for await (const entry of this.logs.subscribe({ replay: true }))
        console.log(renderer.render(entry));
    })().catch(() => {});
  }

  /** Narrate a run-lifecycle milestone into this run's log (renders as a `[run]` line). */
  private narrate(message: string): void {
    this.logs.append({ source: "run", level: "run", message });
  }

  /**
   * Move `open → closing`: abort the signal (unwinding procs, waits, and
   * daemons), narrate the cause once, and stop accepting new actions. Idempotent
   * — only the first caller transitions; later triggers (a second failure, a
   * `cancel()` during teardown) are no-ops. This is the *only* path to abort, so
   * every teardown reason flows through one place.
   */
  private beginClosing(reason: string): void {
    if (this.phase !== "open") return;
    this.phase = "closing";
    this.narrate(`tearing down · ${reason}`);
    this.controller.abort();
  }

  /**
   * Record a genuine fault in the verdict. It does **not** tear the spin down — a
   * failing action is data, and the spin keeps running (only Ctrl-C / cancel /
   * completion / an uncaught fatal close it).
   */
  private recordFailure(action: string, error: unknown): void {
    this.failures.push({ action, error });
  }

  /**
   * A throw or rejection that escaped every action's own handling. Without a
   * handler Node prints it and exits *immediately* — before the run can flush its
   * log, which leaves a silent, empty log directory and no verdict. So catch it,
   * log it, fold it into the verdict, and drive teardown so the log still flushes
   * and the exit code reflects the fault — degrading a stray throw to a recorded
   * failure instead of a hard crash. Removed at finalize, so it only governs
   * while this run owns the process.
   */
  private onFatal(kind: "uncaughtException" | "unhandledRejection"): (error: unknown) => void {
    return (error: unknown): void => {
      this.logs.append({
        source: kind,
        level: "error",
        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      // Genuine fault vs. teardown fallout: only one that surfaces *before* the
      // signal aborts is the spin's own (mirrors `launch`'s cascade rule); a throw
      // during unwind is logged but doesn't pollute the verdict. Either way tear
      // down — unlike an action's own failure, an *uncaught* fatal leaves the
      // process state undefined, so we always finish and flush.
      if (!this.controller.signal.aborted) this.failures.push({ action: kind, error });
      this.beginClosing(kind);
    };
  }

  private launch(instance: AnyActionInstance, parentPath: string | undefined): void {
    // A consumer built with another action's `.ref` (e.g. `chromePage(driver.ref)`)
    // must be launched *after* that producer — otherwise it awaits a handle that
    // never arrives and the spin hangs silently. Catch it and say how to fix it.
    for (const arg of instance.args) {
      const producer = producerOfRef(arg);
      if (producer && !this.launched.has(producer)) {
        throw new Error(
          `${instance.name} was launched before its dependency ${producer.name}: it ` +
            `consumes ${producer.name}'s .ref, so nod ${producer.name} first.`
        );
      }
    }
    this.launched.add(instance);

    // The action's path: its name for a top-level nod, or `<parent> › <name>` when a
    // parent action nodded it. Top-level actions keep this run's logger (output
    // unchanged); a child gets a ScopedLogger so its every line — and its `proc`'s,
    // and any grandchildren's — is prefixed with this path. Its own `nod` carries
    // this path down, so scoping composes automatically.
    const path = parentPath ? `${parentPath} › ${instance.name}` : instance.name;
    const scoped = parentPath === undefined ? this.logs : new ScopedLogger(this.logs, path);
    const nod: Nod = (child) => {
      this.nodInto(child, path);
      return child;
    };

    this.narrate(`launch ${path}`);
    // The action logs into this run's shared store (entries carry their `source`;
    // grouping is applied at render time) and gets the spin's signal directly; the
    // framework injects a `proc` and the run's `output` bound to both, so there's no
    // ambient context. `start()` resolves with the action's Outcome — it never
    // rejects for the action's own failure — so a failure is handled here as data.
    const record = (error: unknown): void => {
      // Always record the fault in the action's own log, under its path.
      this.logs.append({
        source: path,
        level: "error",
        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      // Genuine failure vs. teardown fallout: if the signal was already aborted
      // when this surfaced, the failure is almost certainly the abort killing the
      // action (a cascade), not its own fault — so it must not pollute the verdict.
      if (!this.controller.signal.aborted) this.recordFailure(path, error);
    };
    const promise = instance
      .start({ logs: scoped, signal: this.controller.signal, nod, output: this.output })
      .then((outcome) => {
        if (!outcome.ok) record(outcome.error);
      })
      // Defensive: `start()` shouldn't reject, but if the framework itself throws,
      // treat it as a fault rather than losing it to an unhandled rejection.
      .catch(record);
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
  }

  /**
   * Drives the run to `closed`. The loop re-checks `inFlight` because actions can
   * be added (or daemons can settle on abort) while we await. A synchronous
   * `.run(…)` from a settling action's lifecycle event lands before that action's
   * `finally` removes it, so `inFlight` never spuriously hits 0 mid-handoff.
   */
  private async drive(): Promise<SpinResult> {
    for (;;) {
      if (this.inFlight.size === 0) {
        // Nothing left to run. If still open, every action finished on its own —
        // natural completion; tear down so daemons/listeners unwind uniformly.
        // If already closing, teardown is simply complete.
        if (this.phase === "open") this.beginClosing("completed");
        break;
      }
      await Promise.allSettled([...this.inFlight]);
    }

    // ── Finalize (reached exactly once) ──────────────────────────────────────
    this.phase = "closed";
    process.off("SIGINT", this.onSigint);
    process.off("uncaughtException", this.onUncaught);
    process.off("unhandledRejection", this.onUnhandled);
    this.narrate("finished");
    // Close the log now (after the last entry) so `streamLog` drains and finishes
    // writing the complete run.jsonl, then wait for it to fully close its files —
    // both so its last flush can't corrupt run.log later, and so run.jsonl is done
    // before `writeLog` streams it into the final collapsed run.log.
    this.logs.close();
    await this.streaming;
    const file = await this.output.runLog.write();
    // Direct to the terminal — the file's already written, so this line isn't in it.
    console.log(LogRenderer.marker("run", `log → ${file}`));

    const result: SpinResult = { ok: this.failures.length === 0, failures: this.failures };
    // One process = one run = one verdict; reflect pass/fail in the exit code so
    // shells and CI see it without parsing the log. Only set it on failure, so a
    // code a failing action's own handler may have set isn't clobbered to 0.
    if (!result.ok) process.exitCode = 1;
    return result;
  }
}
