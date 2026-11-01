import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import { describeSchema } from "./discovery-mode.ts";
import { formatIssues } from "./args.ts";
import { normalizeDescription } from "./description.ts";
import type {
  Action,
  ActionMeta,
  DescribedArgs,
  ActionBuilderArgs,
  ActionBuilderEvents,
  ActionContext,
  Activity,
  Awaitable,
  Exec,
  InferSchema,
  LaunchSpec,
  McpExposure,
  NoEvents,
  OmDescription,
  OneLine,
  ResolvedMcpExposure,
  ZodTypeLike,
} from "./types.ts";

/** A call site handed over by {@link launchedFrom}, taken by the very next launch. */
let handedSite: string | undefined;

const takeHandedSite = (): string | undefined => {
  const site = handedSite;
  handedSite = undefined;
  return site;
};

/**
 * Run `launch` (which must launch exactly one action, synchronously) with `site` recorded as
 * that launch's `calledAt`. For batteries that build their action per call inside a factory
 * (`command`, `pollUntil`): the launch then happens in omkit's own file, so the frame the
 * launch would record is the factory, not the user's line. The factory captures its caller
 * with `callerSite()` and hands it over here.
 */
export function launchedFrom<T>(site: string | undefined, launch: () => T): T {
  handedSite = site;
  try {
    return launch();
  } finally {
    handedSite = undefined;
  }
}

/**
 * The builder returned by `action(name)`: declare metadata (`.describe(…)`), events
 * (`.emits<…>()`), an imperative handle (`.ref<…>()`), and/or pin the args type
 * (`.args(schema)`), then bind the impl with `.run(…)`. `.run` returns a callable
 * {@link Action} — **invoking it launches** the action under the ambient current node
 * and returns the live {@link Activity}, on which `withCache`/`tag`/… chain.
 */
class Builder<
  Events extends object,
  Handle,
  Summary extends string = string,
> implements ActionBuilderEvents<Events, Handle, Summary> {
  constructor(
    private readonly name: string,
    /** Carried across `.emits()`/`.ref()`, which otherwise rebuild the builder. */
    private description: OmDescription | undefined = undefined,
    /** Carried the same way, for the same reason. */
    private exposure: ResolvedMcpExposure | undefined = undefined
  ) {}

  describe<const D extends string>(
    description: OmDescription & { summary: D }
  ): ActionBuilderEvents<Events, Handle, OneLine<D>> {
    this.description = normalizeDescription(description);
    // Only the type changes: the summary literal rides along for editor hovers.
    return this as unknown as ActionBuilderEvents<Events, Handle, OneLine<D>>;
  }

  mcp(exposure: McpExposure = {}): ActionBuilderEvents<Events, Handle, Summary> {
    // The default is filled here, not at the reader, so every consumer sees one shape.
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }

  emits<E extends object>(): ActionBuilderEvents<E, Handle, Summary> {
    return new Builder<E, Handle, Summary>(this.name, this.description, this.exposure);
  }

  ref<H>(): ActionBuilderEvents<Events, H, Summary> {
    return new Builder<Events, H, Summary>(this.name, this.description, this.exposure);
  }

  args<S extends ZodTypeLike>(schema: S): ActionBuilderArgs<S, Events, Handle, Summary> {
    return new ArgsBuilder<S, Events, Handle, Summary>(
      this.name,
      schema,
      this.description,
      this.exposure
    );
  }

  run<Args extends unknown[], Result>(
    body: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle, Summary> {
    const name = this.name;
    // Carried onto the definition for `omkit ls` and the MCP server; not read by the runtime.
    const description = this.description;
    const mcp = this.exposure;
    const definedAt = callerSite(); // the `.run(...)` call site — where this action lives
    // No `.args()` on this path, so there is nothing to describe — or to resolve against.
    const describeArgs = (): DescribedArgs => describeSchema(undefined);
    const parseArgs = (supplied: unknown): unknown => supplied;
    const meta: ActionMeta = {
      ...(description === undefined ? {} : { description }),
      ...(mcp === undefined ? {} : { mcp }),
    };
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: Args): Activity<Result, Events, Handle, Summary> => {
      // where this launch was written — for a battery, the user's call rather than its definition
      const calledAt = takeHandedSite() ?? callerSite();
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt, calledAt, meta };
      return ExecutionTree.require().launch(spec) as unknown as Activity<
        Result,
        Events,
        Handle,
        Summary
      >;
    };
    return Object.assign(create, {
      actionName: name,
      definedAt,
      description,
      mcp,
      describeArgs,
      parseArgs,
    });
  }
}

