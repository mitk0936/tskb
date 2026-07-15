import type { Emitter, EventHandler } from "../foundation/events.ts";
import type { ReadableLog } from "../foundation/LogEntry.ts";
import type { Proc } from "../system/proc.ts";

/** A value an action's exec may return: a result, or a promise of one. */
export type Awaitable<T> = T | Promise<T>;

/** An action that declares no events. */
export type NoEvents = Record<never, never>;

/** An activity's terminal outcome: a value on success, an error on failure/cancel. Never thrown. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** A node's lifecycle state, mirrored into `result.json`. */
export type NodeStatus = "running" | "ok" | "failed" | "cancelled";

/**
 * The lifecycle events every action emits on top of its declared ones — so key
 * moments are first-class signals rather than log-scraping.
 */
export interface SystemEvents<Result> {
  attached: void;
  done: Result;
  error: unknown;
}

/** The full event map a run exposes: declared events plus the system ones. */
export type InstanceEvents<Events extends object, Result> = Events & SystemEvents<Result>;

/** What an action's `exec` receives. `logs` is read-only; output is via `console.*`. */
export interface ActionContext<Events extends object = NoEvents, Handle = void> {
  /** This node's abort signal — honor it to stop early. */
  readonly signal: AbortSignal;
  /** The combined run log, read-only (subscribe/observe; never append). */
  readonly logs: ReadableLog;
  /** Emit one of this action's declared events (also logged onto the timeline). */
  readonly emit: Emitter<Events>["emit"];
  /** Publish this action's imperative handle, resolving its run's `.ref`. */
  readonly attach: (handle: Handle) => void;
  /** Tag this run (timeline-visible; accumulates onto the node). */
  readonly tag: (name: string) => void;
  /** Assert an invariant: logs a `⊨` line and tallies into the verdict. Never throws. */
  readonly assert: (condition: boolean, message: string) => void;
  /** Capture a JSON snapshot; drops a timeline line and resolves the file's absolute path. */
  readonly snapshot: (name: string, value: unknown) => Promise<string>;
  /** Absolute path to this run's output folder — write artifacts (screenshots, dumps, …) here. */
  readonly artifactsFolder: string;
  /** Spawn child processes bound to this action (output → this node's log, killed on teardown). */
  readonly proc: Proc;
}

/** What the `om` body receives — the run-level counterpart to {@link ActionContext}. */
export interface OmContext {
  /** The run's (root) abort signal. */
  readonly signal: AbortSignal;
  /** Tag the root run. */
  readonly tag: (name: string) => void;
  /** Tear the whole run down. */
  readonly cancel: () => void;
  /** The combined run log, read-only. */
  readonly logs: ReadableLog;
  /** Assert an invariant from the body (attributed to the root). Never throws. */
  readonly assert: (condition: boolean, message: string) => void;
  /** Capture a run-level JSON snapshot; resolves the file's absolute path. */
  readonly snapshot: (name: string, value: unknown) => Promise<string>;
  /** Absolute path to this run's output folder — write run-level artifacts here. */
  readonly artifactsFolder: string;
}

/**
 * A launched action: the live node's awaitable/observable surface. `.result` always
 * resolves an {@link Outcome} (never throws); `.ref` rejects on failure/cancel.
 */
export interface RunHandle<Result = unknown, Events extends object = NoEvents, Handle = void> {
  readonly id: string;
  /** The terminal outcome; always resolves (never rejects). Reading it observes the failure. */
  readonly result: Promise<Outcome<Result>>;
  /** The attached handle; rejects on failure/cancel. */
  readonly ref: Promise<Handle>;
  /**
   * Handle a fire-and-forget activity's failure: attach a handler so a crash runs it
   * instead of tearing the run down. Observes the failure; chainable; attach in the
   * same tick as `.exec()`. Not called on cancellation.
   */
  handleFailure(handler: (error: unknown) => void): this;
  /** Subscribe to every emit of a declared/system event (`done`/`error`/`attached`). */
  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): void;
  /** Next emit of `key`; resolves `undefined` if the node settles first (never rejects). */
  once<K extends keyof InstanceEvents<Events, Result>>(
    key: K
  ): Promise<InstanceEvents<Events, Result>[K] | undefined>;
  /** Tag this run; chainable. */
  tag(name: string): this;
  /** Abort this node and its subtree. */
  cancel(): void;
}

/** A constructed-but-not-yet-run action: what calling an `Action` produces. */
export interface ActionInstance<Result = unknown, Events extends object = NoEvents, Handle = void> {
  readonly name: string;
  readonly args: readonly unknown[];
  /** Buffer a tag before launch; applied onto the node at creation. Chainable. */
  tag(name: string): this;
  /**
   * Gate this action on its **input** files/folders (absolute paths): skip running
   * when they're unchanged since the last successful run (a hit resolves
   * `undefined` and logs `cached, skipping`). Chain before launching.
   */
  withCache(...paths: string[]): ActionInstance<Result | undefined, Events, Handle>;
  /** Launch under the ambient current node; returns the live {@link RunHandle}. */
  exec(): RunHandle<Result, Events, Handle>;
}

/** Any constructed instance, whatever its result/events/handle. */
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
  /** `file:line` where this action was defined (the `.run(...)` site), for the log header. */
  readonly definedAt: string | undefined;
}

/** Intermediate step from `action(name)`: declare events/handle, then provide the impl. */
export interface ActionBuilderEvents<Events extends object, Handle = void> {
  emits<E extends object>(): ActionBuilderEvents<E, Handle>;
  ref<H>(): ActionBuilderEvents<Events, H>;
  run<Args extends unknown[], Result>(
    body: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle>;
}

/** The exec signature bound by `.run(...)` (arg types erased at the boundary). */
export type Exec<Events extends object, Handle, Result> = (
  ctx: ActionContext<Events, Handle>,
  ...args: never[]
) => Awaitable<Result>;

/** What the {@link ExecutionTree} needs to launch an instance — the shape an instance satisfies. */
export interface LaunchSpec {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly tags: readonly string[];
  readonly body: Exec<object, unknown, unknown>;
  /** `file:line` where the action was defined; carried onto the node for its log header. */
  readonly definedAt: string | undefined;
}
