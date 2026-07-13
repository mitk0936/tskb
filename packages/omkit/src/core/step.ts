import { action } from "./action.ts";
import type { ActionContext, Awaitable } from "./types.ts";

/**
 * An inline anonymous action: creates a child node under the ambient current
 * action and runs `fn` as that node — own id/path/log, tags, error boundary — with
 * no reusable definition. `await step("seed-db", async () => …)` resolves the
 * result (rejects on failure/cancel). For reusable, typed, event/handle-bearing
 * units use `action(...)`.
 */
export function step<Result>(
  name: string,
  fn: (ctx: ActionContext) => Awaitable<Result>
): Promise<Result> {
  return action(name)
    .run(fn as (ctx: ActionContext) => Awaitable<Result>)()
    .exec().done;
}
