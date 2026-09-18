import { ExecutionTree } from "./ExecutionTree.ts";
import { callerSite, siteFile } from "../foundation/callsite.ts";
import { describeSchema, isDiscovering, reportOm } from "./discovery-mode.ts";
import { activeSupervisor } from "./interaction.ts";
import { jsonAnswerComplete, resolveArgs, type AskSpec } from "./args.ts";
import { OPAQUE } from "./schema-hint.ts";
import type {
  Awaitable,
  Exec,
  InferSchema,
  McpExposure,
  OmBuilder,
  OmBuilderArgs,
  OmContext,
  OmDescription,
  ResolvedMcpExposure,
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
  description: OmDescription | undefined,
  exposure: ResolvedMcpExposure | undefined,
  body: (ctx: OmContext) => Awaitable<void>,
  schema?: unknown
): Promise<void> {
  // Discovery: report what this om declares and start nothing.
  //
  // The guard belongs *here*, at the single choke point both `run()` methods funnel
  // through, for two reasons. `OmBuilderArgs.run` resolves args inside the run body, so a
  // guard one level up would reach `resolveArgs` first and prompt into a child nobody can
  // answer (or throw MissingArgsError) — neither is a discovery outcome. And
  // `new ExecutionTree(...)` creates the run's log folder in its constructor, so the
  // guard has to precede it or discovery litters `logs/` with empty runs.
  if (isDiscovering()) {
    const { inputSchema, schemaError } = describeSchema(schema);
    reportOm({
      kind: "om-registration",
      name,
      file: siteFile(site),
      description,
      mcp: exposure,
      inputSchema,
      schemaError,
    });
    return Promise.resolve();
  }

  if (ExecutionTree.current) {
    throw new Error("an om() run is already active in this process");
  }
  const tree = new ExecutionTree(name, site, description, exposure);
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
  /** Carried the same way, for the same reason — `.args()` returns a new object. */
  private exposure: ResolvedMcpExposure | undefined;

  constructor(
    private readonly name: string,
    /** Captured in `om()`, not here — the defining file must be the caller's, not om.ts. */
    private readonly site: string | undefined
  ) {}

  describe(description: OmDescription): OmBuilder {
    this.description = description;
    return this;
  }

  mcp(exposure: McpExposure = {}): OmBuilder {
    // The default is filled here, not at the reader, so every consumer sees one shape.
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }

  args<S extends ZodTypeLike>(schema: S): OmBuilderArgs<S> {
    return new ArgsBuilder<S>(this.name, this.site, schema, this.description, this.exposure);
  }

  run(body: (ctx: OmContext) => Awaitable<void>): Promise<void> {
    // Carried onto the run for `omkit ls` and the MCP server; not read by the runtime yet.
    return launch(this.name, this.site, this.description, this.exposure, body);
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
    private description: OmDescription | undefined,
    private exposure: ResolvedMcpExposure | undefined
  ) {}

  describe(description: OmDescription): OmBuilderArgs<S> {
    this.description = description;
    return this;
  }

  mcp(exposure: McpExposure = {}): OmBuilderArgs<S> {
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }

  run(body: (ctx: OmContext, args: InferSchema<S>) => Awaitable<void>): Promise<void> {
    // Resolution happens inside the run, not before it: prompting is async, and the run
    // must already exist for the prompt and its answer to land on the timeline. A failure
    // to resolve is therefore an ordinary failure of the root node — logged, and the run
    // is marked failed — rather than a throw out of `om(...)`.
    return launch(
      this.name,
      this.site,
      this.description,
      this.exposure,
      async (ctx) => {
        const args = (await resolveArgs(this.schema, {
          supplied: parseSuppliedArgs(),
          interactive: isInteractive(),
          ask: askForArg,
        })) as InferSchema<S>;
        ExecutionTree.current?.setRootArgs(args);
        await body(ctx, args);
      },
      // Handed to `launch` for discovery only: in a real run the schema is resolved above,
      // inside the body. Discovery never reaches that body, so it converts the schema here.
      this.schema
    );
  }
}

/** `OMKIT_ARGS` carries JSON — the only channel readable synchronously at `.run()`. */
function parseSuppliedArgs(): unknown {
  const raw = process.env.OMKIT_ARGS;
  // Read it once, then clear it from the environment so any subprocess this run spawns
  // (`command("npx omkit run other-om")`, a nested npm script, …) does not inherit this
  // run's args and resolve them against a completely different schema. Whoever launches an
  // omkit child sets that child's args explicitly.
  delete process.env.OMKIT_ARGS;
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
 * Ask the user for one arg, via the `prompt` battery.
 *
 * The import is dynamic so that `import { om }` does not pull readline in, and because
 * `core` is otherwise not allowed to import `actions`. Be clear about what that costs: this
 * is a **deliberate, unenforced** runtime edge, not a permitted one. ESLint's
 * `no-restricted-imports` has no `ImportExpression` visitor, so a dynamic import is
 * *invisible* to the rule rather than allowed by it — the linter will not catch the next one
 * either, and nothing but this comment stands between here and a real dependency cycle.
 */
async function askForArg(spec: AskSpec): Promise<string> {
  const { prompt } = await import("../actions/prompt.ts");
  if (spec.kind === "json") {
    return prompt({
      kind: "multiline",
      message: `${spec.path} — JSON`,
      // No sketch means `shapeHint` could not express the shape; a placeholder would tell
      // the user nothing about what to type, so the schema itself goes in its place.
      hint: spec.hint ?? JSON.stringify(spec.jsonSchema),
      // Not `"json"`: a JSON-kind arg may also be answered with the path to a JSON file, and
      // a path is not JSON, so a JSON-only terminator would never end the read. At a bare
      // terminal there is no EOF to fall back on, so the user would wait out the timeout —
      // three times. This is the same rule `coerce` reads the answer back with.
      until: jsonAnswerComplete,
      timeoutMs: 120_000,
    }).result;
  }
  // One line has no room for a raw schema, so an unsketchable scalar shows the placeholder.
  return prompt({ message: `${spec.path} (${spec.hint ?? OPAQUE})`, timeoutMs: 120_000 }).result;
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
