import type { Logger } from "../../output/log/LogsCollector.ts";
import type { Output } from "../../output/Output.ts";
import type { Emitter, EventHandler } from "../events/events.ts";
import type { Proc } from "../../system/process/process.ts";
import type { Assert } from "../../output/log/assert.ts";

/** An action that declares no events. */
export type NoEvents = Record<never, never>;

/** A value an action's `exec` may return: a result, or a promise of one. */
export type Awaitable<T> = T | Promise<T>;

/**
 * How an action settles. An action **never throws into the spin body** — its
 * failure is data, not control flow: it completes with `{ ok: false, error }`
 * instead of rejecting. On success it carries the exec's `value`. `exitCode` is
 * present when the failure came from a process (see {@link import("../../../actions/command.ts").command}).
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

/**
 * Launch an action into the spin and get the same instance back, so you can
 * `await` its `.done` (its {@link Outcome} — resolves with `{ ok, value } |
 * { ok, error }`, **never throws**), its `.ref` (the attached handle; rejects on
 * failure, so it's for data deps consumed inside other actions), or subscribe with
 * `.on` / `.once`. The spin body waves an action in with a nod; an action nods
 * **child** actions the same way, and their log output is prefixed with the
 * parent's path (see `SpinHost`).
 */
export type Nod = <I extends AnyActionInstance>(instance: I) => I;

/** System services the pipeline injects into every action when it runs. */
export interface SystemGlobal {
  /** A logger bound to this action — feeds it directly or via `proc`. */
  readonly logs: Logger;
  /** The run's abort signal — aborted on teardown/cancel; honor it to stop early. */
  readonly signal: AbortSignal;
  /**
   * Launch a **child** action into the same spin (returns it for awaiting/chaining).
   * The child's log output is prefixed with this action's path (`parent › child`),
   * and the child lives in the spin — it keeps the run alive until it settles,
   * independent of when this action finishes. `await ctx.nod(x).done` to wait on it.
   */
  readonly nod: Nod;
  /**
   * This run's output subsystem — the folder, snapshot store, and run-log writer,
   * owned by the {@link SpinHost} and threaded to every action (rather than reached
   * as a module singleton). The framework uses it to place `ctx.artifactsFolder`
   * and to snapshot event/proc payloads; actions can reach `output.snapshots` to
   * capture their own artifacts.
   */
  readonly output: Output;
  /**
   * Assert a boolean invariant for this action. Logs a `⊨` line every call; a
   * mismatch is recorded into the run's verdict (never throws, never stops the
   * run). Bound to this action's path for attribution.
   */
  readonly assert: Assert;
}

/** What an action's implementation receives: the system bag, plus `emit`, `attach`, and `proc`. */
export interface ActionContext<Events extends object, Handle = void> extends SystemGlobal {
  /** Emit one of this action's declared events (also logged onto the timeline under this action's path). */
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
  /**
   * Capture a JSON snapshot into this run's output folder and drop a `[snapshot]`
   * line on the timeline (under this action's path). The ergonomic shortcut for
   * `ctx.output.snapshots.snapshot(…)`; the same convenience is on the `spin`
   * context. Resolves with the snapshot's relative path.
   */
  readonly snapshot: (name: string, value: unknown) => Promise<string>;
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
   * Used to thread a handle into another action (`chromePage("Explorer", driver.ref)`). If
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
