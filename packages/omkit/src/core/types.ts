import type { z } from "zod";
import type { JsonSchema } from "./schema-json.ts";
import type { Emitter, EventHandler } from "../foundation/events.ts";
import type { ReadableLog } from "../foundation/LogEntry.ts";
import type { Proc } from "../system/proc.ts";

/** Any zod schema. Aliased so the rest of the file reads without zod's generics. */
export type ZodTypeLike = z.ZodType;
/** The TypeScript type a schema validates to. */
export type InferSchema<S extends ZodTypeLike> = z.infer<S>;

/** A value an action's exec may return: a result, or a promise of one. */
export type Awaitable<T> = T | Promise<T>;

/** An action that declares no events. */
export type NoEvents = Record<never, never>;

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
  /**
   * Resolves once `signal` aborts — the daemon idiom `await ctx.untilAborted(); cleanup()`.
   * Code after the await stays attributed to this node (an `"abort"` listener would not).
   */
  readonly untilAborted: () => Promise<void>;
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
  /**
   * Label a file this action wrote — name, optional description, MIME inferred from the
   * extension. Drops a timeline line and returns the file's path. Purely descriptive:
   * the file must already exist (or be written next); this records what it is.
   */
  readonly artifact: (
    name: string,
    file: string,
    opts?: { description?: string; mime?: string }
  ) => string;
  /** Absolute path to this run's output folder — write artifacts (screenshots, dumps, …) here. */
  readonly artifactsFolder: string;
  /** Spawn child processes bound to this action (output → this node's log, killed on teardown). */
  readonly proc: Proc;
}

/** Human-readable metadata about an om or action. */
export interface OmDescription {
  /** One line saying what this does. Whitespace is collapsed, so a template literal is fine. */
  summary: string;
  // Suggested keys — optional, but using these names keeps descriptions alike across projects.
  /** What must be in place before it runs: tools, services, credentials, other oms. */
  readonly needs?: string | readonly string[];
  /** What it changes outside its own run folder: processes left running, state mutated. */
  readonly sideEffects?: string | readonly string[];
  /** Files or folders it writes, outside `logs/`. */
  readonly writes?: string | readonly string[];
  /** Who to ask about it. */
  readonly owner?: string;
  /** Where to read more. */
  readonly docs?: string;
  /**
   * Anything else worth knowing before running it — an owner, a docs link, what it needs.
   * Listed under the summary, keyed by name, in the interactive picker and the run report.
   */
  readonly [prop: string]: DescriptionValue;
}

/**
 * A summary literal as the one line `.describe()` stores at runtime: newlines, tabs and
 * indentation collapsed to single spaces, ends trimmed. Carried on {@link Action} and
 * {@link Activity} so an editor hover shows what an action is for, at the definition, at every
 * call site and on the activity it returns. A non-literal summary stays `string`, and so does
 * one too long to clean within the instantiation budget — never a compile error.
 */
export type OneLine<S extends string> = string extends S
  ? string
  : Trimmed<Squashed<ReplaceAll<ReplaceAll<ReplaceAll<S, "\r", " ">, "\t", " ">, "\n", " ">>>;

/** Steps one rewrite may take before giving up as `string`; tail recursion allows 1000. */
type RewriteBudget = 500;

type ReplaceAll<
  S extends string,
  From extends string,
  To extends string,
  Steps extends 0[] = [],
> = Steps["length"] extends RewriteBudget
  ? string
  : S extends `${infer A}${From}${infer B}`
    ? ReplaceAll<`${A}${To}${B}`, From, To, [...Steps, 0]>
    : S;

type Squashed<S extends string> = ReplaceAll<S, "  ", " ">;

/** At most one space is left at each end once runs are squashed. */
type Trimmed<S extends string> = S extends ` ${infer R}`
  ? Trimmed<R>
  : S extends `${infer R} `
    ? Trimmed<R>
    : S;

/** What a description prop can hold: values that read plainly in a terminal and a report. */
export type DescriptionValue = string | number | boolean | readonly string[] | undefined;

/** How an om or action behaves when a client runs it as an MCP tool. */
export type McpMode = "settling" | "long-lived";

/**
 * Marks an om or action as exposed over MCP. Absent ⇒ invisible to the server:
 * `.describe()` and `.args()` alone expose nothing.
 */
export interface McpExposure {
  /**
   * Whether the run settles on its own. `run_om` accepts only a `"settling"` entry; a
   * `"long-lived"` one must be started with `start_om`. Omitted ⇒ `"settling"`, so being
   * wrong surfaces as a timeout rather than a silently orphaned process.
   */
  mode?: McpMode;
}

/** An {@link McpExposure} after the builder has filled its default. */
export interface ResolvedMcpExposure {
  readonly mode: McpMode;
}

