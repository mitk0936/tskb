import { events, type Emitter, type EventHandler } from "../events/events.ts";
import { FolderCache } from "../../system/fs/FolderCache.ts";
import { defer, type Deferred } from "../../utils/Deferred.ts";
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
import { registerRef } from "./refRegistry.ts";
import { awaitEvent } from "./awaitEvent.ts";
import { failureOutcome } from "./outcome.ts";
import { logEmit } from "./logEmit.ts";
import { buildContext } from "./context.ts";
import { cachedRun } from "./withCache.ts";

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
    this.handle = defer<Handle>();
    this.settled = defer<Outcome<Result>>();
    this.ref = this.handle.promise;
    this.done = this.settled.promise;
    // Most actions have a `void` handle and no one awaits `ref`; mark the promise
    // handled so a settle-time rejection on such an instance doesn't surface as an
    // unhandled rejection. Real awaiters of `ref` still receive the rejection.
    void this.handle.promise.catch(() => {});
    // Register this instance as the producer of its `.ref`, so the run can catch a
    // consumer built with this `.ref` that gets launched before this instance.
    registerRef(this as AnyActionInstance);
  }

  start(system: SystemGlobal): Promise<Outcome<Result>> {
    // `ctx.emit` is the declared-events view of the same bus.
    const emit = this.emitter.emit as Emitter<Events>["emit"];
    // The bus is pure pub/sub; logging each emit onto the timeline is layered here,
    // through this action's *scoped* logger — so an emit's line inherits the action's
    // path (`parent › child › event`) just like its other output, and the bus stays
    // free of any global. Registered once per run of this instance.
    this.emitter.onAny((key, payload) => logEmit(system, this.name, String(key), payload));
    // `Promise.resolve().then` normalizes a sync result and routes a sync throw to
    // the `error` path, so exec may be sync or async.
    return Promise.resolve()
      .then(() =>
        this.exec(
          buildContext(system, emit, (value) => this.attach(value)),
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
          const outcome = failureOutcome(error);
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
    return (key === "done" ? this.settled.promise : awaitEvent(this.emitter, key)) as Promise<
      InstanceEvents<Events, Result>[K] | undefined
    >;
  }

  withCache(...paths: string[]): AnyActionInstance {
    // Validate + canonicalize eagerly here (at the call site), not lazily inside the
    // run — a relative path fails fast where it's written, and the resolved paths
    // give a stable cache key regardless of spelling.
    const targets = FolderCache.resolvePaths(paths);
    const { name } = this;
    // Wrap this instance in a fresh one that keeps this action's `name` (so log lines
    // and the `launch <name>` line are unchanged) and delegates to `cachedRun`, which
    // fingerprints `targets` and either skips or runs+records this inner instance.
    return action(name).run((ctx) => cachedRun(this, name, targets, ctx))();
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
