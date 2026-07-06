import { events, type Emitter, type EventHandler } from "../events/events.ts";
import { createProc } from "../../system/process/process.ts";
import { FolderCache } from "../../system/fs/FolderCache.ts";
import type {
  Action,
  ActionBuilder,
  ActionContext,
  ActionInstance,
  AnyActionInstance,
  Awaitable,
  InstanceEvents,
  NoEvents,
  Outcome,
  SystemGlobal,
} from "./types.ts";

/** A promise paired with its settlers, for a set-once value (the handle / the Outcome). */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

// Maps an instance's `.ref` promise back to the instance that produces it, so the
// run can catch a consumer launched before (or without) its `.ref` producer —
// which would otherwise await a handle that never arrives and hang silently.
const refOwners = new WeakMap<object, AnyActionInstance>();

/**
 * If `value` is some action instance's `.ref` promise, the instance that owns it
 * (the producer of that handle); otherwise `undefined`. Used by the run to verify
 * a `.ref` dependency was launched before the action that consumes it.
 */
export const producerOfRef = (value: unknown): AnyActionInstance | undefined =>
  typeof value === "object" && value !== null ? refOwners.get(value) : undefined;

/** The implementation the exec is given: `ctx` plus the captured args (types erased here). */
type Exec<Events extends object, Handle, Result> = (
  ctx: ActionContext<Events, Handle>,
  ...args: any[]
) => Awaitable<Result>;

/**
 * A constructed-but-not-yet-run action — everything a single launch needs, in one
 * object: its own event bus, its set-once handle (`ref`) and Outcome (`done`), and
 * the `start` that runs the impl and settles them. Self-contained: `start()`
 * resolves with the {@link Outcome} and **never rejects** (a failing action is
 * data, not a throw), so a launcher just awaits `.done`.
 */
class ActionRun<Result, Events extends object, Handle> implements ActionInstance<
  Result,
  Events,
  Handle
