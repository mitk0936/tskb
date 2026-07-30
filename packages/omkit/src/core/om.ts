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
 * Define a run. `om(name)` returns a builder — chain `.describe(…)` and finish with
 * `.run(body)`, which launches it as the root of a fresh {@link ExecutionTree}. The name
 * plus the absolute path of the calling file identify the run; its log folder is
 * `logs/<name>-<hash8>/…`, so same-named oms in different files never share a folder.
 *
 * The call site is captured **here**, not in `.run()`: `om(name)` is where a run is
 * defined, so a builder handed to (and run from) another file still hashes to the file
 * that defined it — see the run-folder-identity constraint doc.
 */
export function om(name: string): OmBuilder {
  assertName(name);
  // The removed two-argument form: JS callers would otherwise silently lose their body
  // to a builder nobody runs. TypeScript callers get a compile error before this.
  if (arguments.length > 1) {
    throw new Error(
      "om(name, body) was removed — use om(name).run(body). See the omkit CHANGELOG."
    );
  }
  return new Builder(name, callerSite()); // the om() call site — the run's defining script
}