/** The result of converting a declared schema — one of the two fields is always undefined. */
export interface DescribedArgs {
  readonly inputSchema: JsonSchema | undefined;
  readonly schemaError: string | undefined;
}

/** The builder returned by `om(name)`. `.run(body)` launches the run. */
export interface OmBuilder {
  /** Attach a human-readable summary — carried for `omkit ls` and future tooling. */
  describe(description: OmDescription): OmBuilder;
  /** Expose this om over MCP. Without it the MCP server does not list or run it. */
  mcp(exposure?: McpExposure): OmBuilder;
  /**
   * Declare the run's input shape. Unlike an action's `.args()`, this is resolved at
   * runtime: the values come from what was supplied, then the schema's defaults, then by
   * prompting — and the run fails if that is not enough.
   */
  args<S extends ZodTypeLike>(schema: S): OmBuilderArgs<S>;
  /**
   * Launch the run with `body` as its root. The body runs inside the root node's
   * ambient scope, so any action call / `step(...)` / `console.*` it reaches attributes
   * correctly. Resolves once the run has torn down and produced its artifacts; never
   * rejects (failures are recorded in the tree and set the exit code). Whatever the body
   * returns is recorded as the run's `value` in `result.json`.
   */
  run(body: (ctx: OmContext) => Awaitable<unknown>): Promise<void>;
}

/** After `.args(schema)`: `.run`'s body receives the resolved, typed args. */
export interface OmBuilderArgs<S extends ZodTypeLike> {
  describe(description: OmDescription): OmBuilderArgs<S>;
  /** Expose this om over MCP. Without it the MCP server does not list or run it. */
  mcp(exposure?: McpExposure): OmBuilderArgs<S>;
  /**
   * Launch the run, resolving the declared args first — supplied values, then defaults,
   * then prompting — and pass them to `body` as its second parameter. Resolution happens
   * *inside* the run, so a prompt and its answer land on the run's own timeline; an
   * unresolvable arg fails the run like any other error in the body. Whatever the body
   * returns is recorded as the run's `value` in `result.json`.
   */
  run(body: (ctx: OmContext, args: InferSchema<S>) => Awaitable<unknown>): Promise<void>;
}

/** What the `om` body receives — the run-level counterpart to {@link ActionContext}. */
export interface OmContext {
  /** The run's (root) abort signal. */
  readonly signal: AbortSignal;
  /**
   * Resolves once `signal` aborts — the daemon idiom `await ctx.untilAborted(); cleanup()`.
   * Code after the await stays attributed to this node (an `"abort"` listener would not).
   */
  readonly untilAborted: () => Promise<void>;
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
  /**
   * Label a file this action wrote — name, optional description, MIME inferred from the
   * extension. Drops a timeline line and returns the file's path. Purely descriptive:
   * the file must already exist (or be written next); this records what it is.
   */
  readonly artifact: (
    name: string,
    file: string,
    opts?: { description?: string; mime?: string }
  ) => string;
  /** Absolute path to this run's output folder — write run-level artifacts here. */
  readonly artifactsFolder: string;
}

/**
 * A launched action: the live node's awaitable/observable surface, returned by
 * **invoking an {@link Action}**. `.result` (like `.ref` and `once`) resolves the value on
 * success and **rejects** with the action's error on failure (or `CancelledError` on cancel);
 * reading it observes the activity, so a handled failure won't tear the run down. The body is
 * committed one microtask after the launching call, so pre-body config (`withCache`) chained
 * before the first `await` still applies.
 */
export interface Activity<
  Result = unknown,
  Events extends object = NoEvents,
  Handle = void,
  /** The defining action's `.describe()` summary, for editor hovers; never read at runtime. */
  Summary extends string = string,
> {
  readonly id: string;
  /**
   * The terminal outcome: resolves the value on success, **rejects** with the action's error on
   * failure (or `CancelledError` on cancel). Reading it observes the activity — a handled failure,
   * so it won't tear the run down. For fire-and-forget handling, `activity.result.catch(fn)`.
   */
  readonly result: Promise<Result>;
  /** The attached handle; rejects on failure/cancel. */
  readonly ref: Promise<Handle>;
  /**
   * Gate this activity on its **input** files/folders (absolute paths): skip running the
   * body when they're unchanged since the last successful run (a hit resolves `undefined`
   * and logs `cached, skipping`). **Pre-body only** — chain it before the first `await`
   * after the launching call; calling it once the body has started throws.
   */
  withCache(...paths: string[]): Activity<Result | undefined, Events, Handle, Summary>;
  /** Subscribe to every emit of a declared/system event (`done`/`error`/`attached`). */
  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): void;
  /**
   * Await the next emit of `key`. Resolves the event's payload when it fires; if the activity
   * settles first, resolves `undefined` on success and **rejects** on failure/cancellation — so a
   * gate on an event surfaces a failure instead of hanging or sailing past it. Observes the
   * activity. `once("done")` is the outcome itself — identical to `.result`.
   */
  once<K extends keyof InstanceEvents<Events, Result>>(
    key: K
  ): Promise<InstanceEvents<Events, Result>[K] | undefined>;
  /** Tag this run; chainable. */
  tag(name: string): this;
  /** Abort this node and its subtree. */
  cancel(): void;
}