> {
  readonly name: string;

  readonly args: readonly unknown[];

  /** The attached handle, awaited via `.ref` (settled by `attach`, or by `start` on settle). */
  readonly ref: Promise<Handle>;

  /** The action's Outcome — resolves (never rejects) once it settles. */
  readonly done: Promise<Outcome<Result>>;

  private readonly exec: Exec<Events, Handle, Result>;

  // The bus covers declared + system events; `ctx.emit` is narrowed to the declared
  // ones, while the framework emits attached/done/error through the same bus.
  private readonly emitter: Emitter<InstanceEvents<Events, Result>>;

  private readonly handle: Deferred<Handle>;

  private readonly settled: Deferred<Outcome<Result>>;

  private attached = false;

  constructor(name: string, exec: Exec<Events, Handle, Result>, args: readonly unknown[]) {
    this.name = name;
    this.exec = exec;
    this.args = args;
    this.emitter = events<InstanceEvents<Events, Result>>(name);
    this.handle = ActionRun.defer<Handle>();
    this.settled = ActionRun.defer<Outcome<Result>>();
    this.ref = this.handle.promise;
    this.done = this.settled.promise;
    // Most actions have a `void` handle and no one awaits `ref`; mark the promise
    // handled so a settle-time rejection on such an instance doesn't surface as an
    // unhandled rejection. Real awaiters of `ref` still receive the rejection.
    void this.handle.promise.catch(() => {});
    // Register this instance as the producer of its `.ref`, so the run can catch a
    // consumer built with this `.ref` that gets launched before this instance.
    refOwners.set(this.ref, this as AnyActionInstance);
  }

  start(system: SystemGlobal): Promise<Outcome<Result>> {
    // `ctx.emit` is the declared-events view of the same bus.
    const emit = this.emitter.emit as Emitter<Events>["emit"];
    // The bus is pure pub/sub; logging each emit onto the timeline is layered here,
    // through this action's *scoped* logger — so an emit's line inherits the action's
    // path (`parent › child › event`) just like its other output, and the bus stays
    // free of any global. Registered once per run of this instance.
    this.emitter.onAny((key, payload) =>
      ActionRun.logEmit(system, this.name, String(key), payload)
    );
    // `Promise.resolve().then` normalizes a sync result and routes a sync throw to
    // the `error` path, so exec may be sync or async.
    return Promise.resolve()
      .then(() =>
        this.exec(
          {
            ...system,
            emit,
            attach: (value) => this.attach(value),
            proc: createProc(system.logs, system.signal, system.output.snapshots),
            artifactsFolder: system.output.folder.artifacts(),
            snapshot: (name, value) => system.output.snapshots.snapshot(name, value),
          },
          ...this.args
        )
      )
      .then(
        (result): Outcome<Result> => {
          const outcome = { ok: true as const, value: result };
          this.settled.resolve(outcome);
          this.systemEmit("done", outcome);
          // Settle `ref` if the action finished without attaching, so awaiters
          // resolve (with `undefined` for the default void handle) rather than
          // hang. Idempotent — a no-op when a handle was already attached.
          this.handle.resolve(undefined as Handle);
          return outcome;
        },
        (error: unknown): Outcome<Result> => {
          const exitCode = ActionRun.exitCodeOf(error);
          const outcome: Outcome<Result> =
            exitCode === undefined ? { ok: false, error } : { ok: false, error, exitCode };
          // Emit `error` (for `.on("error")` handlers), then settle `done` with the
          // Outcome — the canonical failure signal that `.done`/`once` read.
          this.systemEmit("error", error);
          this.settled.resolve(outcome);
          this.systemEmit("done", outcome);
          // The action failed, so its handle will never arrive — reject `ref` with
          // the same error instead of leaving awaiters hung. No-op if already attached.
          this.handle.reject(error);
          // Resolve (never rethrow): failure is the Outcome, not a rejection.
          return outcome;
        }
      );
  }

  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): void {
    this.emitter.listen(key, handler);
  }

  once<K extends keyof InstanceEvents<Events, Result>>(
    key: K
  ): Promise<InstanceEvents<Events, Result>[K] | undefined> {
    // `done` always fires with the Outcome and never "fails" the await, so it reads
    // straight from the settled promise; other keys race via awaitEvent (which
    // resolves `undefined` if the action settles before the event).
    return (
      key === "done" ? this.settled.promise : ActionRun.awaitEvent(this.emitter, key)
    ) as Promise<InstanceEvents<Events, Result>[K] | undefined>;
  }

  withCache(...paths: string[]): AnyActionInstance {
    // Validate + canonicalize eagerly here (at the call site), not lazily inside the
    // run — a relative path fails fast where it's written, and the resolved paths
    // give a stable cache key regardless of spelling.
    const targets = FolderCache.resolvePaths(paths);
    const { name } = this;
    // Wrap this instance in a fresh one (reusing the engine for its own
    // emitter/ref/on/once) that fingerprints `paths` and either skips or
    // runs+records. The wrapper keeps this action's `name`, so log lines and the
    // `launch <name>` line are unchanged; it forwards its injected logs/signal
    // straight into this inner instance's `start`.
    return action(name).run(async (ctx): Promise<Result | undefined> => {
      const fp = await FolderCache.fingerprint(targets);
      if ((await FolderCache.read(targets)) === fp) {
        ctx.logs.append({ source: name, level: "info", message: "cached, skipping" });
        return undefined;
      }
      const outcome = await this.start({
        logs: ctx.logs,
        signal: ctx.signal,
        nod: ctx.nod,
        output: ctx.output,
      });
      // Re-throw the inner failure so the wrapper fails too (the framework re-wraps
      // it into this wrapper's own Outcome); only record on success.
      if (!outcome.ok) throw outcome.error;
      await FolderCache.write(targets, fp);
      return outcome.value;
    })();
  }

  /** One-time lifecycle moment: resolve `ref` and emit `attached`. Guarded (second attach no-ops). */
  private attach(value: Handle): void {
    if (this.attached) return;
    this.attached = true;
    this.handle.resolve(value);
    this.systemEmit("attached");
  }

  /** The framework's own emits (loosely typed — sidesteps EmitArgs for void results). */
  private systemEmit(key: "attached" | "done" | "error", payload?: unknown): void {
    (this.emitter.emit as (k: "attached" | "done" | "error", p?: unknown) => void)(key, payload);
  }

  private static defer<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /** Duck-type an exit code off a thrown error (zx's ProcessOutput, command's exit error). */
  private static exitCodeOf(error: unknown): number | undefined {
    const code = (error as { exitCode?: unknown } | null | undefined)?.exitCode;
    return typeof code === "number" ? code : undefined;
  }

  /**
   * Log one emit onto the run timeline, through the action's scoped `logs` so the
   * line carries its path. Fields are `·`-delimited — action name · key · payload.
   * A string payload rides inline; a richer one is written to a snapshot file and
   * linked (`→ <rel>`) so the durable record keeps it without bloating the line.
   * This is the sole place emits become log lines — the bus itself does no logging.
   */
  private static logEmit(system: SystemGlobal, name: string, key: string, payload: unknown): void {
    const fields = [name, key];
    if (typeof payload === "string") {
      fields.push(payload);
    } else if (payload !== undefined) {
      fields.push(`→ ${system.output.snapshots.captureJson(`event-${name}-${key}`, payload).rel}`);
    }
    system.logs.append({ source: "event", level: "event", message: fields.join(" · ") });
  }

  /**
   * A promise for the next emit of `key`. It **never rejects**: it resolves with
   * the event's payload, or with `undefined` if the action settles (`done` — which
   * always fires) before `key` ever does. A retained snapshot resolves it
   * immediately. (Not used for `key === "done"`, which reads the settled Outcome.)
   */
  private static awaitEvent<E extends object, K extends keyof E>(
    emitter: Emitter<E>,
    key: K
  ): Promise<E[K] | undefined> {
    return new Promise<E[K] | undefined>((resolve) => {
      const offs: Array<() => void> = [];
      let settled = false;
      // First of [the event | done] to fire wins; the rest are unsubscribed.
      const settle = (act: () => void): void => {
        if (settled) return;
        settled = true;
        for (const off of offs) off();
        act();
      };
      // listenOnce is keyed by E; the system `done` key is always present on an
      // instance's event map, so reach it through a loosened view.
      const listen = emitter.listenOnce as (
        k: PropertyKey,
        h: (payload: unknown) => void
      ) => () => void;

      offs.push(listen(key, (payload) => settle(() => resolve(payload as E[K]))));
      // `done` fires once on any settle (success or failure); if it beats `key`,
      // the event will never come — resolve `undefined` rather than reject.
      if ((key as PropertyKey) !== "done") {
        offs.push(listen("done", () => settle(() => resolve(undefined))));
      }
      // A retained snapshot fires a listen synchronously during registration; if
      // that already settled us, drop any listeners registered afterwards.
      if (settled) for (const off of offs) off();
    });
  }
}

