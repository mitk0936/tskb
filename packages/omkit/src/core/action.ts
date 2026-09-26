import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import { describeSchema } from "./discovery-mode.ts";
import { formatIssues } from "./args.ts";
import type {
  Action,
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
  ResolvedMcpExposure,
  ZodTypeLike,
} from "./types.ts";

/**
 * The builder returned by `action(name)`: declare metadata (`.describe(…)`), events
 * (`.emits<…>()`), an imperative handle (`.ref<…>()`), and/or pin the args type
 * (`.args(schema)`), then bind the impl with `.run(…)`. `.run` returns a callable
 * {@link Action} — **invoking it launches** the action under the ambient current node
 * and returns the live {@link Activity}, on which `withCache`/`tag`/… chain.
 */
class Builder<Events extends object, Handle> implements ActionBuilderEvents<Events, Handle> {
  constructor(
    private readonly name: string,
    /** Carried across `.emits()`/`.ref()`, which otherwise rebuild the builder. */
    private description: OmDescription | undefined = undefined,
    /** Carried the same way, for the same reason. */
    private exposure: ResolvedMcpExposure | undefined = undefined
  ) {}

  describe(description: OmDescription): ActionBuilderEvents<Events, Handle> {
    this.description = description;
    return this;
  }

  mcp(exposure: McpExposure = {}): ActionBuilderEvents<Events, Handle> {
    // The default is filled here, not at the reader, so every consumer sees one shape.
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }

  emits<E extends object>(): ActionBuilderEvents<E, Handle> {
    return new Builder<E, Handle>(this.name, this.description, this.exposure);
  }

  ref<H>(): ActionBuilderEvents<Events, H> {
    return new Builder<Events, H>(this.name, this.description, this.exposure);
  }

  args<S extends ZodTypeLike>(schema: S): ActionBuilderArgs<S, Events, Handle> {
    return new ArgsBuilder<S, Events, Handle>(this.name, schema, this.description, this.exposure);
  }

  run<Args extends unknown[], Result>(
    body: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle> {
    const name = this.name;
    // Carried onto the definition for `omkit ls` and the MCP server; not read by the runtime.
    const description = this.description;
    const mcp = this.exposure;
    const definedAt = callerSite(); // the `.run(...)` call site — where this action lives
    // No `.args()` on this path, so there is nothing to describe — or to resolve against.
    const describeArgs = (): DescribedArgs => describeSchema(undefined);
    const parseArgs = (supplied: unknown): unknown => supplied;
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: Args): Activity<Result, Events, Handle> => {
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt };
      return ExecutionTree.require().launch(spec) as unknown as Activity<Result, Events, Handle>;
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
> implements ActionBuilderArgs<S, Events, Handle> {
  constructor(
    private readonly name: string,
    /** `S` pins `.run`'s parameter; the value backs `describeArgs` and `parseArgs`. */
    private readonly schema: S,
    private description: OmDescription | undefined,
    private exposure: ResolvedMcpExposure | undefined
  ) {}

  describe(description: OmDescription): ActionBuilderArgs<S, Events, Handle> {
    this.description = description;
    return this;
  }

  mcp(exposure: McpExposure = {}): ActionBuilderArgs<S, Events, Handle> {
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }

  run<Result>(
    body: (ctx: ActionContext<Events, Handle>, args: InferSchema<S>) => Awaitable<Result>
  ): Action<[InferSchema<S>], Result, Events, Handle> {
    const name = this.name;
    // Carried onto the definition for `omkit ls` and the MCP server; not read by the runtime.
    const description = this.description;
    const mcp = this.exposure;
    const definedAt = callerSite();
    // The schema is captured so the conversion happens in *this* copy of omkit — the one
    // that built it — rather than in whichever copy the discovery child is running.
    const schema = this.schema;
    const describeArgs = (): DescribedArgs => describeSchema(schema);
    // `safeParse` is what applies `.default()`s, so this is where an advertised default
    // becomes the effective one. A refusal names the action and every failing field.
    const parseArgs = (supplied: unknown): unknown => {
      const parsed = schema.safeParse(supplied);
      if (parsed.success) return parsed.data;
      throw new Error(`invalid args for ${name}: ${formatIssues(parsed.error)}`);
    };
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: [InferSchema<S>]): Activity<Result, Events, Handle> => {
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt };
      return ExecutionTree.require().launch(spec) as unknown as Activity<Result, Events, Handle>;
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
