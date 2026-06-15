import type { Logger } from "./log-collector/LogsCollector.ts";
import { events, type Emitter, type EventHandler } from "./events.ts";
import { createProc, type Proc } from "./process.ts";

/** An action that declares no events. */
export type NoEvents = Record<never, never>;

/** A value an action's `exec` may return: a result, or a promise of one. */
export type Awaitable<T> = T | Promise<T>;

/**
 * Lifecycle events the framework emits for every action — on top of whatever it
 * declares via `.emits<…>()`. They make key moments first-class signals (no
 * log-scraping) and give a uniform sequencing hook.
 */
export interface SystemEvents<Result> {
  /** The action published its imperative handle via `ctx.attach` (fires once). */
  attached: void;
  /** The run resolved; payload is its result. */
  done: Result;
  /** The run rejected; payload is the thrown error. */
  error: unknown;
}

/** The full event map a constructed instance exposes: the declared events plus the system ones. */
export type InstanceEvents<Events extends object, Result> = Events & SystemEvents<Result>;

/** System services the pipeline injects into every action when it runs. */
export interface SystemGlobal {
  /** A logger bound to this action — feeds it directly or via `proc`. */
  readonly logs: Logger;
  /** The run's abort signal — aborted on teardown/cancel; honor it to stop early. */
  readonly signal: AbortSignal;
}

/** What an action's implementation receives: the system bag, plus `emit`, `attach`, and `proc`. */
export interface ActionContext<Events extends object, Handle = void> extends SystemGlobal {
  /** Emit one of this action's declared events (also pushed to the global log). */
  readonly emit: Emitter<Events>["emit"];
  /** Publish this action's imperative handle, resolving its instance's `.ref`. */
  readonly attach: (handle: Handle) => void;
  /**
   * Spawn child processes bound to this action: their output streams into this
   * action's log and they're killed on teardown. The built-in source; a custom
   * one (e.g. CDP) follows the same pattern over `logs`/`signal`.
   */
  readonly proc: Proc;
}

/** A constructed-but-not-yet-run action: what calling an `Action` produces. */
export interface ActionInstance<Result = unknown, Events extends object = NoEvents, Handle = void> {
  readonly name: string;
  readonly args: readonly unknown[];
  /** Runs the action with the captured args and the injected system services. */
  readonly start: (system: SystemGlobal) => Promise<Result>;
  /**
   * Resolves with the handle the action attached via `ctx.attach` (set once). If
   * the action settles *without* attaching, this never hangs: it resolves
   * (`undefined` for the default `void` handle) on success, or rejects with the
   * action's error on failure.
   */
  readonly ref: Promise<Handle>;
  /** Subscribe to a declared or system event (`done`/`error`). Chainable. */
  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): this;
  /** Like {@link on} but auto-unsubscribes after the first delivery. Chainable. */
  once<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): this;
}

/** A callable produced by `action`: invoking it builds an {@link ActionInstance}. */
export interface Action<
  Args extends unknown[],
  Result,
  Events extends object = NoEvents,
  Handle = void,
> {
  (...args: Args): ActionInstance<Result, Events, Handle>;
  readonly actionName: string;
}

/** Intermediate step from `action(name)`: declare events/handle, then provide the impl. */
export interface ActionBuilder<Events extends object, Handle = void> {
  /** Declare the typed event map this action emits. */
  emits<E extends object>(): ActionBuilder<E, Handle>;
  /** Declare the imperative handle this action exposes (resolved via `instance.ref`). */
  ref<H>(): ActionBuilder<Events, H>;
  /** Provide the implementation. `ctx` carries `logs`, `signal`, `emit`, and `attach`. */
  run<Args extends unknown[], Result>(
    exec: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle>;
}

/** A promise paired with its settlers, for the set-once handle. */
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Assembles an {@link Action} from a name and its implementation. */
const build = <Events extends object, Handle, Args extends unknown[], Result>(
  name: string,
  exec: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
): Action<Args, Result, Events, Handle> => {
  const create = (...args: Args): ActionInstance<Result, Events, Handle> => {
    // The emitter covers declared + system events; `ctx.emit` is narrowed to the
    // declared ones, while the framework emits done/error through the same bus.
    const emitter = events<InstanceEvents<Events, Result>>(name);
    const emit = emitter.emit as Emitter<Events>["emit"];
    // Loosely typed for the framework's own emits (sidesteps EmitArgs for void results).
    const systemEmit = emitter.emit as (
      key: "attached" | "done" | "error",
      payload?: unknown
    ) => void;

    // The handle lives on the instance as a set-once promise: `attach` resolves
    // it, `instance.ref` awaits it. A second attach is a no-op (promise settled).
    // If the action settles without ever attaching, `start` below settles it too
    // (resolve on success, reject on error) so `ref` can't hang.
    const handle = deferred<Handle>();
    // Attaching is a one-time lifecycle moment: resolve `ref` and emit `attached`
    // (the *fact* the action became controllable — not the handle, which is just
    // functions). Guarded so a second attach neither re-emits nor re-resolves.
    let attached = false;
    const attach = (value: Handle): void => {
      if (attached) return;
      attached = true;
      handle.resolve(value);
      systemEmit("attached");
    };
    // Most actions have a `void` handle and no one awaits `ref`; mark the promise
    // handled so a settle-time rejection on such an instance doesn't surface as an
    // unhandled rejection. Real awaiters of `ref` still receive the rejection.
    void handle.promise.catch(() => {});

    const instance: ActionInstance<Result, Events, Handle> = {
      name,
      args,
      ref: handle.promise,
      start: (system) =>
        // `Promise.resolve().then` normalizes a sync result and routes a sync
        // throw to the `error` path, so exec may be sync or async.
        Promise.resolve()
          .then(() =>
            exec({ ...system, emit, attach, proc: createProc(system.logs, system.signal) }, ...args)
          )
          .then(
            (result) => {
              systemEmit("done", result);
              // Settle `ref` if the action finished without attaching, so awaiters
              // resolve (with `undefined` for the default void handle) rather than
              // hang. Idempotent — a no-op when a handle was already attached.
              handle.resolve(undefined as Handle);
              return result;
            },
            (error: unknown) => {
              systemEmit("error", error);
              // The action failed, so its handle will never arrive — reject `ref`
              // with the same error instead of leaving awaiters hung. No-op if a
              // handle was already attached before the failure.
              handle.reject(error);
              throw error;
            }
          ),
      on(key, handler) {
        emitter.listen(key, handler);
        return instance;
      },
      once(key, handler) {
        emitter.listenOnce(key, handler);
        return instance;
      },
    };
    return instance;
  };
  return Object.assign(create, { actionName: name });
};

const builder = <Events extends object, Handle>(name: string): ActionBuilder<Events, Handle> => ({
  emits: <E extends object>() => builder<E, Handle>(name),
  ref: <H>() => builder<Events, H>(name),
  run: (exec) => build(name, exec),
});

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
  return builder<NoEvents, void>(name);
}
