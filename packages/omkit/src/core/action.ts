import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import { describeSchema } from "./discovery-mode.ts";
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
    // No `.args()` on this path, so there is nothing to describe.
    const describeArgs = (): DescribedArgs => describeSchema(undefined);
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
    });
  }
}

/**
 * The builder after `.args(schema)`. The schema pins `.run`'s parameter type; it is not
 * validated here — an action invoked from an om body is passed its args directly in code.
 * (Spec B's MCP server validates before it ever reaches this point.)
 */
class ArgsBuilder<
  S extends ZodTypeLike,
  Events extends object,
  Handle,
> implements ActionBuilderArgs<S, Events, Handle> {
  constructor(
    private readonly name: string,
    /** Type-level only: `S` pins `.run`'s parameter. Nothing reads the value at runtime. */
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