/**
 * The step between `action(name)` and an {@link Action}: declare typed events
 * and/or an imperative handle (phantom type transitions — each returns a builder
 * carrying the same `name`), then `run(exec)` to bind the implementation.
 */
class Builder<Events extends object, Handle> implements ActionBuilder<Events, Handle> {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  emits<E extends object>(): ActionBuilder<E, Handle> {
    return new Builder<E, Handle>(this.name);
  }

  ref<H>(): ActionBuilder<Events, H> {
    return new Builder<Events, H>(this.name);
  }

  run<Args extends unknown[], Result>(
    exec: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle> {
    const { name } = this;
    // Invoking the returned callable constructs a fresh instance (deferred — the run
    // executes it). Each call is its own {@link ActionRun}.
    const create = (...args: Args): ActionInstance<Result, Events, Handle> =>
      new ActionRun<Result, Events, Handle>(name, exec as Exec<Events, Handle, Result>, args);
    return Object.assign(create, { actionName: name });
  }
}

/**
 * Defines an action. Always returns a builder; provide the implementation via
 * `.run(…)`, optionally after declaring events and/or a handle:
 *
 *   action("Build").run(async (ctx, opts) => { … })       // no declared events / handle
 *   action("Watch")                                       // typed events + handle
 *     .emits<{ create: string }>()
 *     .ref<{ rescan(): void }>()
 *     .run((ctx, opts) => { ctx.emit(…); ctx.attach(…); … })
 *
 * `.run(…)` yields a callable that, when invoked, constructs an
 * {@link ActionInstance} (deferred — the run executes it). Instances expose
 * chainable `.on` / `.once` (declared events plus `done`/`error`); the attached
 * handle is awaited via `instance.ref`.
 */
export function action(name: string): ActionBuilder<NoEvents, void> {
  return new Builder<NoEvents, void>(name);
}
