import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import type {
  Action,
  ActionBuilderEvents,
  ActionContext,
  Activity,
  Awaitable,
  Exec,
  LaunchSpec,
  NoEvents,
} from "./types.ts";

/**
 * The builder returned by `action(name)`: declare events (`.emits<…>()`) and/or an
 * imperative handle (`.ref<…>()`), then bind the impl with `.run(…)`. `.run` returns a
 * callable {@link Action} — **invoking it launches** the action under the ambient current
 * node and returns the live {@link Activity}, on which `withCache`/`tag`/… chain.
 */
class Builder<Events extends object, Handle> implements ActionBuilderEvents<Events, Handle> {
  constructor(private readonly name: string) {}

  emits<E extends object>(): ActionBuilderEvents<E, Handle> {
    return new Builder<E, Handle>(this.name);
  }

  ref<H>(): ActionBuilderEvents<Events, H> {
    return new Builder<Events, H>(this.name);
  }

  run<Args extends unknown[], Result>(
    body: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle> {
    const name = this.name;
    const definedAt = callerSite(); // the `.run(...)` call site — where this action lives
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: Args): Activity<Result, Events, Handle> => {
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt };
      return ExecutionTree.require().launch(spec) as unknown as Activity<Result, Events, Handle>;
    };
    return Object.assign(create, { actionName: name, definedAt });
  }
}

/**
 * Define an action. Provide the impl via `.run(…)`, optionally after declaring
 * events (`.emits<…>()`) and/or an imperative handle (`.ref<…>()`). Call the result
 * to launch it.
 */
export function action(name: string): ActionBuilderEvents<NoEvents, void> {
  return new Builder<NoEvents, void>(name);
}
