import { ExecutionTree } from "./ExecutionTree.ts";
import { FolderCache } from "../system/fs/FolderCache.ts";
import { callerSite } from "../foundation/callsite.ts";
import type {
  Action,
  ActionBuilderEvents,
  ActionContext,
  ActionInstance,
  Awaitable,
  Exec,
  LaunchSpec,
  NoEvents,
  RunHandle,
} from "./types.ts";

/**
 * A constructed-but-not-yet-run action. Inert: it only holds the name, body, args,
 * and any tags buffered before launch. `exec()` hands it to the tree, which creates
 * the node under the ambient current action and runs it.
 */
class Instance<Result, Events extends object, Handle>
  implements ActionInstance<Result, Events, Handle>, LaunchSpec
{
  readonly tags: string[] = [];

  constructor(
    readonly name: string,
    readonly body: Exec<object, unknown, unknown>,
    readonly args: readonly unknown[],
    readonly definedAt: string | undefined
  ) {}

  tag(name: string): this {
    this.tags.push(name);
    return this;
  }

  withCache(...paths: string[]): ActionInstance<Result | undefined, Events, Handle> {
    // Validate + canonicalize eagerly here (fails fast on a relative path).
    const targets = FolderCache.resolvePaths(paths);
    const innerBody = this.body;
    const innerArgs = this.args;
    // Wrap in a fresh instance that keeps this action's name/tags and, at run time,
    // fingerprints the inputs — skipping (return undefined) on a hit, else running
    // the inner body and recording the fingerprint on success.
    const body = (async (ctx: never, ...args: never[]): Promise<Result | undefined> => {
      const fp = await FolderCache.fingerprint(targets);
      if ((await FolderCache.read(targets)) === fp) {
        console.log("cached, skipping");
        return undefined;
      }
      const result = (await innerBody(ctx, ...args)) as Result;
      await FolderCache.write(targets, fp);
      return result;
    }) as Exec<object, unknown, unknown>;
    const cached = new Instance<Result | undefined, Events, Handle>(
      this.name,
      body,
      innerArgs,
      this.definedAt
    );
    cached.tags.push(...this.tags);
    return cached;
  }

  exec(): RunHandle<Result, Events, Handle> {
    return ExecutionTree.require().launch(this) as unknown as RunHandle<Result, Events, Handle>;
  }
}

/** The builder returned by `action(name)`: declare events/handle, then bind the impl. */
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
    const create = (...args: Args): ActionInstance<Result, Events, Handle> =>
      new Instance<Result, Events, Handle>(
        name,
        body as unknown as Exec<object, unknown, unknown>,
        args,
        definedAt
      );
    return Object.assign(create, { actionName: name, definedAt });
  }
}

/**
 * Define an action. Provide the impl via `.run(…)`, optionally after declaring
 * events (`.emits<…>()`) and/or an imperative handle (`.ref<…>()`).
 */
export function action(name: string): ActionBuilderEvents<NoEvents, void> {
  return new Builder<NoEvents, void>(name);
}
