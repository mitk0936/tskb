import type { Logger } from "./logs/LogsCollector.ts";
import { events, type Emitter, type EventHandler } from "./events.ts";

/** An action that declares no events. */
export type NoEvents = Record<never, never>;

/**
 * Lifecycle events the framework emits for every action when its run settles —
 * on top of whatever the action declares via `.emits<…>()`. They make completion
 * a first-class signal (no log-scraping) and give a uniform sequencing hook.
 */
export interface SystemEvents<Result> {
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

/** What an action's implementation receives: the system bag, plus `emit` and `attach`. */
export interface ActionContext<Events extends object, Handle = void> extends SystemGlobal {
  /** Emit one of this action's declared events (also pushed to the global log). */
  readonly emit: Emitter<Events>["emit"];
  /** Publish this action's imperative handle, resolving its instance's `.ref`. */
  readonly attach: (handle: Handle) => void;
}

/** A constructed-but-not-yet-run action: what calling an `Action` produces. */
export interface ActionInstance<Result = unknown, Events extends object = NoEvents, Handle = void> {
  readonly name: string;
  readonly args: readonly unknown[];
  /** Runs the action with the captured args and the injected system services. */
  readonly start: (system: SystemGlobal) => Promise<Result>;
  /** Resolves with the handle the action attached via `ctx.attach` (set once). */
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
    exec: (ctx: ActionContext<Events, Handle>, ...args: Args) => Promise<Result>
  ): Action<Args, Result, Events, Handle>;
}

/** A promise paired with its resolver, for the set-once handle. */
const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

/** Assembles an {@link Action} from a name and its implementation. */
const build = <Events extends object, Handle, Args extends unknown[], Result>(
  name: string,
  exec: (ctx: ActionContext<Events, Handle>, ...args: Args) => Promise<Result>
): Action<Args, Result, Events, Handle> => {
  const create = (...args: Args): ActionInstance<Result, Events, Handle> => {
    // The emitter covers declared + system events; `ctx.emit` is narrowed to the
    // declared ones, while the framework emits done/error through the same bus.
    const emitter = events<InstanceEvents<Events, Result>>(name);
    const emit = emitter.emit as Emitter<Events>["emit"];
    // Loosely typed for the framework's own emits (sidesteps EmitArgs for void results).
    const systemEmit = emitter.emit as (key: "done" | "error", payload?: unknown) => void;

    // The handle lives on the instance as a set-once promise: `attach` resolves
    // it, `instance.ref` awaits it. A second attach is a no-op (promise settled).
    const handle = deferred<Handle>();
    const attach = (value: Handle): void => handle.resolve(value);

    const instance: ActionInstance<Result, Events, Handle> = {
      name,
      args,
      ref: handle.promise,
      start: (system) =>
        exec({ ...system, emit, attach }, ...args).then(
          (result) => {
            systemEmit("done", result);
            return result;
          },
          (error: unknown) => {
            systemEmit("error", error);
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
 * Defines an action. Two forms:
 *
 *   action("Build", async (ctx, opts) => { … })          // no declared events / handle
 *   action("Watch")                                       // typed events + handle
 *     .emits<{ create: string }>()
 *     .ref<{ rescan(): void }>()
 *     .run((ctx, opts) => { ctx.emit(…); ctx.attach(…); … })
 *
 * Calling the returned action constructs an {@link ActionInstance} (deferred —
 * the run executes it). Instances expose chainable `.on` / `.once` (declared
 * events plus `done`/`error`); the attached handle is awaited via `instance.ref`.
 */
export function action<Args extends unknown[], Result>(
  name: string,
  exec: (ctx: ActionContext<NoEvents, void>, ...args: Args) => Promise<Result>
): Action<Args, Result, NoEvents, void>;
export function action(name: string): ActionBuilder<NoEvents, void>;
export function action(
  name: string,
  exec?: (ctx: ActionContext<NoEvents, void>, ...args: never[]) => Promise<unknown>
): unknown {
  return exec ? build(name, exec) : builder<NoEvents, void>(name);
}
