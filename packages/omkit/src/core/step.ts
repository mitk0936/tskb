import { callerSite } from "../foundation/callsite.ts";
import { ExecutionTree } from "./ExecutionTree.ts";
import type { ActionContext, Awaitable, Exec, LaunchSpec } from "./types.ts";

/**
 * An inline anonymous action: creates a child node under the ambient current
 * action and runs `fn` as that node — own id/path/log, tags, error boundary — with
 * no reusable definition. `await step("seed-db", async () => …)` resolves the
 * result (throws on failure/cancel). For reusable, typed, event/handle-bearing
 * units use `action(...)`.
 */
export function step<Result>(
  name: string,
  fn: (ctx: ActionContext) => Awaitable<Result>
): Promise<Result> {
  // An inline action is defined where it is written — the `step(...)` call — so that is its
  // site, not this file (which is what routing through `action(name).run(fn)` would record).
  const site = callerSite();
  const spec: LaunchSpec = {
    name,
    args: [],
    tags: [],
    body: fn as unknown as Exec<object, unknown, unknown>,
    definedAt: site,
    calledAt: site,
    meta: { inline: true },
  };
  // `.result` already resolves the value and rejects on failure/cancel — exactly step's contract.
  return ExecutionTree.require().launch(spec).result as Promise<Result>;
}
