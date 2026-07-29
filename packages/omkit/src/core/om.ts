import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import type { Awaitable, Exec, OmContext } from "./types.ts";

/**
 * Runs a linear orchestration as the root of a fresh {@link ExecutionTree}. The
 * required `name` plus the absolute path of the file calling `om()` form the run's
 * identity — its log folder is `logs/<name>-<hash8>/…`, so same-named oms defined
 * in different files never share a folder. The body runs inside the root node's
 * ambient scope, so any action call / `step(...)` / `console.*` it reaches
 * attributes correctly. Resolves once the run has torn down and produced its
 * artifacts; never rejects (failures are recorded in the tree and set the exit code).
 */
export function om(name: string, body: (ctx: OmContext) => Awaitable<void>): Promise<void> {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("om(name, body) requires a non-empty name — it identifies the run in logs/");
  }
  if (ExecutionTree.current) {
    throw new Error("an om() run is already active in this process");
  }
  const tree = new ExecutionTree(name, callerSite()); // callerSite: where om() was called — the run's script
  ExecutionTree.current = tree;

  const rootBody: Exec<object, unknown, unknown> = (ctx) =>
    body({
      signal: ctx.signal,
      logs: ctx.logs,
      tag: ctx.tag,
      cancel: () => tree.cancel(),
      assert: ctx.assert,
      snapshot: ctx.snapshot,
      artifact: ctx.artifact,
      artifactsFolder: ctx.artifactsFolder,
    });

  return tree.runRoot(rootBody);
}
