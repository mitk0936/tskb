import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite } from "../foundation/callsite.ts";
import { activeSupervisor } from "./interaction.ts";
import { resolveArgs, type AskSpec } from "./args.ts";
import { OPAQUE } from "./schema-hint.ts";
import type {
  Awaitable,
  Exec,
  InferSchema,
  OmBuilder,
  OmBuilderArgs,
  OmContext,
  OmDescription,
  ZodTypeLike,
} from "./types.ts";

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
  /** Carried into `ArgsBuilder` by `.args()`, which otherwise rebuilds the builder. */
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

  args<S extends ZodTypeLike>(schema: S): OmBuilderArgs<S> {
    return new ArgsBuilder<S>(this.name, this.site, schema, this.description);
  }

  run(body: (ctx: OmContext) => Awaitable<void>): Promise<void> {
    void this.description; // carried for `omkit ls` and Spec B; not read by the runtime yet
    return launch(this.name, this.site, body);
  }
}

/**
 * The builder after `.args(schema)`. Unlike an action's, the schema here is live: `.run`
 * resolves it before calling the body, so an om declares what it needs and omkit fills it
 * in. The site is the one `om()` captured — threaded through, never re-taken.
 */
class ArgsBuilder<S extends ZodTypeLike> implements OmBuilderArgs<S> {
  constructor(
    private readonly name: string,
    private readonly site: string | undefined,
    private readonly schema: S,
    private description: OmDescription | undefined
  ) {}

  describe(description: OmDescription): OmBuilderArgs<S> {
    this.description = description;
    return this;
  }

  run(body: (ctx: OmContext, args: InferSchema<S>) => Awaitable<void>): Promise<void> {
    void this.description; // carried for `omkit ls` and Spec B; not read by the runtime yet
    // Resolution happens inside the run, not before it: prompting is async, and the run
    // must already exist for the prompt and its answer to land on the timeline. A failure
    // to resolve is therefore an ordinary failure of the root node — logged, and the run
    // is marked failed — rather than a throw out of `om(...)`.
    return launch(this.name, this.site, async (ctx) => {
      const args = (await resolveArgs(this.schema, {
        supplied: parseSuppliedArgs(),
        interactive: isInteractive(),
        ask: askForArg,
      })) as InferSchema<S>;
      ExecutionTree.current?.setRootArgs(args);
      await body(ctx, args);
    });
  }
}

/** `OMKIT_ARGS` carries JSON — the only channel readable synchronously at `.run()`. */
function parseSuppliedArgs(): unknown {
  const raw = process.env.OMKIT_ARGS;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("OMKIT_ARGS is not valid JSON");
  }
}

/**
 * Supervised, or a real terminal. Otherwise nobody can answer a prompt and resolution must
 * fail fast instead of blocking on a question no one will see.
 */
function isInteractive(): boolean {
  return activeSupervisor() !== null || process.stdin.isTTY === true;
}

/**
 * Ask the user for one arg, via the `prompt` battery. Imported lazily because `core` may
 * not import `actions` (an eslint layer boundary, and it keeps `import { om }` from pulling
 * readline in): the edge only exists when a run actually needs to prompt.
 */
async function askForArg(spec: AskSpec): Promise<string> {
  const { prompt } = await import("../actions/prompt.ts");
  if (spec.kind === "json") {
    return prompt({
      kind: "multiline",
      message: `${spec.path} — JSON`,
      // A degraded sketch tells the user nothing about what to type, so when `shapeHint`
      // gives up the schema itself goes in its place.
      hint: spec.hint === OPAQUE ? JSON.stringify(spec.jsonSchema) : spec.hint,
      until: "json",
      timeoutMs: 120_000,
    }).result;
  }
  return prompt({ message: `${spec.path} (${spec.hint})`, timeoutMs: 120_000 }).result;
}

/**
 * Define a run. `om(name)` returns a builder — chain `.describe(…)` and/or `.args(schema)`
 * and finish with `.run(body)`, which launches it as the root of a fresh
 * {@link ExecutionTree}. The name plus the absolute path of the calling file identify the
 * run; its log folder is `logs/<name>-<hash8>/…`, so same-named oms in different files
 * never share a folder.
 *
 * The call site is captured **here**, not in `.run()` (nor in `.args()`): `om(name)` is
 * where a run is defined, so a builder handed to (and run from) another file still hashes
 * to the file that defined it — see the run-folder-identity constraint doc.
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