/**
 * The builder after `.args(schema)`. The schema pins `.run`'s parameter type; launching is
 * not validated — an action invoked from an om body is passed its args directly in code,
 * and the type already holds. The one untyped caller is the MCP action host, which hands
 * the JSON it was sent through `parseArgs` first, so defaults and validation come from
 * this same schema rather than from nothing.
 */
class ArgsBuilder<
  S extends ZodTypeLike,
  Events extends object,
  Handle,
  Summary extends string = string,
> implements ActionBuilderArgs<S, Events, Handle, Summary> {
  constructor(
    private readonly name: string,
    /** `S` pins `.run`'s parameter; the value backs `describeArgs` and `parseArgs`. */
    private readonly schema: S,
    private description: OmDescription | undefined,
    private exposure: ResolvedMcpExposure | undefined
  ) {}

  describe<const D extends string>(
    description: OmDescription & { summary: D }
  ): ActionBuilderArgs<S, Events, Handle, OneLine<D>> {
    this.description = normalizeDescription(description);
    return this as unknown as ActionBuilderArgs<S, Events, Handle, OneLine<D>>;
  }

  mcp(exposure: McpExposure = {}): ActionBuilderArgs<S, Events, Handle, Summary> {
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }

  emits<E extends object>(): ActionBuilderArgs<S, E, Handle, Summary> {
    return new ArgsBuilder<S, E, Handle, Summary>(
      this.name,
      this.schema,
      this.description,
      this.exposure
    );
  }

  ref<H>(): ActionBuilderArgs<S, Events, H, Summary> {
    return new ArgsBuilder<S, Events, H, Summary>(
      this.name,
      this.schema,
      this.description,
      this.exposure
    );
  }

  run<Result>(
    body: (ctx: ActionContext<Events, Handle>, args: InferSchema<S>) => Awaitable<Result>
  ): Action<[InferSchema<S>], Result, Events, Handle, Summary> {
    const name = this.name;
    // Carried onto the definition for `omkit ls` and the MCP server; not read by the runtime.
    const description = this.description;
    const mcp = this.exposure;
    const definedAt = callerSite();
    // The schema is captured so the conversion happens in *this* copy of omkit — the one
    // that built it — rather than in whichever copy the discovery child is running.
    const schema = this.schema;
    const describeArgs = (): DescribedArgs => describeSchema(schema);
    const meta: ActionMeta = {
      ...(description === undefined ? {} : { description }),
      ...(mcp === undefined ? {} : { mcp }),
      describeArgs,
    };
    // `safeParse` is what applies `.default()`s, so this is where an advertised default
    // becomes the effective one. A refusal names the action and every failing field.
    const parseArgs = (supplied: unknown): unknown => {
      const parsed = schema.safeParse(supplied);
      if (parsed.success) return parsed.data;
      throw new Error(`invalid args for ${name}: ${formatIssues(parsed.error)}`);
    };
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: [InferSchema<S>]): Activity<Result, Events, Handle, Summary> => {
      // where this launch was written — for a battery, the user's call rather than its definition
      const calledAt = takeHandedSite() ?? callerSite();
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt, calledAt, meta };
      return ExecutionTree.require().launch(spec) as unknown as Activity<
        Result,
        Events,
        Handle,
        Summary
      >;
    };
    return Object.assign(create, {
      actionName: name,
      definedAt,
      description,
      mcp,
      describeArgs,
      parseArgs,
    });
  }
}

/**
 * Define an action. Provide the impl via `.run(…)`, optionally after declaring
 * metadata (`.describe(…)`), events (`.emits<…>()`), an imperative handle
 * (`.ref<…>()`), and/or pinning the args type (`.args(schema)`). Call the result
 * to launch it.
 */
export function action(name: string): ActionBuilderEvents<NoEvents, void> {
  return new Builder<NoEvents, void>(name);
}
