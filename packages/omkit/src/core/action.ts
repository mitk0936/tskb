import type { Logger } from "./log-collector/LogsCollector.ts";
import { events, type Emitter, type EventHandler } from "./events.ts";
import { createProc, type Proc } from "./process.ts";
import { fingerprint, read, write, resolvePaths } from "./folder-cache.ts";
import { artifactsFolder } from "./output.ts";

/** An action that declares no events. */
export type NoEvents = Record<never, never>;

/** A value an action's `exec` may return: a result, or a promise of one. */
export type Awaitable<T> = T | Promise<T>;

/**
 * How an action settles. An action **never throws into the spin body** — its
 * failure is data, not control flow: it completes with `{ ok: false, error }`
 * instead of rejecting. On success it carries the exec's `value`. `exitCode` is
 * present when the failure came from a process (see {@link import("../actions/command.ts").command}).
 * Await it via `instance.done` or `once("done")`; both resolve, never reject.
 */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown; readonly exitCode?: number };

/**
 * Lifecycle events the framework emits for every action — on top of whatever it
 * declares via `.emits<…>()`. They make key moments first-class signals (no
 * log-scraping) and give a uniform sequencing hook.
 */
export interface SystemEvents<Result> {
  /** The action published its imperative handle via `ctx.attach` (fires once). */
  attached: void;
  /** The action settled; payload is its {@link Outcome} (success or failure). Fires once, always. */
  done: Outcome<Result>;
  /** The action failed; payload is the thrown error. Fires only on failure (alongside `done`). */
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
  /**
   * Absolute path to this run's output folder (`logs/<name>/<date>/<time>/`) —
   * created and shared across the run. Write action artifacts here so they land
   * beside `run.log`; the same folder is on the `spin` context.
   */
  readonly artifactsFolder: string;
}

/** A constructed-but-not-yet-run action: what calling an `Action` produces. */
export interface ActionInstance<Result = unknown, Events extends object = NoEvents, Handle = void> {
  readonly name: string;
  readonly args: readonly unknown[];
  /**
   * Runs the action with the captured args and the injected system services.
   * **Resolves with the {@link Outcome}, never rejects** — a failing action is
   * reported as `{ ok: false, error }`, not a thrown promise, so it can't tear a
   * caller down. The run reads this to build its verdict.
   */
  readonly start: (system: SystemGlobal) => Promise<Outcome<Result>>;
  /**
   * The action's {@link Outcome}, as a memoized promise that **never rejects** —
   * the ergonomic way to await completion in a spin body:
   * `const r = await nod(x).done; if (!r.ok) …`. Same value as `once("done")`.
   */
  readonly done: Promise<Outcome<Result>>;
  /**
   * Resolves with the handle the action attached via `ctx.attach` (set once).
   * Used to thread a handle into another action (`chromePage(driver.ref)`). If
   * the action settles *without* attaching, this resolves (`undefined` for the
   * default `void` handle) on success and **rejects on failure** — so, unlike
   * `done`, awaiting `ref` in a body can throw. It's meant to be consumed as a
   * constructor arg *inside* another action, where that rejection becomes that
   * action's failure Outcome. For control flow, await `done`.
   */
  readonly ref: Promise<Handle>;
  /** Subscribe to a declared or system event (`done`/`error`) with a handler. */
  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): void;
  /**
   * A promise for the next occurrence of an event. It **never rejects**: it
   * resolves with the event's payload, or with `undefined` if the action settles
   * (`done`) before the event ever fires — so awaiting it in a spin body can't
   * throw and can't hang. `once("done")` yields the {@link Outcome}. Use {@link on}
   * for ongoing/handler subscriptions; `once` is the awaitable, one-value form.
   */
  once<K extends keyof InstanceEvents<Events, Result>>(
    key: K
  ): Promise<InstanceEvents<Events, Result>[K] | undefined>;
  /**
   * Gate this action on its **inputs** — the files/folders it *reads* (its
   * sources), **not** what it produces. `paths` (each a file or a folder) are
   * fingerprinted by mtime+size; the returned instance skips running when those
   * inputs are unchanged since the last successful run, and otherwise runs this
   * action and records the fingerprint. Pass inputs, not build outputs: caching
   * on an output would skip the very run that produces it.
   *
   * Every path must be **absolute** (throws otherwise). A cache hit resolves
   * immediately as success (result `undefined`) and logs a `cached, skipping`
   * line; a failure of the inner action records nothing, so it re-runs next time.
   *
   * Because `nod`/`run` launch an instance the moment they receive it, chain
   * `.withCache` *before* handing the instance in — passing the source dir:
   * `nod(command("build", "npm run build").withCache(srcAbs))`.
   */
  withCache(...paths: string[]): AnyActionInstance;
}

