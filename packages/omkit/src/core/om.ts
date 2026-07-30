import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import type { Awaitable, Exec, OmBuilder, OmContext, OmDescription } from "./types.ts";

function assertName(name: string): void {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("om(name) requires a non-empty name — it identifies the run in logs/");
  }
}

/** Start the run: build the tree with the captured site and drive the body as the root. */
function launch(
  name: string,
  site: string | undefined,
  body: (ctx: OmContext) => Awaitable<void>
): Promise<void> {
  if (ExecutionTree.current) {
    throw new Error("an om() run is already active in this process");
  }
  const tree = new ExecutionTree(name, site);
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

class Builder implements OmBuilder {
  private description: OmDescription | undefined;

  constructor(
    private readonly name: string,
    /** Captured in `om()`, not here — the defining file must be the caller's, not om.ts. */
    private readonly site: string | undefined
  ) {}

  describe(description: OmDescription): OmBuilder {
    this.description = description;
    return this;
  }

  run(body: (ctx: OmContext) => Awaitable<void>): Promise<void> {
    void this.description; // carried for `omkit ls` and Spec B; not read by the runtime yet
    return launch(this.name, this.site, body);
  }
}

/**
 * Start a run via the builder form: chain `.describe(…)` then finish with `.run(body)`,
 * which launches the run exactly like `om(name, body)`. The name plus the absolute path
 * of the file calling `om()` form the run's identity — its log folder is
 * `logs/<name>-<hash8>/…` — captured once here (not inside `.run()`), so both call
 * forms hash identically and migrating a call site never moves its run folder.
 */
export function om(name: string): OmBuilder;
/**
 * Runs a linear orchestration as the root of a fresh {@link ExecutionTree}. The
 * required `name` plus the absolute path of the file calling `om()` form the run's
 * identity — its log folder is `logs/<name>-<hash8>/…`, so same-named oms defined
 * in different files never share a folder. The body runs inside the root node's
 * ambient scope, so any action call / `step(...)` / `console.*` it reaches
 * attributes correctly. Resolves once the run has torn down and produced its
 * artifacts; never rejects (failures are recorded in the tree and set the exit code).
 */
export function om(name: string, body: (ctx: OmContext) => Awaitable<void>): Promise<void>;
export function om(
  name: string,
  body?: (ctx: OmContext) => Awaitable<void>
): OmBuilder | Promise<void> {
  assertName(name);
  const site = callerSite(); // the om() call site — the run's defining script
  return body === undefined ? new Builder(name, site) : launch(name, site, body);
}
