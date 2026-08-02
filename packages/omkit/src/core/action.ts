import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import type {
  Action,
  ActionBuilderArgs,
  ActionBuilderEvents,
  ActionContext,
  Activity,
  Awaitable,
  Exec,
  InferSchema,
  LaunchSpec,
  NoEvents,
  OmDescription,
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
    private description: OmDescription | undefined = undefined
  ) {}

  describe(description: OmDescription): ActionBuilderEvents<Events, Handle> {
    this.description = description;
    return this;
  }

  emits<E extends object>(): ActionBuilderEvents<E, Handle> {
    return new Builder<E, Handle>(this.name, this.description);
  }

  ref<H>(): ActionBuilderEvents<Events, H> {
    return new Builder<Events, H>(this.name, this.description);
  }

  args<S extends ZodTypeLike>(schema: S): ActionBuilderArgs<S, Events, Handle> {
    return new ArgsBuilder<S, Events, Handle>(this.name, schema, this.description);
  }

  run<Args extends unknown[], Result>(
    body: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle> {
    const name = this.name;
    // Carried onto the definition for `omkit ls` and Spec B; not read by the runtime yet.
    const description = this.description;
    const definedAt = callerSite(); // the `.run(...)` call site — where this action lives
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: Args): Activity<Result, Events, Handle> => {
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt };
      return ExecutionTree.require().launch(spec) as unknown as Activity<Result, Events, Handle>;
    };
    return Object.assign(create, { actionName: name, definedAt, description });
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
    private description: OmDescription | undefined
  ) {}

  describe(description: OmDescription): ActionBuilderArgs<S, Events, Handle> {
    this.description = description;
    return this;
  }

  run<Result>(
    body: (ctx: ActionContext<Events, Handle>, args: InferSchema<S>) => Awaitable<Result>
  ): Action<[InferSchema<S>], Result, Events, Handle> {
    const name = this.name;
    // Carried onto the definition for `omkit ls` and Spec B; not read by the runtime yet.
    const description = this.description;
    const definedAt = callerSite();
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: [InferSchema<S>]): Activity<Result, Events, Handle> => {
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt };
      return ExecutionTree.require().launch(spec) as unknown as Activity<Result, Events, Handle>;
    };
    return Object.assign(create, { actionName: name, definedAt, description });
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