/**
 * Any constructed instance, whatever its result, events, or handle. The launch
 * surface ({@link ActionInstance}-takers like `run` and `Spin.run`) accepts this
 * so handle-bearing actions — those declaring `.ref<H>()` — can be launched: the
 * bare `ActionInstance` pins the handle to `void`, so an instance whose `ref` is
 * a `Promise<Page>` (not `Promise<void>`) would otherwise be rejected. `unknown`
 * for result/handle and `object` for events admit every concrete instance while
 * still excluding non-instances.
 */
export type AnyActionInstance = ActionInstance<unknown, object, unknown>;

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

/** Duck-type an exit code off a thrown error (zx's ProcessOutput, command's exit error). */
const exitCodeOf = (error: unknown): number | undefined => {
  const code = (error as { exitCode?: unknown } | null | undefined)?.exitCode;
  return typeof code === "number" ? code : undefined;
};

/**
 * A promise for the next emit of `key`. It **never rejects**: it resolves with
 * the event's payload, or with `undefined` if the action settles (`done` — which
 * always fires) before `key` ever does. So an awaiter neither hangs nor throws:
 * a waited-for event that won't come simply yields `undefined`. A retained
 * snapshot resolves it immediately. (Not used for `key === "done"`, which reads
 * straight from the settled Outcome.)
 */
const awaitEvent = <E extends object, K extends keyof E>(
  emitter: Emitter<E>,
  key: K
): Promise<E[K] | undefined> =>
  new Promise<E[K] | undefined>((resolve) => {
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

    // The action's Outcome as a set-once promise. `start` resolves it (success or
    // failure); `instance.done` / `once("done")` read it. It never rejects.
    const settled = deferred<Outcome<Result>>();

    const instance: ActionInstance<Result, Events, Handle> = {
      name,
      args,
      ref: handle.promise,
      done: settled.promise,
      start: (system) =>
        // `Promise.resolve().then` normalizes a sync result and routes a sync
        // throw to the `error` path, so exec may be sync or async.
        Promise.resolve()
          .then(() =>
            exec(
              {
                ...system,
                emit,
                attach,
                proc: createProc(system.logs, system.signal),
                artifactsFolder: artifactsFolder(),
              },
              ...args
            )
          )
          .then(
            (result): Outcome<Result> => {
              const outcome = { ok: true as const, value: result };
              settled.resolve(outcome);
              systemEmit("done", outcome);
              // Settle `ref` if the action finished without attaching, so awaiters
              // resolve (with `undefined` for the default void handle) rather than
              // hang. Idempotent — a no-op when a handle was already attached.
              handle.resolve(undefined as Handle);
              return outcome;
            },
            (error: unknown): Outcome<Result> => {
              const exitCode = exitCodeOf(error);
              const outcome: Outcome<Result> =
                exitCode === undefined ? { ok: false, error } : { ok: false, error, exitCode };
              // Emit `error` (for `.on("error")` handlers), then settle `done` with
              // the Outcome — the canonical failure signal that `.done`/`once` read.
              systemEmit("error", error);
              settled.resolve(outcome);
              systemEmit("done", outcome);
              // The action failed, so its handle will never arrive — reject `ref`
              // with the same error instead of leaving awaiters hung. No-op if a
              // handle was already attached before the failure.
              handle.reject(error);
              // Resolve (never rethrow): failure is the Outcome, not a rejection.
              return outcome;
            }
          ),
      on(key, handler) {
        emitter.listen(key, handler);
      },
      once(key) {
        // `done` always fires with the Outcome and never "fails" the await, so it
        // reads straight from the settled promise; other keys race via awaitEvent
        // (which resolves `undefined` if the action settles before the event).
        return (key === "done" ? settled.promise : awaitEvent(emitter, key)) as Promise<
          InstanceEvents<Events, Result>[typeof key] | undefined
        >;
      },
      // Wrap this instance in a fresh one (reusing the engine for its own
      // emitter/ref/on/once) that fingerprints `paths` and either skips or
      // runs+records. The wrapper keeps this action's `name`, so log lines and
      // the `launch <name>` line are unchanged. It forwards its injected
      // logs/signal straight into the inner action's `start`.
      withCache(...paths) {
        // Validate + canonicalize eagerly here (at the call site), not lazily
        // inside the run — a relative path fails fast where it's written, and
        // the resolved paths give a stable cache key regardless of spelling.
        const targets = resolvePaths(paths);
        return action(name).run(async (ctx): Promise<Result | undefined> => {
          const fp = await fingerprint(targets);
          if ((await read(targets)) === fp) {
            ctx.logs.append({ source: name, level: "info", message: "cached, skipping" });
            return undefined;
          }
          const outcome = await instance.start({ logs: ctx.logs, signal: ctx.signal });
          // Re-throw the inner failure so the wrapper fails too (the framework
          // re-wraps it into this wrapper's own Outcome); only record on success.
          if (!outcome.ok) throw outcome.error;
          await write(targets, fp);
          return outcome.value;
        })();
      },
    };
    // Register this instance as the producer of its `.ref`, so the run can catch
    // a consumer built with this `.ref` that gets launched before this instance.
    refOwners.set(instance.ref, instance as AnyActionInstance);
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