/** A callable produced by `action`: **invoking it launches** the action and returns the live {@link Activity}. */
export interface Action<
  Args extends unknown[],
  Result,
  Events extends object = NoEvents,
  Handle = void,
  /** The `.describe()` summary as a literal type, so a hover on the action shows it. */
  Summary extends string = string,
> {
  (...args: Args): Activity<Result, Events, Handle, Summary>;
  readonly actionName: string;
  /** `file:line` where this action was defined (the `.run(...)` site), for the log header. */
  readonly definedAt: string | undefined;
  /**
   * The summary from `.describe(…)`, carried across every builder link onto the definition.
   * Stored so it is retrievable; nothing in the runtime reads it yet.
   */
  readonly description: OmDescription | undefined;
  /** The `.mcp(…)` exposure, carried across every builder link. Undefined ⇒ not exposed. */
  readonly mcp: ResolvedMcpExposure | undefined;
  /**
   * The declared args as JSON Schema, computed on demand. Called by the discovery child
   * rather than converting the schema itself: the user's file resolves `"omkit"` to the
   * installed package while the child runs omkit's own module graph, so the two can hold
   * different zod instances. Converting inside the defining copy sidesteps that. Never
   * throws — an unconvertible schema comes back as `schemaError`.
   */
  readonly describeArgs: () => DescribedArgs;
  /**
   * Resolve args that arrived as untyped JSON — the MCP host's — against the declared
   * schema: defaults filled, everything validated, or a throw naming the field. Identity
   * without `.args()`. Runs in the defining copy of omkit for the same reason
   * `describeArgs` does. In-code callers never need it: their args are typed.
   */
  readonly parseArgs: (supplied: unknown) => unknown;
}

/** Intermediate step from `action(name)`: declare metadata/events/handle, then the impl. */
export interface ActionBuilderEvents<
  Events extends object,
  Handle = void,
  Summary extends string = string,
> {
  describe<const D extends string>(
    description: OmDescription & { summary: D }
  ): ActionBuilderEvents<Events, Handle, OneLine<D>>;
  /** Expose this action over MCP. Without it the MCP server does not list or run it. */
  mcp(exposure?: McpExposure): ActionBuilderEvents<Events, Handle, Summary>;
  emits<E extends object>(): ActionBuilderEvents<E, Handle, Summary>;
  ref<H>(): ActionBuilderEvents<Events, H, Summary>;
  /** Pin the first parameter to the schema's inferred type. */
  args<S extends ZodTypeLike>(schema: S): ActionBuilderArgs<S, Events, Handle, Summary>;
  run<Args extends unknown[], Result>(
    body: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle, Summary>;
}

/** After `.args(schema)`: `.run` takes exactly one typed argument. */
export interface ActionBuilderArgs<
  S extends ZodTypeLike,
  Events extends object,
  Handle = void,
  Summary extends string = string,
> {
  describe<const D extends string>(
    description: OmDescription & { summary: D }
  ): ActionBuilderArgs<S, Events, Handle, OneLine<D>>;
  /** Expose this action over MCP. Without it the MCP server does not list or run it. */
  mcp(exposure?: McpExposure): ActionBuilderArgs<S, Events, Handle, Summary>;
  emits<E extends object>(): ActionBuilderArgs<S, E, Handle, Summary>;
  ref<H>(): ActionBuilderArgs<S, Events, H, Summary>;
  run<Result>(
    body: (ctx: ActionContext<Events, Handle>, args: InferSchema<S>) => Awaitable<Result>
  ): Action<[InferSchema<S>], Result, Events, Handle, Summary>;
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
  /** What the definition declared about itself — carried onto the node for the run record. */
  readonly meta?: ActionMeta;
  /** `file:line` of the call that launched this instance; carried onto the node for the record. */
  readonly calledAt?: string;
}

/**
 * A definition's self-description, as it travels onto each node it launches: what
 * `.describe()` and `.mcp()` said, and the `.args()` schema as JSON Schema. Read only by the
 * run record (`result.json`, `report.html`) — the runtime never branches on it.
 */
export interface ActionMeta {
  readonly description?: OmDescription;
  readonly mcp?: ResolvedMcpExposure;
  /** Converts the declared args schema; called once, at finalize. */
  readonly describeArgs?: () => DescribedArgs;
  /** Launched by `step(…)` — an inline action with no reusable definition. */
  readonly inline?: boolean;
}
