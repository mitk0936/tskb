# omkit MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a project's opted-in omkit oms and actions over the Model Context Protocol so an assistant can list them, run one, get a structured verdict, and read the run's artifacts.

**Architecture:** A new `packages/omkit/src/mcp/` boundary sits beside the CLI as a third frontend over the existing `OmkitClient`. Metadata that only exists after a module is imported (`.describe()`, `.args(schema)`, `.mcp()`) is read by a throwaway child fork running in **discovery mode**, where `launch()` posts a registration over IPC instead of starting a run. The MCP server itself adds no runtime primitives.

**Tech Stack:** TypeScript (NodeNext ESM), `@modelcontextprotocol/sdk` ^1.30.0, zod ^4.4.3, vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-07-29-omkit-mcp-server-design.md` (Spec B).

## Global Constraints

Every task's requirements implicitly include this section.

1. **Node >= 20.11, ESM, NodeNext.** `allowImportingTsExtensions` is on: every relative import ends in `.ts`. `verbatimModuleSyntax` is on: type-only imports use `import type`.
2. **`@modelcontextprotocol/sdk` is imported only under `src/mcp/`.** Nothing in `core/`, `client/`, `output/`, `actions/`, or `cli/` may import it. Pin `^1.30.0`.
3. **stdout is the MCP wire.** No code reachable from `omkit mcp` may write to stdout — not `console.log`, not a banner, not a spinner. Diagnostics go to `process.stderr`. A single stray stdout write corrupts the JSON-RPC stream.
4. **Run identity is a contract.** A run folder is `logs/<fsSafe(name)>-<omHash(name, definingFile)>/<date>/<time>/`. Never derive it from `process.argv`, an entry script, or a new hash function. See `docs/src/omkit/run-folder-identity.tskb.tsx`.
5. **`discover()` stays AST-only and instant.** It must never import user code. `omkit ls` must not get slower. Registration reading is a separate function.
6. **Failure stays soft.** A user file that throws on import becomes a warning; every other file still registers. Only a fatal config problem throws.
7. **Schema conversion is isolated per entry.** `z.toJSONSchema` throws on `z.date()`, `z.custom()`, and anything built on them. One unconvertible schema degrades that one entry to "unavailable, with a reason" and never takes down the list.
8. **zod v4.4.3.** All zod → JSON Schema conversion goes through `toJsonSchema` in `core/schema-json.ts`, which uses `{ io: "input" }` so `.default()` fields are not `required`.
9. **Exposure is opt-in.** No `.mcp()` ⇒ invisible to the server. `.describe()` and `.args()` alone expose nothing.
10. **Tests live in `packages/omkit/tests/unit/`**, fixtures in `packages/omkit/tests/fixtures/`. Run with `npx vitest run <file>` from the repo root.
11. **Never skip hooks.** No `--no-verify`. The pre-commit hook runs `npm run format` → `npm run test` → `npm run build:docs` → `git add .`.
12. **A fixture that gets forked imports omkit relatively** (`../../../src/index.ts`), matching `tests/fixtures/run/hello.ts`. A fixture that gets AST-scanned imports the literal `"omkit"`, because `discovery.ts` matches that string. The two cannot be the same fixture — see Task 3.

## Deviations from Spec B

These are deliberate corrections found while checking the spec against shipped source. Implement the plan, not the spec text, where they differ.

- **D1 — run tools key on a `runId`, not a folder.** Spec B's `start_om` returns "run folder + run id, returned immediately". The dated folder (`<date>/<time>`) is stamped inside the child on first access, so the parent cannot know it before the run starts. Tools take `run`, which is either a server-assigned `runId` or a run-folder path already on disk. `list_oms` carries `folderName` (`<name>-<hash8>`), which _is_ derivable in the parent.
- **D2 — parent-side arg checking is a required-keys/type check, not full validation.** The declared schema lives in the child; the parent holds only its JSON Schema. Defaults are filled by Spec A's `resolveArgs` inside the run, and anything still missing surfaces as a prompt → elicitation, exactly as Spec B describes. The parent check exists to reject obviously-wrong calls fast, not to replace resolution.
- **D3 — action args travel in `OMKIT_ACTION_ARGS`.** The host om declares no `.args()`, so it never reads `OMKIT_ARGS`; using a distinct variable also stops a host run from colliding with an om's own args.
- **D4 — `list_oms` entries carry `kind` (`"om" | "action"`) and `folderName`.** `run_om`/`start_om` accept either kind by name; oms win a name collision.
- **D6 — runs are launched with `cwd` set to the project root, not the om file's directory.**
  `omkit run` uses `path.dirname(omFile)`, and Spec B's snippets copied that. But run
  folders are written relative to the child's cwd, while this server's resources resolve
  under `<root>/logs` — so copying `omkit run` here would write every run somewhere the
  same server cannot serve, and `get_run`'s resource links would point at nothing. Found
  by implementing Task 5; pinned by a test asserting the folder lands under `<root>/logs`.
- **D5 — registrations travel over IPC from `launch()`, not through a module-level array the child reads.** A user's file resolves `"omkit"` to the installed package while the discovery child runs omkit's own module graph, so the two can hold different copies. `process.send` is copy-independent; a shared module variable is not.

## Why this shape

Everything awkward in this design traces to one fact: **importing an om file runs it.**
`om("x").run(body)` executes at module load, by design (Spec A §1). So the metadata an
MCP client needs — the summary, the zod schema, whether the author exposed it — cannot be
read by importing the file, because importing it starts the thing.

The existing `discover()` sidesteps this by never importing: it is a pure TypeScript AST
scan that finds `om("name")` call expressions and reads the string literal
(`client/discovery.ts:38-51`). That is why `omkit ls` is instant. But an AST scan cannot
evaluate `z.object({...})` into a JSON Schema, and it cannot see a `.describe()` value
that only exists once the module has run.

Hence the fork. A throwaway child with `OMKIT_DISCOVER=1` imports the candidate files;
`launch()` — the single function both `run()` methods funnel through — posts a
registration and returns instead of starting anything. The side effects are contained in
a process that exits immediately, and the parent gets real schemas.

Three consequences follow, and each is a place an implementer could plausibly go wrong:

1. **The guard belongs inside `launch()`, not in either `run()`.** `ArgsBuilder.run`
   calls `resolveArgs` _inside_ the run body (`core/om.ts:99-107`). A guard one level up
   would reach argument resolution first, so discovering an om with a required arg would
   either prompt into a child nobody can answer or throw `MissingArgsError` — neither is
   a discovery outcome. It must also fire before `new ExecutionTree(...)`, whose
   constructor calls `folder.ensure()` and creates a real directory: guard too late and
   every `list_oms` litters `logs/` with empty runs.
2. **Nothing may depend on module-instance identity.** A user's file resolves `"omkit"`
   through `node_modules` to the installed `dist/`; the discovery child is omkit's own
   module graph. These are two module instances, each with its own copy of every
   module-level variable. A registration pushed into an array in one and read from the
   other would come back empty, with no error and no clue why. `process.send` is
   instance-independent; a shared variable is not. The same reasoning puts
   `describeArgs()` on the `Action` — the schema is converted by the copy that built it,
   so no zod object ever crosses the boundary.
3. **`discover()` does not change.** The fork is a separate function called only by the
   MCP server. `omkit ls` neither slows down nor starts executing user code.

## Known weak points

Named here so a reviewer does not have to rediscover them, and so nobody "fixes" one by
accident.

- **The action host is the one place that still depends on module-instance identity.**
  `ExecutionTree.current` is a static on the class. The host om calls `om(...)` from
  omkit's own `../index.ts`; the user's action file calls `ExecutionTree.require()`
  through whatever `"omkit"` resolves to for it. Those are the same file for a normal
  install and for the test fixtures, so it works — but under `npm link`, a non-hoisted
  pnpm layout, or two omkit versions in one tree, the action would throw "no active om()
  run". The failure is loud rather than silent, which is the saving grace. Task 10 must
  catch that specific error and re-throw it naming this cause, rather than letting the
  bare message reach a client that cannot possibly diagnose it.
- **`run_om`'s ten-minute backstop is longer than most MCP clients will wait.** Client
  timeouts are client-side and typically far shorter, and whether progress notifications
  extend them is implementation-dependent. The backstop is a server-side safety net so a
  mislabelled om cannot wedge the server — it is not a promise that the call will be
  awaited. Anything routinely over about a minute belongs in `start_om`; say so in the
  `run_om` description and in the README.
- **Action-backed tools have no consumer in this repo.** Of the two actions here,
  `inspectPage` takes a live Playwright `Page` handle and cannot be a tool at all, and
  `buildDocs` is already reachable through the `tskb:build` om. Task 10 is therefore
  built for projects other than this one. If the schedule tightens, it is the task to
  drop — nothing else depends on it.

## File Structure

**New — `packages/omkit/src/mcp/` (a new tskb boundary):**

| File             | Responsibility                                                                          |
| ---------------- | --------------------------------------------------------------------------------------- |
| `server.ts`      | Assembles the `McpServer`, registers tools and resources, binds stdio                   |
| `tools.ts`       | The six tools: registration entries → tool registrations                                |
| `resources.ts`   | Run folders → resources: URI templates, path confinement, size caps, MIME               |
| `runs.ts`        | `RunRegistry` — live sessions, their buffered log entries, and settled verdicts         |
| `progress.ts`    | `session.on("log")` → progress; cancellation → `session.cancel()`; prompt → elicitation |
| `validate.ts`    | The required-keys/type check against a declared JSON Schema (D2)                        |
| `action-host.ts` | The shipped host om an action-backed tool is forked as                                  |

**New — elsewhere:**

| File                           | Responsibility                                                     |
| ------------------------------ | ------------------------------------------------------------------ |
| `src/core/discovery-mode.ts`   | The `OMKIT_DISCOVER` flag, the registration payload, the IPC sink  |
| `src/client/discover-child.ts` | The forked child: imports candidate files, reports action metadata |
| `src/cli/commands/mcp.ts`      | Thin `omkit mcp` command, lazily imported like the other commands  |
| `docs/src/omkit/mcp.tskb.tsx`  | The tskb doc for the new boundary                                  |

**Changed:**

| File                        | Change                                                                        |
| --------------------------- | ----------------------------------------------------------------------------- |
| `src/core/types.ts`         | `McpMode`, `McpExposure`, `ResolvedMcpExposure`; `.mcp()` on four interfaces  |
| `src/core/om.ts`            | Carry `mcp` through `.args()`; `OMKIT_DISCOVER` guard inside `launch()`       |
| `src/core/action.ts`        | Carry `mcp` through every link; attach `mcp` and `describeArgs` to the Action |
| `src/core/ExecutionTree.ts` | Store the exposure so an om's `.mcp()` is observable                          |
| `src/client/registry.ts`    | `Registration`, `OmRegistration`, `ActionRegistration`, `RegistrationSet`     |
| `src/client/discovery.ts`   | `readRegistrations()` and `discoverRegistrations()`                           |
| `src/client/types.ts`       | `RunOptions.env`; `OmkitClient.discoverRegistrations()`                       |
| `src/client/runner.ts`      | Thread `opts.env` onto the fork                                               |
| `src/client/index.ts`       | Wire and re-export the above                                                  |
| `src/cli/index.ts`          | Route the `mcp` command                                                       |
| `src/cli/commands/help.ts`  | Document `omkit mcp`                                                          |
| `eslint.config.js`          | An `mcp` layer boundary; forbid the SDK outside it                            |
| `package.json`              | Add the SDK; bump to 0.6.0                                                    |
| `README.md`, `CHANGELOG.md` | Document the server                                                           |

---

### Task 1: `.mcp()` on the builders

Marks an om or action as exposed. Pure metadata — nothing reads it yet. The whole point of this task is that the value **survives every builder link**, which Spec A got wrong twice with `.describe()`.

**Files:**

- Modify: `packages/omkit/src/core/types.ts`
- Modify: `packages/omkit/src/core/om.ts`
- Modify: `packages/omkit/src/core/action.ts`
- Modify: `packages/omkit/src/core/ExecutionTree.ts:92-116`
- Test: `packages/omkit/tests/unit/mcp-exposure.test.ts`

**Interfaces:**

- Produces: `McpMode`, `McpExposure`, `ResolvedMcpExposure` from `core/types.ts`; `.mcp(exposure?)` on `OmBuilder`, `OmBuilderArgs`, `ActionBuilderEvents`, `ActionBuilderArgs`; `Action.mcp: ResolvedMcpExposure | undefined`; `ExecutionTree.mcp: ResolvedMcpExposure | undefined`.

- [ ] **Step 1: Write the failing test**

Create `packages/omkit/tests/unit/mcp-exposure.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

const noop = async (): Promise<void> => {};
const schema = z.object({ label: z.string().default("x") });
const longLived = { mode: "long-lived" } as const;

describe("om .mcp()", () => {
  // `.args()` returns a *new* builder. Spec A shipped `.describe()` being dropped across
  // exactly this link, and a single-direction test passes against that bug — so both
  // directions are pinned.
  test("survives the .args() link in both directions", async () => {
    await om("mcp-before-args").mcp(longLived).args(schema).run(noop);
    expect(ExecutionTree.last!.mcp).toEqual(longLived);
    ExecutionTree.reset();

    await om("mcp-after-args").args(schema).mcp(longLived).run(noop);
    expect(ExecutionTree.last!.mcp).toEqual(longLived);
  });

  test("bare .mcp() defaults the mode to settling", async () => {
    await om("mcp-default").mcp().run(noop);
    expect(ExecutionTree.last!.mcp).toEqual({ mode: "settling" });
  });

  test("an om that never calls .mcp() carries no exposure", async () => {
    await om("mcp-absent").describe({ summary: "not exposed" }).args(schema).run(noop);
    expect(ExecutionTree.last!.mcp).toBeUndefined();
  });

  test(".mcp() and .describe() do not displace each other", async () => {
    await om("mcp-and-describe").describe({ summary: "both" }).mcp().args(schema).run(noop);
    expect(ExecutionTree.last!.description).toEqual({ summary: "both" });
    expect(ExecutionTree.last!.mcp).toEqual({ mode: "settling" });
  });
});

describe("action .mcp()", () => {
  test("survives every builder link, in both directions", () => {
    expect(action("a").mcp(longLived).run(noop).mcp).toEqual(longLived);
    expect(action("b").mcp(longLived).emits<{ tick: number }>().run(noop).mcp).toEqual(longLived);
    expect(action("c").mcp(longLived).ref<string>().run(noop).mcp).toEqual(longLived);
    expect(action("d").mcp(longLived).args(schema).run(noop).mcp).toEqual(longLived);
    // The other direction: the links come first, `.mcp()` last.
    expect(
      action("e").emits<{ tick: number }>().ref<string>().mcp(longLived).run(noop).mcp
    ).toEqual(longLived);
    expect(action("f").args(schema).mcp(longLived).run(noop).mcp).toEqual(longLived);
    expect(action("g").run(noop).mcp).toBeUndefined();
  });

  test("bare .mcp() defaults the mode to settling", () => {
    expect(action("h").mcp().run(noop).mcp).toEqual({ mode: "settling" });
  });

  test(".mcp() does not displace .describe()", () => {
    const built = action("i").describe({ summary: "both" }).mcp().args(schema).run(noop);
    expect(built.description).toEqual({ summary: "both" });
    expect(built.mcp).toEqual({ mode: "settling" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-exposure.test.ts`
Expected: FAIL — `mcp is not a function`.

- [ ] **Step 3: Add the types**

In `packages/omkit/src/core/types.ts`, after `OmDescription`:

```ts
/** How an om or action behaves when a client runs it as an MCP tool. */
export type McpMode = "settling" | "long-lived";

/**
 * Marks an om or action as exposed over MCP. Absent ⇒ invisible to the server:
 * `.describe()` and `.args()` alone expose nothing.
 */
export interface McpExposure {
  /**
   * Whether the run settles on its own. `run_om` accepts only a `"settling"` entry; a
   * `"long-lived"` one must be started with `start_om`. Omitted ⇒ `"settling"`, so
   * being wrong surfaces as a timeout rather than a silently orphaned process.
   */
  mode?: McpMode;
}

/** An {@link McpExposure} after the builder has filled its default. */
export interface ResolvedMcpExposure {
  readonly mode: McpMode;
}
```

Add the method to all four builder interfaces, each returning its own type:

```ts
// on OmBuilder
/** Expose this om over MCP. Without it the MCP server does not list or run it. */
mcp(exposure?: McpExposure): OmBuilder;

// on OmBuilderArgs<S>
mcp(exposure?: McpExposure): OmBuilderArgs<S>;

// on ActionBuilderEvents<Events, Handle>
mcp(exposure?: McpExposure): ActionBuilderEvents<Events, Handle>;

// on ActionBuilderArgs<S, Events, Handle>
mcp(exposure?: McpExposure): ActionBuilderArgs<S, Events, Handle>;
```

And on the `Action` interface, beside `description`:

```ts
/** The `.mcp(…)` exposure, carried across every builder link. Undefined ⇒ not exposed. */
readonly mcp: ResolvedMcpExposure | undefined;
```

- [ ] **Step 4: Carry it through the om builder**

In `packages/omkit/src/core/om.ts`, give `launch` an `exposure` parameter (fifth, before `body`) and pass it to the tree:

```ts
function launch(
  name: string,
  site: string | undefined,
  description: OmDescription | undefined,
  exposure: ResolvedMcpExposure | undefined,
  body: (ctx: OmContext) => Awaitable<void>
): Promise<void> {
  if (ExecutionTree.current) {
    throw new Error("an om() run is already active in this process");
  }
  const tree = new ExecutionTree(name, site, description, exposure);
  // …unchanged…
}
```

In `Builder`, beside `description`:

```ts
  /** Carried into `ArgsBuilder` by `.args()`, exactly like `description`. */
  private exposure: ResolvedMcpExposure | undefined;

  mcp(exposure: McpExposure = {}): OmBuilder {
    // The default is filled here, not at the reader, so every consumer sees one shape.
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }
```

`Builder.args` must hand it over, and `Builder.run` must pass it:

```ts
  args<S extends ZodTypeLike>(schema: S): OmBuilderArgs<S> {
    return new ArgsBuilder<S>(this.name, this.site, schema, this.description, this.exposure);
  }

  run(body: (ctx: OmContext) => Awaitable<void>): Promise<void> {
    return launch(this.name, this.site, this.description, this.exposure, body);
  }
```

`ArgsBuilder` takes it as a fifth constructor parameter (`private exposure: ResolvedMcpExposure | undefined`), gets the same `mcp()` method returning `OmBuilderArgs<S>`, and passes it to `launch`.

- [ ] **Step 5: Carry it through the action builder**

In `packages/omkit/src/core/action.ts`, `Builder` takes a third constructor parameter `private exposure: ResolvedMcpExposure | undefined = undefined`, gains:

```ts
  mcp(exposure: McpExposure = {}): ActionBuilderEvents<Events, Handle> {
    this.exposure = { mode: exposure.mode ?? "settling" };
    return this;
  }
```

`emits()`, `ref()` and `args()` must forward it alongside `description`:

```ts
  emits<E extends object>(): ActionBuilderEvents<E, Handle> {
    return new Builder<E, Handle>(this.name, this.description, this.exposure);
  }

  ref<H>(): ActionBuilderEvents<Events, H> {
    return new Builder<Events, H>(this.name, this.description, this.exposure);
  }

  args<S extends ZodTypeLike>(schema: S): ActionBuilderArgs<S, Events, Handle> {
    return new ArgsBuilder<S, Events, Handle>(this.name, schema, this.description, this.exposure);
  }
```

Both `run()` methods land it on the definition:

```ts
const mcp = this.exposure;
// …
return Object.assign(create, { actionName: name, definedAt, description, mcp });
```

`ArgsBuilder` takes `private exposure` as a fourth constructor parameter and gets the same `mcp()` returning `ActionBuilderArgs<S, Events, Handle>`.

- [ ] **Step 6: Store it on the run**

In `packages/omkit/src/core/ExecutionTree.ts`, beside `description` (line 56):

```ts
  /**
   * The om's `.mcp(…)` exposure, carried here from the builder for the same reason
   * `description` is: `.run(...)` is the terminal call, and an om has no definition
   * object to hang it on. The MCP server reads its copy from the discovery fork, not
   * from here — this is what makes the carry observable, and testable, at all.
   */
  readonly mcp: ResolvedMcpExposure | undefined;
```

Take it as a fourth constructor parameter and assign it beside `this.description`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run packages/omkit/tests/unit/mcp-exposure.test.ts packages/omkit/tests/unit/om-builder.test.ts packages/omkit/tests/unit/action-metadata.test.ts`
Expected: PASS — all three files.

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck --workspace omkit` then `npm run lint --workspace omkit`

```bash
git add packages/omkit/src/core packages/omkit/tests/unit/mcp-exposure.test.ts
git commit -m "feat(omkit): mark oms and actions as MCP-exposed with .mcp()"
```

---

### Task 2: Discovery mode — register instead of launch

Importing an om file runs it. This task makes `OMKIT_DISCOVER=1` turn `.run(body)` into a registration: post what the om declares, return, start nothing.

**Files:**

- Create: `packages/omkit/src/core/discovery-mode.ts`
- Modify: `packages/omkit/src/core/om.ts`
- Modify: `packages/omkit/src/core/action.ts`
- Modify: `packages/omkit/src/core/types.ts`
- Test: `packages/omkit/tests/unit/discovery-mode.test.ts`

**Interfaces:**

- Consumes: `ResolvedMcpExposure` (Task 1); `toJsonSchema` from `core/schema-json.ts`; `siteFile` from `foundation/callsite.ts`.
- Produces: `isDiscovering()`, `setDiscovering(on)`, `setRegistrationSink(fn|null)`, `reportOm(reg)`, `describeSchema(schema)`, and the `OmRegistrationMessage` type — all from `core/discovery-mode.ts`. `Action.describeArgs()` from `core/action.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/omkit/tests/unit/discovery-mode.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import {
  setDiscovering,
  setRegistrationSink,
  type OmRegistrationMessage,
} from "../../src/core/discovery-mode.ts";

let seen: OmRegistrationMessage[] = [];

beforeEach(() => {
  seen = [];
  setRegistrationSink((r) => seen.push(r));
  setDiscovering(true);
});

afterEach(() => {
  setDiscovering(false);
  setRegistrationSink(null);
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("discovery mode", () => {
  test("an om registers and its body never runs", async () => {
    let ran = false;
    await om("disc-basic")
      .describe({ summary: "A described om" })
      .mcp()
      .run(async () => {
        ran = true;
      });

    expect(ran).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      name: "disc-basic",
      description: { summary: "A described om" },
      mcp: { mode: "settling" },
    });
    // The identity input: the file this om is defined in, with no `:line` suffix.
    expect(seen[0].file).toMatch(/discovery-mode\.test\.ts$/);
  });

  test("no ExecutionTree is built and no log folder is created", async () => {
    await om("disc-no-folder").run(async () => {});
    expect(ExecutionTree.current).toBeNull();
    // `new ExecutionTree(...)` creates the run folder in its constructor, so a leaked
    // tree would leave one behind. `logs/` is relative to cwd, the repo root here.
    const stale = fs
      .readdirSync(path.resolve("logs"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("disc-no-folder-"));
    expect(stale).toEqual([]);
  });

  test("two oms in one file both register — the single-run guard never fires", async () => {
    await om("disc-one").run(async () => {});
    await om("disc-two").run(async () => {});
    expect(seen.map((r) => r.name)).toEqual(["disc-one", "disc-two"]);
  });

  test("an om with REQUIRED args registers without prompting and without throwing", async () => {
    // This is the test that proves the guard sits in `launch()`. `OmBuilderArgs.run`
    // resolves args *inside* the run body, so a guard placed one level higher would
    // reach `resolveArgs` first and either prompt into a child nobody can answer or
    // fail with MissingArgsError. Neither is a discovery outcome.
    await om("disc-required")
      .mcp()
      .args(z.object({ token: z.string(), rows: z.number() }))
      .run(async () => {});

    expect(seen).toHaveLength(1);
    expect(seen[0].inputSchema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["token", "rows"]),
    });
    expect(seen[0].schemaError).toBeUndefined();
  });

  test("a defaulted field is reported as not required (io: input)", async () => {
    await om("disc-defaulted")
      .mcp()
      .args(z.object({ headless: z.boolean().default(true), token: z.string() }))
      .run(async () => {});
    expect(seen[0].inputSchema?.required).toEqual(["token"]);
  });

  test("an unconvertible schema degrades to a reason instead of throwing", async () => {
    await om("disc-unconvertible")
      .mcp()
      .args(z.object({ at: z.date() }))
      .run(async () => {});

    expect(seen).toHaveLength(1);
    expect(seen[0].inputSchema).toBeUndefined();
    expect(typeof seen[0].schemaError).toBe("string");
  });

  test("an om with no .args() registers with no schema at all", async () => {
    await om("disc-no-args")
      .mcp()
      .run(async () => {});
    expect(seen[0].inputSchema).toBeUndefined();
    expect(seen[0].schemaError).toBeUndefined();
  });
});

describe("action.describeArgs()", () => {
  // Actions register nothing — they are read off the module's exports. `describeArgs`
  // is the conversion done *by the copy of omkit that defined the action*, so the
  // discovery child never has to convert a schema built by a different zod instance.
  const noop = async (): Promise<void> => {};

  test("converts a declared schema", () => {
    const seed = action("seed")
      .mcp()
      .args(z.object({ rows: z.number() }))
      .run(noop);
    expect(seed.describeArgs()).toEqual({
      inputSchema: expect.objectContaining({ type: "object" }),
      schemaError: undefined,
    });
  });

  test("reports a reason for an unconvertible schema instead of throwing", () => {
    const at = action("at")
      .mcp()
      .args(z.object({ when: z.date() }))
      .run(noop);
    const described = at.describeArgs();
    expect(described.inputSchema).toBeUndefined();
    expect(typeof described.schemaError).toBe("string");
  });

  test("an action with no .args() describes nothing", () => {
    expect(action("bare").run(noop).describeArgs()).toEqual({
      inputSchema: undefined,
      schemaError: undefined,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/discovery-mode.test.ts`
Expected: FAIL — cannot resolve `../../src/core/discovery-mode.ts`.

- [ ] **Step 3: Write `core/discovery-mode.ts`**

```ts
import type { z } from "zod";
import { toJsonSchema, type JsonSchema } from "./schema-json.ts";
import type { OmDescription, ResolvedMcpExposure } from "./types.ts";

/**
 * What an om reports in discovery mode, posted the moment `.run(...)` is reached.
 * Sent over the fork's IPC channel rather than collected in a module variable: the
 * user's file resolves `"omkit"` to the installed package while the discovery child
 * runs omkit's own module graph, so the two can hold different copies of omkit and a
 * shared variable would be written in one and read in the other.
 */
export interface OmRegistrationMessage {
  readonly kind: "om-registration";
  readonly name: string;
  /** The defining file — the same input the run's identity hashes. No `:line`. */
  readonly file: string | undefined;
  readonly description: OmDescription | undefined;
  readonly mcp: ResolvedMcpExposure | undefined;
  /** The declared args as JSON Schema; undefined when the om declares none. */
  readonly inputSchema: JsonSchema | undefined;
  /** Set when `.args(schema)` would not convert — the entry lists as unavailable. */
  readonly schemaError: string | undefined;
}

/**
 * Discovery mode. The child forked by `discoverRegistrations()` sets `OMKIT_DISCOVER=1`
 * and imports om files purely to read what they declare. In that mode `launch()` posts a
 * registration and returns: no ExecutionTree, no log folder, no body.
 *
 * The flag is read once at import and then deleted from the environment, so a
 * subprocess an om happens to spawn does not inherit it — the same discipline
 * `OMKIT_SUPERVISED` and `OMKIT_ARGS` already follow.
 */
function detect(): boolean {
  const discovering = process.env.OMKIT_DISCOVER === "1";
  delete process.env.OMKIT_DISCOVER;
  return discovering;
}

let discovering = detect();

export function isDiscovering(): boolean {
  return discovering;
}

/** Test seam: enter or leave discovery mode without forking a child. */
export function setDiscovering(on: boolean): void {
  discovering = on;
}

/** Where a registration goes. */
export type RegistrationSink = (registration: OmRegistrationMessage) => void;

/** The real sink: straight up the fork's IPC channel. A no-op with no channel. */
const ipcSink: RegistrationSink = (registration) => {
  process.send?.(registration);
};

let sink: RegistrationSink = ipcSink;

/** Test seam: collect registrations in-process. Pass `null` to restore the IPC sink. */
export function setRegistrationSink(next: RegistrationSink | null): void {
  sink = next ?? ipcSink;
}

export function reportOm(registration: OmRegistrationMessage): void {
  sink(registration);
}

/**
 * Convert a declared schema, never throwing. `z.toJSONSchema` rejects schemas it cannot
 * represent (`z.date()`, `z.custom()`, anything built on them), and one such entry must
 * not take the whole tool list down with it — so the failure is carried as data on that
 * entry alone. `undefined` in (no `.args()`) means nothing to report either way.
 */
export function describeSchema(schema: unknown): {
  inputSchema: JsonSchema | undefined;
  schemaError: string | undefined;
} {
  if (schema === undefined) return { inputSchema: undefined, schemaError: undefined };
  try {
    return { inputSchema: toJsonSchema(schema as z.ZodType), schemaError: undefined };
  } catch (e) {
    return {
      inputSchema: undefined,
      schemaError: e instanceof Error ? e.message : String(e),
    };
  }
}
```

- [ ] **Step 4: Guard `launch()`**

In `packages/omkit/src/core/om.ts`, add `schema` as a sixth parameter to `launch` and put the guard first:

```ts
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
  // through, for two reasons. `OmBuilderArgs.run` resolves args inside the run body, so
  // a guard one level up would reach `resolveArgs` first and prompt into a child nobody
  // can answer (or throw MissingArgsError) — neither is a discovery outcome. And
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
  // …unchanged…
}
```

Import `isDiscovering`, `reportOm`, `describeSchema` from `./discovery-mode.ts` and `siteFile` from `../foundation/callsite.ts`. `Builder.run` calls `launch(…, body)` with no schema; `ArgsBuilder.run` calls `launch(…, body, this.schema)`.

- [ ] **Step 5: Add `describeArgs` to the Action**

In `packages/omkit/src/core/types.ts`, add the shared shape and the property:

```ts
/** The result of converting a declared schema — one of the two fields is always undefined. */
export interface DescribedArgs {
  readonly inputSchema: JsonSchema | undefined;
  readonly schemaError: string | undefined;
}
```

```ts
  /**
   * The declared args as JSON Schema, computed on demand. Called by the discovery
   * child rather than converting the schema itself: the user's file resolves `"omkit"`
   * to the installed package while the child runs omkit's own module graph, so the two
   * can hold different zod instances. Converting inside the defining copy sidesteps
   * that. Never throws — an unconvertible schema comes back as `schemaError`.
   */
  readonly describeArgs: () => DescribedArgs;
```

Import `JsonSchema` as a type from `./schema-json.ts`, and give `describeSchema` in
`discovery-mode.ts` the return type `DescribedArgs` so the two cannot drift.

In `packages/omkit/src/core/action.ts`, both `run()` methods attach it — `Builder.run` with no schema, `ArgsBuilder.run` with `this.schema`:

```ts
// Builder.run — no `.args()`, so nothing to describe
const describeArgs = (): DescribedArgs => describeSchema(undefined);
return Object.assign(create, { actionName: name, definedAt, description, mcp, describeArgs });
```

```ts
// ArgsBuilder.run — the schema is captured so the conversion happens in this copy
const schema = this.schema;
const describeArgs = (): DescribedArgs => describeSchema(schema);
return Object.assign(create, { actionName: name, definedAt, description, mcp, describeArgs });
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run packages/omkit/tests/unit/discovery-mode.test.ts packages/omkit/tests/unit/mcp-exposure.test.ts packages/omkit/tests/unit/args-resolution.test.ts packages/omkit/tests/unit/om-identity.test.ts`
Expected: PASS — all four files. `args-resolution` and `om-identity` are the regression guard: discovery mode must not have moved either.

- [ ] **Step 7: Typecheck, lint and commit**

Run: `npm run typecheck --workspace omkit && npm run lint --workspace omkit`

```bash
git add packages/omkit/src/core packages/omkit/tests/unit/discovery-mode.test.ts
git commit -m "feat(omkit): register instead of launching under OMKIT_DISCOVER"
```

---

### Task 3: `discoverRegistrations()` in the client

The fork that turns discovery mode into data. Two halves: `readRegistrations(files)` runs the child over an explicit file list, and `discoverRegistrations(tsconfig)` picks the candidate files with the existing AST scan and calls it.

**Files:**

- Create: `packages/omkit/src/client/discover-child.ts`
- Create: `packages/omkit/tests/fixtures/registrations/oms/exposed.ts`
- Create: `packages/omkit/tests/fixtures/registrations/oms/hidden.ts`
- Create: `packages/omkit/tests/fixtures/registrations/oms/explodes.ts`
- Create: `packages/omkit/tests/fixtures/registrations/actions/seed.ts`
- Modify: `packages/omkit/src/client/registry.ts`
- Modify: `packages/omkit/src/client/discovery.ts`
- Modify: `packages/omkit/src/client/types.ts`
- Modify: `packages/omkit/src/client/index.ts`
- Modify: `packages/omkit/src/client/runner.ts`
- Test: `packages/omkit/tests/unit/registrations.test.ts`

**Interfaces:**

- Consumes: `OmRegistrationMessage`, `describeSchema` (Task 2); `discover()` from `client/discovery.ts`; `omHash` from `foundation/ids.ts`; `fsSafe` from `foundation/fsSafe.ts`.
- Produces: `Registration`, `OmRegistration`, `ActionRegistration`, `RegistrationSet` from `client/registry.ts`; `readRegistrations(files, opts?)` and `discoverRegistrations(tsconfig, opts?)` from `client/discovery.ts`; `OmkitClient.discoverRegistrations()`; `RunOptions.env`.

**Fixture note (Global Constraint 12):** these fixtures are **forked and imported**, so they import omkit relatively (`../../../../src/index.ts`), exactly as `tests/fixtures/run/hello.ts` does. A fixture importing the literal `"omkit"` would resolve at runtime to `packages/omkit/dist` — a different, possibly stale copy from the `src/` the test drives. The AST half of discovery keeps its own `"omkit"`-importing fixtures under `tests/fixtures/discovery/`; do not merge the two.

- [ ] **Step 1: Write the fixtures**

`packages/omkit/tests/fixtures/registrations/oms/exposed.ts`:

```ts
import { z } from "zod";
import { om } from "../../../../src/index.ts";

om("exposed")
  .describe({ summary: "An om a client may run" })
  .mcp({ mode: "long-lived" })
  .args(z.object({ headless: z.boolean().default(true), token: z.string() }))
  .run(async () => {
    throw new Error("the body must never run under discovery");
  });
```

`packages/omkit/tests/fixtures/registrations/oms/hidden.ts`:

```ts
import { om } from "../../../../src/index.ts";

// No `.mcp()`: it still registers (the fork reports everything it sees), but the MCP
// server filters it out. Exposure is opt-in, and this fixture is what proves it.
om("hidden")
  .describe({ summary: "Not exposed" })
  .run(async () => {});
```

`packages/omkit/tests/fixtures/registrations/oms/explodes.ts`:

```ts
import { om } from "../../../../src/index.ts";

om("registers-then-throws")
  .mcp()
  .run(async () => {});

// The file blows up *after* its om registered. Two things must hold: the registration
// already went up the channel (they stream, they are not batched at exit), and the
// import failure degrades to a warning rather than taking discovery down.
throw new Error("this file explodes at import");
```

`packages/omkit/tests/fixtures/registrations/actions/seed.ts`:

```ts
import { z } from "zod";
import { action } from "../../../../src/index.ts";

export const seed = action("seed")
  .describe({ summary: "Seed the database" })
  .mcp()
  .args(z.object({ rows: z.number() }))
  .run(async () => {});

/** Exposed, but its schema cannot be represented as JSON Schema — must list as unavailable. */
export const at = action("at")
  .mcp()
  .args(z.object({ when: z.date() }))
  .run(async () => {});

/** Not an action, despite the shape — noise the export scan must ignore. */
export const notAnAction = { actionName: "impostor" };
```

- [ ] **Step 2: Write the failing test**

Create `packages/omkit/tests/unit/registrations.test.ts`:

```ts
import { beforeAll, describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistrations } from "../../src/client/discovery.ts";
import type { RegistrationSet } from "../../src/client/registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "../fixtures/registrations");
const files = [
  path.join(fixtures, "oms/exposed.ts"),
  path.join(fixtures, "oms/hidden.ts"),
  path.join(fixtures, "oms/explodes.ts"),
  path.join(fixtures, "actions/seed.ts"),
];

// One fork for the whole file: it is the unit under test, and forking per assertion
// would multiply a ~2s cost by seven for no extra coverage.
let set: RegistrationSet;
beforeAll(async () => {
  set = await readRegistrations(files);
}, 40_000);

describe("readRegistrations", () => {
  test("reads an om's summary, mode and args schema without running its body", () => {
    const exposed = set.oms.find((o) => o.name === "exposed")!;
    expect(exposed.summary).toBe("An om a client may run");
    expect(exposed.mcp).toEqual({ mode: "long-lived" });
    expect(exposed.inputSchema).toMatchObject({ type: "object", required: ["token"] });
    expect(exposed.unavailable).toBeUndefined();
  });

  test("derives the run folder name without running the om", () => {
    const exposed = set.oms.find((o) => o.name === "exposed")!;
    // `<name>-<hash8>` — the same rule ExecutionTree applies, so
    // `omkit://runs/<folderName>/latest/…` resolves for a run nobody has started yet.
    expect(exposed.folderName).toMatch(/^exposed-[0-9a-f]{8}$/);
    expect(exposed.file).toMatch(/exposed\.ts$/);
  });

  test("an om with no .mcp() still registers — filtering is the server's job", () => {
    expect(set.oms.find((o) => o.name === "hidden")!.mcp).toBeUndefined();
  });

  test("a file that throws on import becomes a warning, and its earlier om survives", () => {
    expect(set.oms.map((o) => o.name)).toContain("registers-then-throws");
    expect(set.warnings.some((w) => w.includes("explodes at import"))).toBe(true);
    // …and every other file still registered.
    expect(set.oms.map((o) => o.name)).toContain("exposed");
    expect(set.actions.map((a) => a.name)).toContain("seed");
  });

  test("reads exported actions with their export name and schema", () => {
    const seed = set.actions.find((a) => a.name === "seed")!;
    expect(seed.exportName).toBe("seed");
    expect(seed.summary).toBe("Seed the database");
    expect(seed.mcp).toEqual({ mode: "settling" });
    expect(seed.inputSchema).toMatchObject({ type: "object" });
    expect(set.actions.map((a) => a.name)).not.toContain("impostor");
  });

  test("an unconvertible schema marks one entry unavailable and leaves the rest listed", () => {
    const at = set.actions.find((a) => a.name === "at")!;
    expect(at.inputSchema).toBeUndefined();
    expect(typeof at.unavailable).toBe("string");
    expect(set.actions.find((a) => a.name === "seed")!.unavailable).toBeUndefined();
  });

  test("an empty file list resolves empty rather than forking or hanging", async () => {
    await expect(readRegistrations([])).resolves.toEqual({ oms: [], actions: [], warnings: [] });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/registrations.test.ts`
Expected: FAIL — `readRegistrations` is not exported from `client/discovery.ts`.

- [ ] **Step 4: Extend `client/registry.ts`**

Append to `packages/omkit/src/client/registry.ts`:

```ts
import type { JsonSchema } from "../core/schema-json.ts";

/**
 * What importing a file in discovery mode reveals — the metadata the AST scan cannot
 * see, because `.describe()`, `.args()` and `.mcp()` only have values once the module
 * has been evaluated. Produced by `discoverRegistrations`, never by `discover`.
 */
export interface Registration {
  readonly name: string;
  /** Absolute path of the defining file. */
  readonly file: string;
  /** The `.describe({ summary })` line, when the author wrote one. */
  readonly summary?: string;
  /** Present only when the author called `.mcp()`. Absent ⇒ not exposed over MCP. */
  readonly mcp?: { readonly mode: "settling" | "long-lived" };
  /** The declared args as JSON Schema. Absent when none were declared. */
  readonly inputSchema?: JsonSchema;
  /** Why this entry cannot be called — currently only "its schema would not convert". */
  readonly unavailable?: string;
}

export interface OmRegistration extends Registration {
  /**
   * `<name>-<hash8>` — the run's log folder, derived from the name and the defining
   * file by the same rule the runtime uses, so it is known before the om has ever run.
   */
  readonly folderName: string;
}

export interface ActionRegistration extends Registration {
  /** The exported binding (`export const <exportName> = action(...)`). */
  readonly exportName: string;
}

/** The result of importing a project's candidate files in discovery mode. */
export interface RegistrationSet {
  readonly oms: OmRegistration[];
  readonly actions: ActionRegistration[];
  /** Import failures and AST warnings — registration discovery never throws for these. */
  readonly warnings: string[];
}
```

- [ ] **Step 5: Write the discovery child**

Create `packages/omkit/src/client/discover-child.ts`:

```ts
import { pathToFileURL } from "node:url";
import type { ActionRegistration } from "./registry.ts";

/** The parent's opening message: sent over IPC, so no argv length limit applies. */
export interface ScanMessage {
  readonly kind: "scan";
  readonly files: string[];
}

/** The child's closing message. Om registrations arrive separately, as each om is reached. */
export interface ActionsMessage {
  readonly kind: "actions";
  readonly actions: ActionRegistration[];
  readonly warnings: string[];
}

/**
 * Duck-typed on purpose: the value came from whichever copy of omkit the user's file
 * imported, so `instanceof` would fail across copies. Only plain properties are read,
 * and the schema conversion is delegated back to that copy through `describeArgs`.
 */
interface ActionLike {
  readonly actionName: string;
  readonly description?: { summary: string };
  readonly mcp?: { mode: "settling" | "long-lived" };
  readonly describeArgs: () => {
    inputSchema: Record<string, unknown> | undefined;
    schemaError: string | undefined;
  };
}

function asAction(value: unknown): ActionLike | undefined {
  if (typeof value !== "function") return undefined;
  const candidate = value as Partial<ActionLike>;
  if (typeof candidate.actionName !== "string") return undefined;
  if (typeof candidate.describeArgs !== "function") return undefined;
  return candidate as ActionLike;
}

/**
 * The discovery child. Forked with `OMKIT_DISCOVER=1`, so importing a file makes every
 * `om(...).run(...)` in it post a registration up this same channel instead of launching
 * (see core/discovery-mode.ts). Actions post nothing — they are plain values — so their
 * metadata is read off each module's exports here, afterwards.
 */
async function scan(files: string[]): Promise<void> {
  const actions: ActionRegistration[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    } catch (e) {
      warnings.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const [exportName, value] of Object.entries(mod)) {
      const found = asAction(value);
      if (!found) continue;
      const { inputSchema, schemaError } = found.describeArgs();
      actions.push({
        name: found.actionName,
        exportName,
        file,
        ...(found.description ? { summary: found.description.summary } : {}),
        ...(found.mcp ? { mcp: found.mcp } : {}),
        ...(inputSchema ? { inputSchema } : {}),
        ...(schemaError ? { unavailable: schemaError } : {}),
      });
    }
  }

  // Exit only once the message has actually flushed. `process.send` is asynchronous —
  // exiting on the next line can drop the payload before it reaches the parent, and the
  // parent would see a `close` with no `actions` message and report an empty project.
  // A user module may also have started a server or a timer at import; nothing here is
  // supervised and nothing will tear it down, so leave deliberately rather than linger.
  const done = (): never => process.exit(0);
  if (process.send)
    process.send({ kind: "actions", actions, warnings } satisfies ActionsMessage, done);
  else done();
}

process.on("message", (message: unknown) => {
  if ((message as ScanMessage | undefined)?.kind === "scan") {
    void scan((message as ScanMessage).files);
  }
});
```

- [ ] **Step 6: Write the parent half**

In `packages/omkit/src/client/runner.ts`, change `const tsxLoader` to `export const tsxLoader` so the discovery fork uses the same resolved loader a run does.

Append to `packages/omkit/src/client/discovery.ts` — new imports: `fork` from `node:child_process`, `fileURLToPath` from `node:url`, `omHash` from `../foundation/ids.ts`, `fsSafe` from `../foundation/fsSafe.ts`, `tsxLoader` from `./runner.ts`, `type OmRegistrationMessage` from `../core/discovery-mode.ts`, `type ActionsMessage, type ScanMessage` from `./discover-child.ts`, and the registration types from `./registry.ts`:

```ts
/** How long the child gets to import every file before it is killed and reported. */
const DISCOVER_TIMEOUT_MS = 30_000;

/**
 * Absolute path of a sibling module, carrying the extension this build actually uses —
 * `.ts` under tsx and vitest, `.js` once compiled. `rewriteRelativeImportExtensions`
 * rewrites import specifiers; this path is data (a fork target), so it does not.
 */
function siblingScript(name: string): string {
  const here = fileURLToPath(import.meta.url);
  return path.join(path.dirname(here), `${name}${path.extname(here)}`);
}

/** Project an om's registration message onto the client-facing shape, folder name and all. */
function toOmRegistration(m: OmRegistrationMessage): OmRegistration {
  const file = m.file ?? "";
  return {
    name: m.name,
    file,
    folderName: `${fsSafe(m.name)}-${omHash(m.name, m.file)}`,
    ...(m.description ? { summary: m.description.summary } : {}),
    ...(m.mcp ? { mcp: m.mcp } : {}),
    ...(m.inputSchema ? { inputSchema: m.inputSchema } : {}),
    ...(m.schemaError ? { unavailable: m.schemaError } : {}),
  };
}

/**
 * Import `files` in a throwaway child with `OMKIT_DISCOVER=1` and collect what they
 * declare. Exposed separately from {@link discoverRegistrations} so the fork can be
 * driven with an explicit file list — by tests, and by anything that already knows its
 * candidates.
 *
 * Never rejects for user-code problems: an import failure, a crashed child, or a child
 * that outstays its timeout all come back as warnings on an otherwise usable set.
 */
export function readRegistrations(
  files: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<RegistrationSet> {
  if (files.length === 0) return Promise.resolve({ oms: [], actions: [], warnings: [] });
  const timeoutMs = opts.timeoutMs ?? DISCOVER_TIMEOUT_MS;

  return new Promise((resolve) => {
    const oms: OmRegistration[] = [];
    const warnings: string[] = [];
    const child = fork(siblingScript("discover-child"), [], {
      execArgv: ["--import", tsxLoader],
      cwd: opts.cwd ?? path.dirname(files[0]!),
      env: { ...process.env, OMKIT_DISCOVER: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    let settled = false;
    const finish = (actions: ActionRegistration[]): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill();
      resolve({ oms, actions, warnings });
    };

    const timer = setTimeout(() => {
      warnings.push(`discovery timed out after ${timeoutMs}ms`);
      finish([]);
    }, timeoutMs);

    child.on("message", (message: unknown) => {
      const m = message as OmRegistrationMessage | ActionsMessage;
      if (m.kind === "om-registration") oms.push(toOmRegistration(m));
      else if (m.kind === "actions") {
        warnings.push(...m.warnings);
        finish(m.actions);
      }
    });
    // A child that dies before reporting still yields whatever streamed in before it did.
    child.on("close", () => finish([]));
    child.on("error", (e) => {
      warnings.push(`discovery child failed: ${e.message}`);
      finish([]);
    });

    child.send({ kind: "scan", files } satisfies ScanMessage);
  });
}

/**
 * The full pass: the AST scan picks the candidate files — it stays the only cheap,
 * never-executing phase — then {@link readRegistrations} imports just those. AST
 * warnings are carried through so nothing is lost between the two phases.
 */
export async function discoverRegistrations(
  tsconfigPath: string,
  opts: { timeoutMs?: number } = {}
): Promise<RegistrationSet> {
  const ast = discover(tsconfigPath);
  const files = [...new Set([...ast.oms.map((o) => o.file), ...ast.actions.map((a) => a.file)])];
  const set = await readRegistrations(files, {
    cwd: path.dirname(path.resolve(tsconfigPath)),
    ...opts,
  });
  return { ...set, warnings: [...ast.warnings, ...set.warnings] };
}
```

- [ ] **Step 7: Wire it into the client facade**

In `packages/omkit/src/client/types.ts`, add to `RunOptions`:

```ts
  /** Extra environment for the child, merged over the parent's (this is how `OMKIT_ARGS` travels). */
  readonly env?: Record<string, string>;
```

and to `OmkitClient`:

```ts
  /**
   * Read what the project's oms and actions declare, by importing them in a throwaway
   * child. Unlike {@link OmkitClient.discover} this executes user code, so it is never
   * on the `omkit ls` path — only a caller that needs real schemas should ask for it.
   */
  discoverRegistrations(): Promise<RegistrationSet>;
```

(import `RegistrationSet` as a type from `./registry.ts`).

In `packages/omkit/src/client/runner.ts`, thread the env through both spawners:

```ts
    env: { ...process.env, OMKIT_SUPERVISED: "1", ...opts.env },   // runOm
```

```ts
const env = { ...process.env, ...opts.env }; // spawnBare
delete env.OMKIT_SUPERVISED;
```

In `packages/omkit/src/client/index.ts`, import `discoverRegistrations` from `./discovery.ts`, wire the method, and re-export the new registration types:

```ts
    discoverRegistrations: async () => discoverRegistrations(config.tsconfig),
```

Also re-export `readRegistrations` itself from `client/index.ts`. It is not a test-only
export: it is the half of discovery that already knows its candidates, and the MCP tests
use it to build a registration set over fixtures that the AST scan cannot see (Global
Constraint 12). **Do not add a `files` or `discoverFiles` option to `OmkitConfig` for
this** — a production config field that only tests set is exactly the kind of seam that
gets defended eleven times in review. `readRegistrations` is public API in its own right,
and a test that needs a curated registration set composes one from it.

```ts
export type {
  Registry,
  DiscoveredOm,
  DiscoveredAction,
  Registration,
  OmRegistration,
  ActionRegistration,
  RegistrationSet,
} from "./registry.ts";
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run packages/omkit/tests/unit/registrations.test.ts packages/omkit/tests/unit/discovery.test.ts packages/omkit/tests/unit/client.test.ts packages/omkit/tests/unit/runner.test.ts`
Expected: PASS. `discovery.test.ts` passing untouched is the proof that `discover()` is still AST-only.

- [ ] **Step 9: Typecheck, lint and commit**

Run: `npm run typecheck --workspace omkit && npm run lint --workspace omkit`

```bash
git add packages/omkit/src/client packages/omkit/tests/fixtures/registrations packages/omkit/tests/unit/registrations.test.ts
git commit -m "feat(omkit): read om and action metadata through a discovery fork"
```

---

### Task 4: The server, the `omkit mcp` command, and `list_oms`

First running server. Boots over stdio, answers `tools/list`, and serves one tool. If the SDK API is wrong, it is wrong here rather than six tasks later.

**Files:**

- Modify: `packages/omkit/package.json`
- Modify: `packages/omkit/eslint.config.js`
- Create: `packages/omkit/src/mcp/server.ts`
- Create: `packages/omkit/src/mcp/tools.ts`
- Create: `packages/omkit/src/cli/commands/mcp.ts`
- Modify: `packages/omkit/src/cli/index.ts`
- Modify: `packages/omkit/src/cli/commands/help.ts`
- Test: `packages/omkit/tests/unit/mcp-list-oms.test.ts`

**Interfaces:**

- Consumes: `OmkitClient.discoverRegistrations()` and the registration types (Task 3).
- Produces: `createMcpServer(opts)` and `startMcpServer(opts)` from `mcp/server.ts`; `registerTools(server, ctx)` and the `ToolContext` interface from `mcp/tools.ts`; `mcpCommand(client, opts)` from `cli/commands/mcp.ts`.

**SDK facts, verified against `@modelcontextprotocol/sdk@1.30.0` typings — use these, do not improvise:**

- `new McpServer({ name, version }, { capabilities })` from `@modelcontextprotocol/sdk/server/mcp.js`.
- `server.registerTool(name, { title?, description?, inputSchema?, outputSchema?, annotations? }, cb)`.
- `inputSchema` / `outputSchema` accept either a **ZodRawShape** (a plain object of zod schemas, `{ name: z.string() }`) or a whole schema (`z.object({...})`) — the parameter is typed `ZodRawShapeCompat | AnySchema`, and `AnySchema` covers zod v4 types. **This plan uses the raw-shape form throughout**; keep to it so every tool reads the same way, and so the callback's argument type comes from `ShapeOutput` consistently.
- The callback is `(args, extra)` when `inputSchema` is given, `(extra)` when it is not. `extra` carries `signal`, `_meta`, `requestId`, `sendNotification`, `sendRequest`.
- When `outputSchema` is declared the SDK validates the returned `structuredContent` against it, so it must be present and must match.
- `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`; `server.connect(transport)`.
- `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk/inMemory.js` and `Client` from `@modelcontextprotocol/sdk/client/index.js` — this is how the tests drive the server in-process.

- [ ] **Step 1: Add the dependency**

```bash
npm install --workspace omkit @modelcontextprotocol/sdk@^1.30.0
```

Confirm `packages/omkit/package.json` now lists it under `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `packages/omkit/tests/unit/mcp-list-oms.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.ts";
import type { OmkitClient } from "../../src/client/index.ts";
import type { RegistrationSet } from "../../src/client/registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A stub client: the server is the unit under test, and forking a real discovery child
 * per assertion would make these tests slow and would re-cover Task 3's ground.
 */
function stubClient(set: RegistrationSet): OmkitClient {
  return {
    tsconfig: "tsconfig.omkit.json",
    discover: async () => ({ oms: [], actions: [], warnings: [] }),
    discoverRegistrations: async () => set,
    run: () => {
      throw new Error("not used in this test");
    },
    runBare: async () => 0,
    check: async () => [],
  };
}

const registrations: RegistrationSet = {
  oms: [
    {
      name: "smoke",
      file: "/p/oms/smoke.ts",
      folderName: "smoke-a1b2c3d4",
      summary: "Boot the app and run the smoke suite",
      mcp: { mode: "settling" },
      inputSchema: { type: "object", properties: { headless: { type: "boolean" } } },
    },
    { name: "hidden", file: "/p/oms/hidden.ts", folderName: "hidden-00000000" },
    {
      name: "when",
      file: "/p/oms/when.ts",
      folderName: "when-11111111",
      mcp: { mode: "settling" },
      unavailable: "Date cannot be represented in JSON Schema",
    },
  ],
  actions: [
    {
      name: "seed",
      file: "/p/actions/seed.ts",
      exportName: "seed",
      summary: "Seed the database",
      mcp: { mode: "settling" },
      inputSchema: { type: "object", properties: { rows: { type: "number" } } },
    },
    { name: "lint", file: "/p/actions/lint.ts", exportName: "lint" },
  ],
  warnings: ["oms/broken.ts: boom"],
};

async function connect(set: RegistrationSet = registrations): Promise<Client> {
  const server = createMcpServer({ client: stubClient(set), root: here });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

let open: Client | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("the MCP server", () => {
  test("serves list_oms over a real client connection", async () => {
    open = await connect();
    const { tools } = await open.listTools();
    expect(tools.map((t) => t.name)).toContain("list_oms");
  });

  test("declares list_oms read-only, so a client knows it is safe to call", async () => {
    open = await connect();
    const { tools } = await open.listTools();
    expect(tools.find((t) => t.name === "list_oms")!.annotations?.readOnlyHint).toBe(true);
  });
});

describe("list_oms", () => {
  test("lists only entries that called .mcp(), with their summary and mode", async () => {
    open = await connect();
    const result = await open.callTool({ name: "list_oms", arguments: {} });
    const listed = result.structuredContent as {
      entries: Array<Record<string, unknown>>;
      warnings: string[];
    };

    expect(listed.entries.map((e) => e.name).sort()).toEqual(["seed", "smoke", "when"]);
    const smoke = listed.entries.find((e) => e.name === "smoke")!;
    expect(smoke).toMatchObject({
      kind: "om",
      mode: "settling",
      summary: "Boot the app and run the smoke suite",
      folderName: "smoke-a1b2c3d4",
    });
    expect(listed.warnings).toContain("oms/broken.ts: boom");
  });

  test("an unconvertible schema lists as unavailable and the others still list", async () => {
    open = await connect();
    const result = await open.callTool({ name: "list_oms", arguments: {} });
    const listed = result.structuredContent as { entries: Array<Record<string, unknown>> };
    const when = listed.entries.find((e) => e.name === "when")!;
    expect(when.unavailable).toBe("Date cannot be represented in JSON Schema");
    expect(when.inputSchema).toBeUndefined();
    expect(listed.entries.find((e) => e.name === "smoke")!.inputSchema).toBeDefined();
  });

  test("an exposed action is listed as an action, with its export name", async () => {
    open = await connect();
    const result = await open.callTool({ name: "list_oms", arguments: {} });
    const listed = result.structuredContent as { entries: Array<Record<string, unknown>> };
    expect(listed.entries.find((e) => e.name === "seed")).toMatchObject({
      kind: "action",
      exportName: "seed",
    });
  });

  test("discovery is cached for the process and refreshed on request", async () => {
    let calls = 0;
    const client = stubClient(registrations);
    const counting: OmkitClient = {
      ...client,
      discoverRegistrations: async () => {
        calls += 1;
        return registrations;
      },
    };
    const server = createMcpServer({ client: counting, root: here });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    open = new Client({ name: "test", version: "0" });
    await Promise.all([open.connect(ct), server.connect(st)]);

    await open.callTool({ name: "list_oms", arguments: {} });
    await open.callTool({ name: "list_oms", arguments: {} });
    expect(calls).toBe(1);
    await open.callTool({ name: "list_oms", arguments: { refresh: true } });
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-list-oms.test.ts`
Expected: FAIL — cannot resolve `../../src/mcp/server.ts`.

- [ ] **Step 4: Write `mcp/tools.ts` with `list_oms`**

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OmkitClient } from "../client/index.ts";
import type { RegistrationSet } from "../client/registry.ts";

/** Everything the tools need. Passed in so the server stays assembly and these stay logic. */
export interface ToolContext {
  readonly client: OmkitClient;
  /** Project root — run folders resolve under `<root>/logs`. */
  readonly root: string;
}

/**
 * One entry in `list_oms`: an om or an exposed action, flattened into a single list so a
 * client has one place to look for "what can I call". `kind` says which it is, because
 * an action's caveats differ (see the action-host notes in the spec).
 */
export interface ToolEntry {
  readonly kind: "om" | "action";
  readonly name: string;
  readonly mode: "settling" | "long-lived";
  readonly file: string;
  readonly summary?: string;
  /** `<name>-<hash8>` — where this entry's runs land under `logs/`. Oms only. */
  readonly folderName?: string;
  /** The exported binding an action-backed tool is invoked through. Actions only. */
  readonly exportName?: string;
  readonly inputSchema?: Record<string, unknown>;
  /** Set when the entry cannot be called, with the reason. */
  readonly unavailable?: string;
}

const entryShape = {
  kind: z.enum(["om", "action"]),
  name: z.string(),
  mode: z.enum(["settling", "long-lived"]),
  file: z.string(),
  summary: z.string().optional(),
  folderName: z.string().optional(),
  exportName: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  unavailable: z.string().optional(),
};

/**
 * The process-lifetime registry cache. Discovery forks a child and imports user code, so
 * it is far too expensive to repeat per tool call; a client that has changed a file asks
 * for `refresh: true`. (Watching for changes and emitting `tools/list_changed` is
 * deferred — the tool list itself never changes, only what `list_oms` returns.)
 */
function createRegistryCache(client: OmkitClient): (refresh?: boolean) => Promise<RegistrationSet> {
  let cached: Promise<RegistrationSet> | undefined;
  return (refresh = false) => {
    if (refresh || !cached) cached = client.discoverRegistrations();
    return cached;
  };
}

/** Flatten a registration set into the entries a client may call, dropping the rest. */
export function toEntries(set: RegistrationSet): ToolEntry[] {
  const entries: ToolEntry[] = [];
  for (const om of set.oms) {
    if (!om.mcp) continue; // exposure is opt-in
    entries.push({
      kind: "om",
      name: om.name,
      mode: om.mcp.mode,
      file: om.file,
      folderName: om.folderName,
      ...(om.summary ? { summary: om.summary } : {}),
      ...(om.inputSchema ? { inputSchema: om.inputSchema } : {}),
      ...(om.unavailable ? { unavailable: om.unavailable } : {}),
    });
  }
  for (const a of set.actions) {
    if (!a.mcp) continue;
    entries.push({
      kind: "action",
      name: a.name,
      mode: a.mcp.mode,
      file: a.file,
      exportName: a.exportName,
      ...(a.summary ? { summary: a.summary } : {}),
      ...(a.inputSchema ? { inputSchema: a.inputSchema } : {}),
      ...(a.unavailable ? { unavailable: a.unavailable } : {}),
    });
  }
  return entries;
}

/**
 * Every tool result carries a text block as well as `structuredContent`: a client that
 * ignores structured output still sees the answer. Return types are inferred so they stay
 * assignable to the SDK's `CallToolResult` union — annotating them as tuples does not.
 */
export function both<T>(structuredContent: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

/** A tool failure, in MCP's shape: a message the model can act on, not a thrown stack. */
export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const registry = createRegistryCache(ctx.client);

  server.registerTool(
    "list_oms",
    {
      title: "List runnable omkit oms and actions",
      description:
        "Lists everything this project exposes over MCP: its name, what it does, whether it " +
        "settles on its own, and the JSON Schema for its arguments. Call this before run_om " +
        "or start_om — their `args` are not described by their own input schemas.",
      inputSchema: {
        refresh: z
          .boolean()
          .optional()
          .describe("Re-import the project's files. Use after editing an om or action."),
      },
      outputSchema: {
        entries: z.array(z.object(entryShape)),
        warnings: z.array(z.string()),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ refresh }) => {
      const set = await registry(refresh);
      return both({ entries: toEntries(set), warnings: set.warnings });
    }
  );

  // Tasks 5-7 register run_om, start_om, get_run, tail_run and cancel_run here.
}
```

- [ ] **Step 5: Write `mcp/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.ts";
import type { OmkitClient } from "../client/index.ts";

/**
 * Kept in step with package.json by hand. It is only the version this server reports to
 * a client in `initialize`, so drifting is cosmetic — but bump both together.
 */
const VERSION = "0.6.0";

export interface McpServerOptions {
  /** The engine every omkit frontend goes through — the MCP server is the third one. */
  readonly client: OmkitClient;
  /** Project root: run folders resolve under `<root>/logs`. */
  readonly root: string;
}

/**
 * Build the server without binding a transport, so tests can connect it to an in-memory
 * pair and a real launch can hand it stdio. Registration is assembly only: what each
 * tool and resource does lives in its own module.
 */
export function createMcpServer(opts: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: "omkit", version: VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );
  registerTools(server, { client: opts.client, root: opts.root });
  return server;
}

/**
 * Bind the server to stdio and serve until the client disconnects. Nothing on this path
 * may write to stdout: it *is* the JSON-RPC stream. Diagnostics go to stderr.
 */
export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const server = createMcpServer(opts);
  await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 6: Wire the CLI command**

Create `packages/omkit/src/cli/commands/mcp.ts`:

```ts
import { startMcpServer } from "../../mcp/server.ts";
import type { OmkitClient } from "../../client/index.ts";

/**
 * The `mcp` command: serve this project over MCP on stdio, until the client hangs up.
 *
 * Deliberately silent. Every other command prints; this one must not, because its stdout
 * is the protocol stream — a banner here shows up at the client as a JSON parse error.
 */
export async function mcpCommand(client: OmkitClient, opts: { root: string }): Promise<void> {
  await startMcpServer({ client, root: opts.root });
  // Resolves once connected; the transport keeps the process alive from here.
  await new Promise<void>(() => {});
}
```

In `packages/omkit/src/cli/index.ts`, add the route beside the others:

```ts
if (cli.command === "mcp") {
  const { mcpCommand } = await import("./commands/mcp.ts");
  await mcpCommand(client, { root: process.cwd() });
  return;
}
```

In `packages/omkit/src/cli/commands/help.ts`, add a line for it, in the same shape as the existing entries:

```
  mcp                  serve this project over MCP on stdio (for Claude and other assistants)
```

- [ ] **Step 7: Add the lint boundary**

In `packages/omkit/eslint.config.js`, after the `client` boundary:

```js
  // The MCP server is a frontend: it may reach down into the client, core and foundation,
  // but not sideways into the CLI, the output writers, or the action batteries.
  boundary(
    "mcp",
    ["**/cli/**", "**/output/**", "**/actions/**"],
    "the mcp server is a frontend over the client — not the CLI, output, or actions"
  ),

  // stdout is the JSON-RPC stream: a stray console.log corrupts it. `src/cli/**` is
  // exempted from no-console below, so the mcp command is pinned back on explicitly.
  {
    files: ["src/mcp/**/*.ts", "src/cli/commands/mcp.ts"],
    rules: { "no-console": "error" },
  },
```

and extend the `client` boundary's forbidden patterns with `"@modelcontextprotocol/*"`, so the SDK cannot leak below the `mcp/` layer.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run packages/omkit/tests/unit/mcp-list-oms.test.ts packages/omkit/tests/unit/help.test.ts packages/omkit/tests/unit/cli-args.test.ts`
Expected: PASS. Update `help.test.ts`'s expectations if it pins the exact help text.

- [ ] **Step 9: Verify it actually boots over stdio**

Run from `d:/tskb/om`: `npx --no -- omkit mcp` — it should print **nothing** and stay open. Kill it with Ctrl+C. Anything on stdout is a bug; the whole point of Global Constraint 3.

- [ ] **Step 10: Typecheck, lint and commit**

Run: `npm run typecheck --workspace omkit && npm run lint --workspace omkit`

```bash
git add packages/omkit/src/mcp packages/omkit/src/cli packages/omkit/package.json packages/omkit/eslint.config.js package-lock.json packages/omkit/tests/unit/mcp-list-oms.test.ts
git commit -m "feat(omkit): serve a project over MCP with omkit mcp and list_oms"
```

---

### Task 5: `run_om` — run one and return a verdict

**Files:**

- Create: `packages/omkit/src/mcp/validate.ts`
- Create: `packages/omkit/src/mcp/verdict.ts`
- Modify: `packages/omkit/src/mcp/tools.ts`
- Test: `packages/omkit/tests/unit/mcp-validate.test.ts`
- Test: `packages/omkit/tests/unit/mcp-run-om.test.ts`

**Interfaces:**

- Consumes: `ToolContext`, `toEntries`, `both`, `toolError` (Task 4); `RunOptions.env` (Task 3); `OmkitClient.run`; `Verdict` from `client/types.ts`.
- Produces: `checkArgs(schema, args)` from `mcp/validate.ts`; `readVerdict(folder)` and the `RunVerdict` interface from `mcp/verdict.ts`.

- [ ] **Step 1: Write the failing validator test**

Create `packages/omkit/tests/unit/mcp-validate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { checkArgs } from "../../src/mcp/validate.ts";

const schema = {
  type: "object",
  properties: {
    token: { type: "string" },
    rows: { type: "number" },
    headless: { type: "boolean" },
    tags: { type: "array" },
  },
  required: ["token", "rows"],
};

describe("checkArgs", () => {
  test("accepts a complete, correctly-typed object", () => {
    expect(checkArgs(schema, { token: "t", rows: 3, headless: true })).toEqual([]);
  });

  test("names every missing required field at once, not just the first", () => {
    expect(checkArgs(schema, {})).toEqual([
      'missing required argument "token"',
      'missing required argument "rows"',
    ]);
  });

  test("reports a wrong primitive type with both the expected and the actual", () => {
    expect(checkArgs(schema, { token: 1, rows: 3 })).toEqual([
      'argument "token" must be a string, got number',
    ]);
  });

  test("accepts an integer for a number and an array for an array", () => {
    expect(checkArgs(schema, { token: "t", rows: 3, tags: ["a"] })).toEqual([]);
  });

  test("ignores fields the schema does not describe rather than rejecting them", () => {
    // The declared schema is the child's to enforce; over-strictness here would reject
    // calls that `resolveArgs` would have accepted.
    expect(checkArgs(schema, { token: "t", rows: 1, extra: 9 })).toEqual([]);
  });

  test("a defaulted field is not required, so omitting it is fine", () => {
    expect(checkArgs(schema, { token: "t", rows: 1 })).toEqual([]);
  });

  test("no schema means nothing to check", () => {
    expect(checkArgs(undefined, { anything: true })).toEqual([]);
  });

  test("a non-object argument is rejected outright", () => {
    expect(checkArgs(schema, "nope")).toEqual(["arguments must be a JSON object"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-validate.test.ts`
Expected: FAIL — cannot resolve `../../src/mcp/validate.ts`.

- [ ] **Step 3: Write `mcp/validate.ts`**

```ts
/**
 * A shallow check of a tool call's `args` against the declared JSON Schema: required
 * fields present, top-level primitives the right type. Deliberately not a validator.
 *
 * The real schema is a zod object living in the om's own process; the server holds only
 * its JSON Schema projection. Spec A's `resolveArgs` is what actually validates, fills
 * defaults, and — when something is still missing — prompts, which reaches the client as
 * an elicitation. This check exists so an obviously-wrong call fails immediately with a
 * message naming every problem, instead of spending a fork to find out.
 */
type JsonSchemaLike = Record<string, unknown> | undefined;

const typeName = (value: unknown): string =>
  Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

/** True when `value` satisfies a JSON Schema `type` keyword. Unknown types always pass. */
function matches(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

/** Every problem found, in schema order. Empty means "worth spawning". */
export function checkArgs(schema: JsonSchemaLike, args: unknown): string[] {
  if (!schema) return [];
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return ["arguments must be a JSON object"];
  }

  const problems: string[] = [];
  const supplied = args as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (supplied[key] === undefined) problems.push(`missing required argument "${key}"`);
  }

  const properties = (schema.properties ?? {}) as Record<string, { type?: unknown }>;
  for (const [key, definition] of Object.entries(properties)) {
    const value = supplied[key];
    if (value === undefined) continue;
    const type = definition?.type;
    if (typeof type !== "string") continue; // unions, $ref, anyOf — the child's problem
    if (!matches(type, value)) {
      problems.push(`argument "${key}" must be a ${type}, got ${typeName(value)}`);
    }
  }
  return problems;
}
```

- [ ] **Step 4: Write `mcp/verdict.ts`**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Verdict } from "../client/types.ts";

/** The structured outcome of a settled run — the verdict a client can act on. */
export interface RunVerdict {
  readonly ok: boolean;
  /** Absolute path of the run folder, or "" when the child died before settling. */
  readonly folder: string;
  readonly assertions: { readonly passed: number; readonly failed: number };
  readonly failures: ReadonlyArray<{ action: string; error: string }>;
  /** The recap block the terminal would have printed. */
  readonly summary: readonly string[];
}

/**
 * Turn a session's {@link Verdict} into a structured one by reading the run's own
 * `result.json`. The channel carries ok / folder / summary; the assert tally and the
 * per-action failures are written to disk by the run itself, so they are read back from
 * there rather than re-derived by parsing the summary lines.
 *
 * A missing or unreadable `result.json` is not an error: a child that died before
 * finalize has none, and the verdict is still true as far as it goes.
 */
export async function readVerdict(verdict: Verdict): Promise<RunVerdict> {
  const base = {
    ok: verdict.ok,
    folder: verdict.folder,
    summary: verdict.summary,
    assertions: { passed: 0, failed: 0 },
    failures: [] as ReadonlyArray<{ action: string; error: string }>,
  };
  if (!verdict.folder) return base;
  try {
    const raw = await readFile(path.join(verdict.folder, "result.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      assertions?: { passed: number; failed: number };
      failures?: Array<{ action: string; error: string }>;
    };
    return {
      ...base,
      assertions: parsed.assertions ?? base.assertions,
      failures: parsed.failures ?? base.failures,
    };
  } catch {
    return base;
  }
}
```

- [ ] **Step 5: Write the failing `run_om` test**

Create `packages/omkit/tests/unit/mcp-run-om.test.ts`. Reuse `stubClient`/`connect` from `mcp-list-oms.test.ts` by copying them in (a shared helper is Task 6's job once three files need it):

```ts
import { afterEach, describe, expect, test } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.ts";
import { createOmkitClient, readRegistrations } from "../../src/client/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "../fixtures/registrations");
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-mcp-"));

/**
 * A real client over the registration fixtures, so this exercises the whole path:
 * discovery fork → tool call → supervised run → verdict read back off disk.
 */
async function connect(): Promise<Client> {
  const real = createOmkitClient({ tsconfig: path.join(fixtures, "tsconfig.omkit.json") });
  // These fixtures import omkit relatively (Global Constraint 12), so the AST scan —
  // which matches the literal `"omkit"` — cannot find them. Drive the fork half directly
  // and override just that one method: `run` stays real, so this still forks real oms and
  // reads back real verdicts. Nothing test-shaped leaks into the shipped config.
  const set = await readRegistrations(
    ["oms/exposed.ts", "oms/hidden.ts", "oms/settles.ts", "oms/fails.ts", "oms/mislabelled.ts"].map(
      (f) => path.join(fixtures, f)
    )
  );
  const omkit = { ...real, discoverRegistrations: async () => set };
  const server = createMcpServer({ client: omkit, root: workdir });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([client.connect(ct), server.connect(st)]);
  return client;
}

let open: Client | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("run_om", () => {
  test("runs a settling om and returns its verdict", async () => {
    open = await connect();
    const result = await open.callTool({
      name: "run_om",
      arguments: { name: "settles", args: { rows: 2 } },
    });
    expect(result.isError).toBeFalsy();
    const verdict = result.structuredContent as {
      ok: boolean;
      folder: string;
      assertions: { passed: number; failed: number };
    };
    expect(verdict.ok).toBe(true);
    expect(verdict.assertions.passed).toBe(1);
    expect(fs.existsSync(path.join(verdict.folder, "result.json"))).toBe(true);
  }, 60_000);

  test("a failing om reports ok:false with its failures, not a thrown error", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "fails" } });
    expect(result.isError).toBeFalsy();
    const verdict = result.structuredContent as {
      ok: boolean;
      failures: Array<{ action: string; error: string }>;
    };
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.length).toBeGreaterThan(0);
  }, 60_000);

  test("refuses a long-lived om and names start_om", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "exposed" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/start_om/);
  }, 60_000);

  test("refuses an om that never called .mcp()", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "hidden" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/not exposed|no om or action/);
  }, 60_000);

  test("rejects missing required args before spawning anything", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "settles" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/missing required argument "rows"/);
  }, 60_000);
});

describe("the settling backstop", () => {
  test("an om declared settling that never settles is cancelled and reported", async () => {
    // `mislabelled` says `mode: "settling"` but behaves like a daemon. Without a backstop
    // the tool call blocks until the *client* gives up, which surfaces as a transport
    // timeout with no run folder and nothing to read. The backstop turns an author's
    // mistake into a message that names it.
    open = await connect();
    const result = await open.callTool(
      { name: "run_om", arguments: { name: "mislabelled", settleTimeoutMs: 3000 } },
      undefined,
      { timeout: 60_000 }
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/did not settle|long-lived/);
  }, 60_000);
});
```

Add two fixtures the test needs, alongside the Task 3 ones:

`packages/omkit/tests/fixtures/registrations/oms/settles.ts`:

```ts
import { z } from "zod";
import { om } from "../../../../src/index.ts";

om("settles")
  .describe({ summary: "Settles immediately with one passing assert" })
  .mcp()
  .args(z.object({ rows: z.number() }))
  .run(async ({ assert }, { rows }) => {
    assert(rows > 0, `rows is positive (${rows})`);
  });
```

`packages/omkit/tests/fixtures/registrations/oms/fails.ts`:

```ts
import { om } from "../../../../src/index.ts";

om("fails")
  .describe({ summary: "Fails, so the verdict has something to report" })
  .mcp()
  .run(async () => {
    throw new Error("deliberate failure");
  });
```

`packages/omkit/tests/fixtures/registrations/oms/mislabelled.ts`:

```ts
import { om } from "../../../../src/index.ts";

// Declares itself settling but never settles — the author error the backstop exists for.
om("mislabelled")
  .describe({ summary: "Claims to settle, does not" })
  .mcp({ mode: "settling" })
  .run(async ({ signal }) => {
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
  });
```

Add it to the file list in `connect()` above, and to `fixtureFiles` in Task 6's harness.

and `packages/omkit/tests/fixtures/registrations/tsconfig.omkit.json`, matching the other fixture configs:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["oms/**/*.ts", "actions/**/*.ts"]
}
```

- [ ] **Step 6: Register `run_om`**

Add to `registerTools` in `packages/omkit/src/mcp/tools.ts`:

```ts
/** Find an exposed entry by name. Oms win a collision — they are the primary surface. */
const findEntry = async (name: string, refresh = false): Promise<ToolEntry | undefined> => {
  const entries = toEntries(await registry(refresh));
  return (
    entries.find((e) => e.kind === "om" && e.name === name) ?? entries.find((e) => e.name === name)
  );
};

const verdictShape = {
  ok: z.boolean(),
  folder: z.string(),
  assertions: z.object({ passed: z.number(), failed: z.number() }),
  failures: z.array(z.object({ action: z.string(), error: z.string() })),
  summary: z.array(z.string()),
};

server.registerTool(
  "run_om",
  {
    title: "Run an om and wait for its verdict",
    description:
      "Runs a settling om (or an exposed action) to completion and returns whether it " +
      "passed, where its run folder is, its assert tally, and any failures. Call list_oms " +
      "first to learn what `args` to pass. A long-lived entry is refused — use start_om.",
    inputSchema: {
      name: z.string().describe("The om or action name, as reported by list_oms."),
      args: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Arguments matching the entry's inputSchema from list_oms."),
      settleTimeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("How long to wait for the run to settle before giving up. Default 10 minutes."),
    },
    outputSchema: verdictShape,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ name, args, settleTimeoutMs }) => {
    const entry = await findEntry(name);
    if (!entry) return toolError(`no om or action named "${name}" is exposed. Call list_oms.`);
    if (entry.unavailable) return toolError(`"${name}" is unavailable: ${entry.unavailable}`);
    if (entry.mode === "long-lived") {
      return toolError(`"${name}" is long-lived — start it with start_om, not run_om.`);
    }
    const problems = checkArgs(entry.inputSchema, args ?? {});
    if (problems.length) return toolError(problems.join("\n"));

    const session = ctx.client.run(entry.file, {
      cwd: ctx.root,
      env: { OMKIT_ARGS: JSON.stringify(args ?? {}) },
    });
    const settled = await settleWithin(session, settleTimeoutMs ?? SETTLE_TIMEOUT_MS);
    if (!settled) {
      return toolError(
        `"${name}" is declared settling but did not settle within ` +
          `${settleTimeoutMs ?? SETTLE_TIMEOUT_MS}ms, so it was cancelled. If it is meant to ` +
          `stay up, declare .mcp({ mode: "long-lived" }) and start it with start_om.`
      );
    }
    return both(await readVerdict(settled));
  }
);
```

And the backstop itself, beside the tool:

```ts
/**
 * How long a "settling" run gets before the server gives up on it. Generous: a real smoke
 * suite can take minutes, and a backstop that fires early is worse than none.
 */
const SETTLE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Wait for a run to settle, or cancel it and report that it did not.
 *
 * `mode` is the author's claim, and a wrong claim would otherwise hang the tool call
 * until the *client* times out — which surfaces as a transport error with no run folder
 * and nothing to read. Cancelling instead turns the mistake into a message that names it,
 * and the run still writes its folder on the way down, so there is something to inspect.
 */
async function settleWithin(session: RunSession, ms: number): Promise<Verdict | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    const winner = await Promise.race([session.result, expired]);
    if (winner) return winner;
    session.cancel();
    // Give teardown a chance to finish writing before reporting; the run is already lost
    // either way, so a slow teardown must not extend the wait indefinitely.
    await Promise.race([session.result, new Promise((r) => setTimeout(r, 10_000))]);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
```

Import `path`, `checkArgs`, `readVerdict`, and the `RunSession` / `Verdict` types at the top of `tools.ts`. Action entries are routed through the host om in Task 10; until then `entry.file` is the om file and an action-backed call would run the wrong thing — Task 10 fixes it, and its test is the gate.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run packages/omkit/tests/unit/mcp-validate.test.ts packages/omkit/tests/unit/mcp-run-om.test.ts packages/omkit/tests/unit/mcp-list-oms.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint and commit**

Run: `npm run typecheck --workspace omkit && npm run lint --workspace omkit`

```bash
git add packages/omkit/src packages/omkit/tests
git commit -m "feat(omkit): run an om over MCP and return its verdict"
```

---

### Task 6: The run registry — `start_om`, `get_run`, `cancel_run`

A long-lived om cannot be awaited inside a tool call, so `start_om` hands back a handle and the run keeps going. That needs somewhere to keep live sessions, which `tail_run` (Task 7) and progress (Task 8) then read from.

**Files:**

- Create: `packages/omkit/src/mcp/runs.ts`
- Create: `packages/omkit/tests/support/mcp-harness.ts`
- Modify: `packages/omkit/src/mcp/server.ts`
- Modify: `packages/omkit/src/mcp/tools.ts`
- Test: `packages/omkit/tests/unit/mcp-runs.test.ts`

**Interfaces:**

- Consumes: `RunSession`, `Verdict` from `client/types.ts`; `readVerdict` (Task 5); `newUuid`, `shortId` from `foundation/ids.ts`.
- Produces: `RunRegistry`, `LiveRun` from `mcp/runs.ts`; `ToolContext.runs`; `connectServer(...)` from `tests/support/mcp-harness.ts`.

**Deviation D1 applies here.** `start_om` cannot report the dated run folder: it is stamped inside the child on first access. It returns a server-assigned `runId` plus the `folderName` (`<name>-<hash8>`), which the parent _can_ derive. `get_run` and `tail_run` accept either a `runId` or a run-folder path already on disk.

- [ ] **Step 1: Write `mcp/runs.ts`**

```ts
import { newUuid, shortId } from "../foundation/ids.ts";
import type { LogEntry } from "../foundation/LogEntry.ts";
import type { RunSession, Verdict } from "../client/types.ts";

/**
 * How many log entries a live run keeps for `tail_run`. A watch-mode om can emit for
 * hours, so the buffer is bounded and the oldest entries are dropped; `raw.jsonl` on
 * disk remains the complete record, and a settled run is read from there instead.
 */
const BUFFER_LIMIT = 5000;

export interface LiveRun {
  readonly id: string;
  /** The om or action name the client asked for. */
  readonly name: string;
  /** `<name>-<hash8>` — known before the run creates its dated folder. */
  readonly folderName: string;
  readonly session: RunSession;
  readonly startedAt: number;
  status: "running" | "settled";
  verdict?: Verdict;
  /** The tail buffer. Entries are appended in sequence order, oldest dropped first. */
  readonly entries: LogEntry[];
  /** How many entries fell off the front, so `tail_run` can say so rather than lie. */
  dropped: number;
}

/**
 * Every run this server started, live or settled. Runs are kept after settling so a
 * client that started one can still ask what happened without knowing its folder — the
 * folder only becomes knowable once the run has created it.
 */
export class RunRegistry {
  private readonly runs = new Map<string, LiveRun>();

  /**
   * Take ownership of a session. Subscription happens here, not at the call site,
   * because `session.on("log")` must be attached before the first entry arrives —
   * a tail that starts at the tool boundary has already missed the run's opening.
   */
  start(name: string, folderName: string, session: RunSession): LiveRun {
    const run: LiveRun = {
      id: shortId(newUuid()),
      name,
      folderName,
      session,
      startedAt: Date.now(),
      status: "running",
      entries: [],
      dropped: 0,
    };
    session.on("log", (entry) => {
      run.entries.push(entry);
      if (run.entries.length > BUFFER_LIMIT) {
        run.entries.splice(0, run.entries.length - BUFFER_LIMIT);
        run.dropped = run.entries[0]!.sequence;
      }
    });
    void session.result.then((verdict) => {
      run.status = "settled";
      run.verdict = verdict;
    });
    this.runs.set(run.id, run);
    return run;
  }

  get(id: string): LiveRun | undefined {
    return this.runs.get(id);
  }

  all(): LiveRun[] {
    return [...this.runs.values()];
  }

  /** Cancel every live run — the server is going away and its children must not outlive it. */
  cancelAll(): void {
    for (const run of this.runs.values()) {
      if (run.status === "running") run.session.cancel();
    }
  }
}
```

- [ ] **Step 2: Write the test harness**

Create `packages/omkit/tests/support/mcp-harness.ts` — three test files need it now, so the copy-paste from Task 5 ends here:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.ts";
import { createOmkitClient, readRegistrations } from "../../src/client/index.ts";
import type { OmkitClient } from "../../src/client/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixtureDir = path.join(here, "../fixtures/registrations");

/** The registration fixtures, listed explicitly — the AST scan cannot see them (GC 12). */
export const fixtureFiles = [
  "oms/exposed.ts",
  "oms/hidden.ts",
  "oms/explodes.ts",
  "oms/settles.ts",
  "oms/fails.ts",
  "oms/mislabelled.ts",
  "oms/waits.ts",
  "actions/seed.ts",
].map((f) => path.join(fixtureDir, f));

/**
 * A real client over the fixture project, with only `discoverRegistrations` overridden.
 * The registration set comes from a real fork over {@link fixtureFiles}; `run` is
 * untouched, so tools still fork real oms and read back real verdicts. The override
 * exists because the AST scan matches the literal `"omkit"` and these fixtures import
 * omkit relatively — not because the server is being faked.
 */
export async function fixtureClient(): Promise<OmkitClient> {
  const real = createOmkitClient({ tsconfig: path.join(fixtureDir, "tsconfig.omkit.json") });
  const set = await readRegistrations(fixtureFiles);
  return { ...real, discoverRegistrations: async () => set };
}

/** Connect an in-process client to a server built over `client`. Close it in `afterEach`. */
export async function connectServer(client: OmkitClient, root: string): Promise<Client> {
  const server = createMcpServer({ client, root });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test", version: "0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
  return mcp;
}
```

Add the long-lived fixture `packages/omkit/tests/fixtures/registrations/oms/waits.ts`:

```ts
import { om } from "../../../../src/index.ts";

om("waits")
  .describe({ summary: "Stays up until it is cancelled" })
  .mcp({ mode: "long-lived" })
  .run(async ({ signal }) => {
    console.log("up");
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
  });
```

- [ ] **Step 3: Write the failing test**

Create `packages/omkit/tests/unit/mcp-runs.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectServer, fixtureClient } from "../support/mcp-harness.ts";

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-mcp-runs-"));
let open: Client | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("start_om", () => {
  test("returns a handle immediately for a long-lived om", async () => {
    open = await connectServer(await fixtureClient(), workdir);
    const started = Date.now();
    const result = await open.callTool({ name: "start_om", arguments: { name: "waits" } });
    const handle = result.structuredContent as { runId: string; folderName: string };

    expect(handle.runId).toMatch(/^[0-9a-f]{8}$/);
    expect(handle.folderName).toMatch(/^waits-[0-9a-f]{8}$/);
    // "Immediately" means it did not wait for the run: `waits` never settles on its own.
    expect(Date.now() - started).toBeLessThan(20_000);

    await open.callTool({ name: "cancel_run", arguments: { runId: handle.runId } });
  }, 60_000);

  test("accepts a settling om too — 'start this and come back' is a valid use", async () => {
    open = await connectServer(await fixtureClient(), workdir);
    const result = await open.callTool({
      name: "start_om",
      arguments: { name: "settles", args: { rows: 1 } },
    });
    expect(result.isError).toBeFalsy();
  }, 60_000);
});

describe("get_run", () => {
  test("reports a live run as running, then its verdict once settled", async () => {
    open = await connectServer(await fixtureClient(), workdir);
    const started = (
      await open.callTool({ name: "start_om", arguments: { name: "settles", args: { rows: 1 } } })
    ).structuredContent as { runId: string };

    // Poll rather than sleep a fixed amount: the run's duration is not this test's business.
    let status = "running";
    let folder = "";
    for (let i = 0; i < 60 && status === "running"; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const seen = (await open!.callTool({ name: "get_run", arguments: { run: started.runId } }))
        .structuredContent as { status: string; folder: string };
      status = seen.status;
      folder = seen.folder;
    }
    expect(status).toBe("settled");
    expect(fs.existsSync(path.join(folder, "result.json"))).toBe(true);
  }, 60_000);

  test("an unknown handle is a tool error, not a crash", async () => {
    open = await connectServer(await fixtureClient(), workdir);
    const result = await open.callTool({ name: "get_run", arguments: { run: "deadbeef" } });
    expect(result.isError).toBe(true);
  }, 60_000);
});

describe("cancel_run", () => {
  test("tears a long-lived run down and it still writes its folder", async () => {
    open = await connectServer(await fixtureClient(), workdir);
    const handle = (await open.callTool({ name: "start_om", arguments: { name: "waits" } }))
      .structuredContent as { runId: string };

    const cancelled = await open.callTool({
      name: "cancel_run",
      arguments: { runId: handle.runId },
    });
    expect(cancelled.isError).toBeFalsy();

    let folder = "";
    for (let i = 0; i < 60 && !folder; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const seen = (await open!.callTool({ name: "get_run", arguments: { run: handle.runId } }))
        .structuredContent as { status: string; folder: string };
      if (seen.status === "settled") folder = seen.folder;
    }
    // Cancellation is a teardown, not a kill: the run still narrates itself to disk.
    expect(fs.existsSync(path.join(folder, "main.log"))).toBe(true);
  }, 60_000);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-runs.test.ts`
Expected: FAIL — `start_om` is registered but has no implementation yet (Task 4 left it out of `registerTools`).

- [ ] **Step 5: Register the three tools**

In `packages/omkit/src/mcp/server.ts`, build a `RunRegistry`, pass it into `registerTools`, and cancel everything when the transport closes:

```ts
const runs = new RunRegistry();
registerTools(server, { client: opts.client, root: opts.root, runs });
// The client hung up. Its runs are children of this process and must not outlive it.
// Chain rather than assign: `onclose` is a single slot on the SDK's Protocol base, so a
// bare assignment would silently drop whatever the SDK (or a future us) put there.
const previousOnClose = server.server.onclose;
server.server.onclose = () => {
  runs.cancelAll();
  previousOnClose?.();
};
```

Add `readonly runs: RunRegistry` to `ToolContext`. Then in `mcp/tools.ts`:

```ts
/** Launch an entry and register the session. Shared by `run_om` and `start_om`. */
const launch = (entry: ToolEntry, args: Record<string, unknown>): LiveRun =>
  ctx.runs.start(
    entry.name,
    entry.folderName ?? entry.name,
    ctx.client.run(entry.file, {
      cwd: ctx.root,
      env: { OMKIT_ARGS: JSON.stringify(args) },
    })
  );

server.registerTool(
  "start_om",
  {
    title: "Start an om without waiting for it",
    description:
      "Starts an om or exposed action and returns a handle straight away. Use this for a " +
      "long-lived entry (a server, a watcher), or for a long suite you want to check on " +
      "later. Follow up with get_run, tail_run and cancel_run.",
    inputSchema: {
      name: z.string().describe("The om or action name, as reported by list_oms."),
      args: z.record(z.string(), z.unknown()).optional(),
    },
    outputSchema: {
      runId: z.string(),
      name: z.string(),
      // The dated run folder does not exist yet — this is the folder *family*.
      folderName: z.string(),
      mode: z.enum(["settling", "long-lived"]),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ name, args }) => {
    const entry = await findEntry(name);
    if (!entry) return toolError(`no om or action named "${name}" is exposed. Call list_oms.`);
    if (entry.unavailable) return toolError(`"${name}" is unavailable: ${entry.unavailable}`);
    const problems = checkArgs(entry.inputSchema, args ?? {});
    if (problems.length) return toolError(problems.join("\n"));

    const run = launch(entry, args ?? {});
    return both({
      runId: run.id,
      name: entry.name,
      folderName: run.folderName,
      mode: entry.mode,
    });
  }
);

server.registerTool(
  "get_run",
  {
    title: "Check on a run",
    description:
      "Reports whether a run is still going and, once it has settled, its verdict and the " +
      "files it produced. `run` is a runId from start_om, or a run folder path under logs/.",
    inputSchema: { run: z.string() },
    outputSchema: {
      status: z.enum(["running", "settled"]),
      name: z.string(),
      folder: z.string(),
      ok: z.boolean().optional(),
      assertions: z.object({ passed: z.number(), failed: z.number() }).optional(),
      failures: z.array(z.object({ action: z.string(), error: z.string() })).optional(),
      summary: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ run }) => {
    const live = ctx.runs.get(run);
    if (!live) return toolError(`no run "${run}". Pass a runId from start_om.`);
    if (live.status === "running") {
      return both({ status: "running" as const, name: live.name, folder: "" });
    }
    const verdict = await readVerdict(live.verdict!);
    return both({ status: "settled" as const, name: live.name, ...verdict });
  }
);

server.registerTool(
  "cancel_run",
  {
    title: "Cancel a running om",
    description:
      "Tears a run down gracefully. It still finishes writing its run folder, so the logs " +
      "and verdict of a cancelled run are readable afterwards.",
    inputSchema: { runId: z.string() },
    outputSchema: { runId: z.string(), cancelled: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  async ({ runId }) => {
    const live = ctx.runs.get(runId);
    if (!live) return toolError(`no run "${runId}".`);
    if (live.status === "settled") return both({ runId, cancelled: false });
    live.session.cancel();
    return both({ runId, cancelled: true });
  }
);
```

Rewrite `run_om`'s body to launch through `launch()` too, so every run lands in the registry. Keep the settling backstop from Task 5 — it wraps the session, not the launch:

```ts
const run = launch(entry, args ?? {});
const settled = await settleWithin(run.session, settleTimeoutMs ?? SETTLE_TIMEOUT_MS);
if (!settled) return toolError(/* …the same message as in Task 5… */);
return both(await readVerdict(settled));
```

Task 9 extends `get_run` with `resource_link` items for the run's files; leave that out for now.

- [ ] **Step 6: Run the tests and commit**

Run: `npx vitest run packages/omkit/tests/unit/mcp-runs.test.ts packages/omkit/tests/unit/mcp-run-om.test.ts`
Expected: PASS.

Run: `npm run typecheck --workspace omkit && npm run lint --workspace omkit`

```bash
git add packages/omkit/src packages/omkit/tests
git commit -m "feat(omkit): start, inspect and cancel runs over MCP"
```

---

### Task 7: `tail_run`

**Files:**

- Create: `packages/omkit/src/mcp/tail.ts`
- Modify: `packages/omkit/src/mcp/tools.ts`
- Test: `packages/omkit/tests/unit/mcp-tail.test.ts`

**Interfaces:**

- Consumes: `LiveRun`, `RunRegistry` (Task 6); `LogEntry` from `foundation/LogEntry.ts`.
- Produces: `tailLive(run, cursor, limit)` and `tailFile(folder, cursor, limit)` from `mcp/tail.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/omkit/tests/unit/mcp-tail.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tailFile, tailLive } from "../../src/mcp/tail.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const entry = (sequence: number, message: string): LogEntry => ({
  sequence,
  ts: 0,
  nodeId: "main",
  path: "main",
  level: "info",
  source: "run",
  message,
});

describe("tailLive", () => {
  const run = {
    entries: [entry(1, "one"), entry(2, "two"), entry(3, "three")],
    dropped: 0,
  };

  test("returns everything after the cursor and reports where to resume", () => {
    expect(tailLive(run, 1, 10)).toEqual({
      entries: [entry(2, "two"), entry(3, "three")],
      nextCursor: 3,
      dropped: 0,
    });
  });

  test("a cursor at the end returns nothing and holds its place", () => {
    expect(tailLive(run, 3, 10)).toEqual({ entries: [], nextCursor: 3, dropped: 0 });
  });

  test("caps at the limit and resumes from the last entry it returned", () => {
    expect(tailLive(run, 0, 2)).toEqual({
      entries: [entry(1, "one"), entry(2, "two")],
      nextCursor: 2,
      dropped: 0,
    });
  });

  test("reports the buffer's low-water mark so a lagging client knows it missed lines", () => {
    expect(tailLive({ entries: [entry(90, "late")], dropped: 89 }, 0, 10).dropped).toBe(89);
  });
});

describe("tailFile", () => {
  test("reads a settled run's raw.jsonl from the cursor, skipping unparseable lines", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-tail-"));
    fs.writeFileSync(
      path.join(dir, "raw.jsonl"),
      [JSON.stringify(entry(1, "one")), "{ not json", JSON.stringify(entry(2, "two")), ""].join(
        "\n"
      ),
      "utf8"
    );
    // A partially-written line is normal: the file is appended to live, and a tail may
    // catch it mid-write. Skipping beats failing the whole call.
    expect(tailFile(dir, 1, 10)).toEqual({
      entries: [entry(2, "two")],
      nextCursor: 2,
      dropped: 0,
    });
  });

  test("a folder with no raw.jsonl reads as empty rather than throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-tail-empty-"));
    expect(tailFile(dir, 0, 10)).toEqual({ entries: [], nextCursor: 0, dropped: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-tail.test.ts`
Expected: FAIL — cannot resolve `../../src/mcp/tail.ts`.

- [ ] **Step 3: Write `mcp/tail.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { LogEntry } from "../foundation/LogEntry.ts";

export interface TailPage {
  readonly entries: LogEntry[];
  /** Pass this back as `cursor` to continue where this page stopped. */
  readonly nextCursor: number;
  /** The oldest sequence still available, when the live buffer has dropped older lines. */
  readonly dropped: number;
}

const page = (entries: LogEntry[], cursor: number, dropped: number): TailPage => ({
  entries,
  nextCursor: entries.length ? entries[entries.length - 1]!.sequence : cursor,
  dropped,
});

/**
 * A page from a live run's buffer. `sequence` is the run-global monotonic key the log
 * store stamps, so it doubles as the cursor with nothing extra to track.
 */
export function tailLive(
  run: { entries: readonly LogEntry[]; dropped: number },
  cursor: number,
  limit: number
): TailPage {
  const after = run.entries.filter((e) => e.sequence > cursor).slice(0, limit);
  return page(after, cursor, run.dropped);
}

/**
 * A page from a settled run's `raw.jsonl` — the complete record, which the bounded live
 * buffer is not. Read whole and filtered: run logs are bounded by the run, and a
 * streaming reader would buy little for a lot of machinery.
 *
 * An unparseable line is skipped rather than fatal: `raw.jsonl` is appended to during the
 * run, so a tail can catch a line mid-write.
 */
export function tailFile(folder: string, cursor: number, limit: number): TailPage {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(folder, "raw.jsonl"), "utf8");
  } catch {
    return { entries: [], nextCursor: cursor, dropped: 0 };
  }
  const entries: LogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: LogEntry;
    try {
      parsed = JSON.parse(line) as LogEntry;
    } catch {
      continue;
    }
    if (typeof parsed.sequence !== "number" || parsed.sequence <= cursor) continue;
    entries.push(parsed);
    if (entries.length >= limit) break;
  }
  return page(entries, cursor, 0);
}
```

- [ ] **Step 4: Register `tail_run`**

In `packages/omkit/src/mcp/tools.ts`:

```ts
server.registerTool(
  "tail_run",
  {
    title: "Read a run's log from a cursor",
    description:
      "Returns log lines after `cursor`, from the live run while it is going and from its " +
      "raw.jsonl once it has settled. Pass the returned nextCursor back to continue. `run` " +
      "is a runId from start_om, or a run folder path under logs/.",
    inputSchema: {
      run: z.string(),
      cursor: z.number().int().nonnegative().optional().describe("0, or the last nextCursor."),
      limit: z.number().int().positive().max(1000).optional().describe("Default 200."),
    },
    outputSchema: {
      entries: z.array(
        z.object({
          sequence: z.number(),
          ts: z.number(),
          path: z.string(),
          level: z.string(),
          source: z.string(),
          message: z.string(),
        })
      ),
      nextCursor: z.number(),
      dropped: z.number(),
      status: z.enum(["running", "settled"]),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ run, cursor = 0, limit = 200 }) => {
    const live = ctx.runs.get(run);
    if (!live) return toolError(`no run "${run}". Pass a runId from start_om.`);
    if (live.status === "running") {
      return both({ ...tailLive(live, cursor, limit), status: "running" as const });
    }
    const folder = live.verdict?.folder;
    if (!folder) return toolError(`run "${run}" settled without writing a folder.`);
    return both({ ...tailFile(folder, cursor, limit), status: "settled" as const });
  }
);
```

`run` is a `runId` only for now. Task 9 brings the path confinement that makes accepting a
run-folder path safe, and extends this branch there — do not accept a caller-supplied path
before that check exists.

Trim each entry to the fields the output schema declares — `nodeId` is an internal id and
adds nothing a client can use.

- [ ] **Step 5: Pin the fixed tool list**

All six tools exist as of this task, so this is the first point the headline claim can be
asserted. Add to `mcp-list-oms.test.ts`:

```ts
test("advertises a fixed tool list that does not depend on the project", async () => {
  open = await connect();
  const { tools } = await open.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual([
    "cancel_run",
    "get_run",
    "list_oms",
    "run_om",
    "start_om",
    "tail_run",
  ]);
});
```

- [ ] **Step 6: Run the tests and commit**

Run: `npx vitest run packages/omkit/tests/unit/mcp-tail.test.ts packages/omkit/tests/unit/mcp-runs.test.ts packages/omkit/tests/unit/mcp-list-oms.test.ts`
Expected: PASS.

```bash
git add packages/omkit/src packages/omkit/tests
git commit -m "feat(omkit): tail a run's log over MCP from a cursor"
```

---

### Task 8: Progress, cancellation, and elicitation

The three ways a live run talks to the client during a `run_om` call.

**Files:**

- Create: `packages/omkit/src/mcp/progress.ts`
- Modify: `packages/omkit/src/mcp/tools.ts`
- Test: `packages/omkit/tests/unit/mcp-progress.test.ts`

**Interfaces:**

- Consumes: `RunSession`, `PromptRequest` from `client/types.ts`; `PromptSpec` from `core/interaction.ts`; the SDK's `RequestHandlerExtra`.
- Produces: `attachProgress(session, extra)` and `attachElicitation(server, session)` from `mcp/progress.ts`.

**MCP facts, verified against the 1.30.0 typings:**

- Progress: `extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress, message } })`. Send only when `extra._meta?.progressToken` is present. `progress` must increase monotonically; `total` may be omitted.
- Cancellation arrives as an abort on `extra.signal` — the SDK maps `notifications/cancelled` onto it. No handler to register.
- Elicitation: `server.server.elicitInput({ message, requestedSchema }, { signal })`. `requestedSchema` is `{ type: "object", properties: {...}, required?: [...] }` with **top-level primitives only**. The result is `{ action: "accept" | "decline" | "cancel", content? }`.

- [ ] **Step 1: Write the failing test**

Create `packages/omkit/tests/unit/mcp-progress.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { isMilestone, toRequestedSchema } from "../../src/mcp/progress.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const at = (level: string): LogEntry => ({
  sequence: 1,
  ts: 0,
  nodeId: "main",
  path: "main",
  level,
  source: "run",
  message: "m",
});

describe("isMilestone", () => {
  test("forwards the levels that mark something happening", () => {
    for (const level of ["run", "event", "assert", "error", "artifact", "child"]) {
      expect(isMilestone(at(level))).toBe(true);
    }
  });

  test("drops ordinary console narration, which would flood the channel", () => {
    expect(isMilestone(at("info"))).toBe(false);
  });
});

describe("toRequestedSchema", () => {
  test("maps a choice prompt to an enum, so the client can only answer validly", () => {
    expect(
      toRequestedSchema({
        kind: "choice",
        message: "Run tests?",
        default: "no",
        choices: [
          { label: "no", value: "no" },
          { label: "yes", value: "yes" },
        ],
      })
    ).toEqual({
      type: "object",
      properties: {
        value: { type: "string", enum: ["no", "yes"], description: "Run tests?" },
      },
      required: ["value"],
    });
  });

  test("maps an input prompt to a plain string, carrying the hint as the description", () => {
    expect(
      toRequestedSchema({ kind: "input", message: "token", default: "", hint: "a string" })
    ).toEqual({
      type: "object",
      properties: { value: { type: "string", description: "token — a string" } },
      required: ["value"],
    });
  });

  test("a multiline prompt is still one string field — MCP allows no nesting", () => {
    const schema = toRequestedSchema({ kind: "multiline", message: "config JSON", default: "" });
    expect(schema.properties.value.type).toBe("string");
  });
});
```

Then the wiring test, in the same file:

```ts
describe("attachProgress", () => {
  test("emits a progress notification per milestone, with the log sequence as progress", async () => {
    const { attachProgress } = await import("../../src/mcp/progress.ts");
    const sendNotification = vi.fn(async () => {});
    const handlers: Array<(e: LogEntry) => void> = [];
    const session = {
      on: (event: string, handler: (e: LogEntry) => void) => {
        if (event === "log") handlers.push(handler);
      },
    };

    attachProgress(
      session as never,
      {
        _meta: { progressToken: "tok" },
        signal: new AbortController().signal,
        sendNotification,
      } as never
    );

    handlers[0]!({ ...at("event"), sequence: 7, message: "server up" });
    handlers[0]!({ ...at("info"), sequence: 8, message: "noise" });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0]![0]).toMatchObject({
      method: "notifications/progress",
      params: { progressToken: "tok", progress: 7 },
    });
  });

  test("sends nothing when the client supplied no progress token", async () => {
    const { attachProgress } = await import("../../src/mcp/progress.ts");
    const sendNotification = vi.fn(async () => {});
    const handlers: Array<(e: LogEntry) => void> = [];
    const session = {
      on: (event: string, h: (e: LogEntry) => void) => {
        if (event === "log") handlers.push(h);
      },
    };
    attachProgress(
      session as never,
      {
        signal: new AbortController().signal,
        sendNotification,
      } as never
    );
    handlers[0]?.({ ...at("event"), sequence: 1 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  test("an aborted request cancels the run", async () => {
    const { attachProgress } = await import("../../src/mcp/progress.ts");
    const cancel = vi.fn();
    const controller = new AbortController();
    attachProgress(
      { on: () => {}, cancel } as never,
      {
        signal: controller.signal,
        sendNotification: async () => {},
      } as never
    );
    controller.abort();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-progress.test.ts`
Expected: FAIL — cannot resolve `../../src/mcp/progress.ts`.

- [ ] **Step 3: Write `mcp/progress.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LogEntry } from "../foundation/LogEntry.ts";
import type { PromptSpec } from "../core/interaction.ts";
import type { PromptRequest, RunSession } from "../client/types.ts";

/**
 * Which log levels count as "something happened". Forwarding every entry would turn a
 * chatty run into a notification flood; these are the levels that mark a step, an event,
 * an assertion, a failure, or a file — the same shape the terminal's live renderer
 * treats as worth showing.
 */
const MILESTONE_LEVELS = new Set(["run", "event", "assert", "error", "artifact", "child"]);

export function isMilestone(entry: LogEntry): boolean {
  return MILESTONE_LEVELS.has(entry.level);
}

/** The subset of the SDK's request context this module needs — kept narrow so tests can fake it. */
interface ProgressExtra {
  readonly signal: AbortSignal;
  readonly _meta?: { progressToken?: string | number };
  readonly sendNotification: (n: {
    method: "notifications/progress";
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
}

/**
 * Wire a live run to the request that started it: milestones become progress
 * notifications, and the client cancelling the request tears the run down.
 *
 * `progress` is the log store's run-global sequence, which is monotonic by construction —
 * exactly what the spec requires, with no counter to keep. `total` is omitted, which the
 * spec permits, because a run does not know how many steps it has left.
 *
 * Progress is a courtesy, not a deadline extension: whether a client resets its timeout
 * on progress is implementation-dependent, so a long run still belongs in `start_om`.
 */
export function attachProgress(session: RunSession, extra: ProgressExtra): void {
  const token = extra._meta?.progressToken;
  if (token !== undefined) {
    session.on("log", (entry) => {
      if (!isMilestone(entry)) return;
      void extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken: token, progress: entry.sequence, message: entry.message },
        })
        .catch(() => {
          // The client went away mid-run. The run is cancelled through `signal` anyway;
          // a rejected notification must not fault the run itself.
        });
    });
  }
  extra.signal.addEventListener("abort", () => session.cancel(), { once: true });
}

/** MCP's elicitation schema: top-level primitives only, no nesting. */
export interface RequestedSchema {
  type: "object";
  properties: { value: { type: "string"; enum?: string[]; description: string } };
  required: string[];
}

/**
 * Turn one of omkit's prompt specs into an elicitation request. All three kinds become a
 * single `value` string: a choice narrows it with `enum` so the client cannot answer
 * invalidly, and a multiline prompt stays a string because MCP's restricted schema has
 * nowhere to say "several lines".
 */
export function toRequestedSchema(spec: PromptSpec): RequestedSchema {
  const description = spec.hint ? `${spec.message} — ${spec.hint}` : spec.message;
  return {
    type: "object",
    properties: {
      value: {
        type: "string",
        ...(spec.kind === "choice" && spec.choices
          ? { enum: spec.choices.map((c) => c.value) }
          : {}),
        description,
      },
    },
    required: ["value"],
  };
}

/**
 * Forward the run's prompts to the client as elicitations, and its answers back.
 *
 * prompt.ts already describes its supervisor as "whoever owns the terminal (Ink app / MCP
 * client)" — this is that. A declined or cancelled elicitation answers with the prompt's
 * own default rather than leaving the run to time out three times over: the run has to
 * make progress either way, and the default is what a timeout would have produced.
 *
 * `promptDone` means the child gave up first; the in-flight elicitation is aborted so the
 * client's dialog does not linger with nothing behind it.
 */
export function attachElicitation(server: McpServer, session: RunSession): void {
  const pending = new Map<string, AbortController>();

  session.on("promptDone", (id) => {
    pending.get(id)?.abort();
    pending.delete(id);
  });

  session.on("prompt", (request: PromptRequest) => {
    const controller = new AbortController();
    pending.set(request.id, controller);
    void (async () => {
      try {
        const result = await server.server.elicitInput(
          { message: request.spec.message, requestedSchema: toRequestedSchema(request.spec) },
          { signal: controller.signal }
        );
        const value =
          result.action === "accept" && typeof result.content?.value === "string"
            ? result.content.value
            : request.spec.default;
        session.answer(request.id, value, result.action === "accept" ? "elicitation" : "default");
      } catch {
        // Aborted, or a client with no elicitation capability. Either way the run must
        // not hang on us: hand it the default and let it carry on.
        if (!controller.signal.aborted) session.answer(request.id, request.spec.default, "default");
      } finally {
        pending.delete(request.id);
      }
    })();
  });
}
```

- [ ] **Step 4: Attach both in `run_om` and `start_om`**

In `mcp/tools.ts`, `launch()` gains the server and the request context. For `run_om`, attach
both before awaiting the result:

```ts
const run = launch(entry, args ?? {});
attachProgress(run.session, extra as never);
attachElicitation(server, run.session);
const settled = await settleWithin(run.session, settleTimeoutMs ?? SETTLE_TIMEOUT_MS);
if (!settled) return toolError(/* …the same message as in Task 5… */);
return both(await readVerdict(settled));
```

`start_om` attaches only elicitation: its request ends immediately, so its `extra.signal`
aborts as soon as the tool returns and would cancel the run it just started. Say so in a
comment — it is exactly the kind of thing a later reader would "fix".

- [ ] **Step 5: Run the tests and commit**

Run: `npx vitest run packages/omkit/tests/unit/mcp-progress.test.ts packages/omkit/tests/unit/mcp-run-om.test.ts packages/omkit/tests/unit/mcp-runs.test.ts`
Expected: PASS.

```bash
git add packages/omkit/src packages/omkit/tests
git commit -m "feat(omkit): report progress, honour cancellation, and elicit prompts"
```

---

### Task 9: Resources — reading what a run produced

Two URI templates over `logs/`, with the path confinement that makes them safe to hand a model.

**Files:**

- Create: `packages/omkit/src/mcp/resources.ts`
- Modify: `packages/omkit/src/mcp/tools.ts`
- Modify: `packages/omkit/src/mcp/server.ts`
- Test: `packages/omkit/tests/unit/mcp-resources.test.ts`

**Interfaces:**

- Consumes: `ToolContext.root`; `ArtifactView` from `output/writers/views.ts` (as a **type only** — `mcp/` may not import the output layer's code, so re-declare the shape locally rather than importing it).
- Produces: `registerResources(server, { root })`, `resolveRunFolder(root, candidate)`, `readRunFile(root, segments)`, `latestRun(root, folderName)` from `mcp/resources.ts`.

**MCP facts (1.30.0):**

- `server.registerResource(name, new ResourceTemplate(uri, { list: undefined }), config, cb)`; the callback is `(uri: URL, variables, extra)`.
- A read returns `{ contents: [{ uri, mimeType, text }] }` or `{ uri, mimeType, blob }` (base64).
- A `resource_link` content block is `{ type: "resource_link", uri, name, description?, mimeType? }`.
- URI template variables do not match `/`, so a variable cannot smuggle a path segment. Confinement is still enforced — the template is a convenience, not a security boundary.

- [ ] **Step 1: Write the failing test**

Create `packages/omkit/tests/unit/mcp-resources.test.ts`:

```ts
import { beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { latestRun, readRunFile, resolveRunFolder } from "../../src/mcp/resources.ts";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-res-"));
  const runs = path.join(root, "logs", "smoke-a1b2c3d4");
  for (const [date, time] of [
    ["2026-08-01", "10-00-00"],
    ["2026-08-04", "09-00-00"],
    ["2026-08-04", "11-30-00"],
  ]) {
    fs.mkdirSync(path.join(runs, date, time), { recursive: true });
    fs.writeFileSync(path.join(runs, date, time, "main.log"), `${date} ${time}\n`, "utf8");
  }
  fs.writeFileSync(path.join(root, "secret.txt"), "not yours", "utf8");
});

describe("resolveRunFolder", () => {
  test("accepts a folder inside logs/", () => {
    const folder = path.join(root, "logs", "smoke-a1b2c3d4", "2026-08-01", "10-00-00");
    expect(resolveRunFolder(root, folder)).toBe(fs.realpathSync(folder));
  });

  test("refuses a path that escapes logs/ with ..", () => {
    expect(resolveRunFolder(root, path.join(root, "logs", "..", "secret.txt"))).toBeUndefined();
  });

  test("refuses an absolute path elsewhere on the machine", () => {
    expect(resolveRunFolder(root, os.homedir())).toBeUndefined();
  });

  test("refuses logs/ itself — a run folder, not the root", () => {
    expect(resolveRunFolder(root, path.join(root, "logs"))).toBeUndefined();
  });
});

describe("latestRun", () => {
  test("picks the newest date, then the newest time within it", () => {
    const latest = latestRun(root, "smoke-a1b2c3d4")!;
    expect(latest.endsWith(path.join("2026-08-04", "11-30-00"))).toBe(true);
  });

  test("an om that has never run resolves to nothing rather than throwing", () => {
    expect(latestRun(root, "never-00000000")).toBeUndefined();
  });
});

describe("readRunFile", () => {
  const segments = ["smoke-a1b2c3d4", "2026-08-01", "10-00-00", "main.log"];

  test("reads a text file with its MIME type", () => {
    const read = readRunFile(root, segments)!;
    expect(read.mimeType).toBe("text/plain");
    expect(read.text).toContain("2026-08-01");
  });

  test("refuses a traversal in the file segment", () => {
    expect(
      readRunFile(root, ["smoke-a1b2c3d4", "2026-08-01", "10-00-00", "../../../../secret.txt"])
    ).toBeUndefined();
  });

  test("truncates an oversized file and says so, rather than refusing or flooding", () => {
    const dir = path.join(root, "logs", "smoke-a1b2c3d4", "2026-08-01", "10-00-00");
    fs.writeFileSync(path.join(dir, "big.log"), "x".repeat(400 * 1024), "utf8");
    const read = readRunFile(root, ["smoke-a1b2c3d4", "2026-08-01", "10-00-00", "big.log"])!;
    expect(read.text!.length).toBeLessThan(400 * 1024);
    expect(read.text).toMatch(/truncated/i);
  });

  test("a binary file comes back base64 with an image MIME type", () => {
    const dir = path.join(root, "logs", "smoke-a1b2c3d4", "2026-08-01", "10-00-00");
    fs.writeFileSync(path.join(dir, "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const read = readRunFile(root, ["smoke-a1b2c3d4", "2026-08-01", "10-00-00", "shot.png"])!;
    expect(read.mimeType).toBe("image/png");
    expect(read.blob).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
    expect(read.text).toBeUndefined();
  });

  test("a missing file resolves to nothing", () => {
    expect(
      readRunFile(root, ["smoke-a1b2c3d4", "2026-08-01", "10-00-00", "nope.log"])
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-resources.test.ts`
Expected: FAIL — cannot resolve `../../src/mcp/resources.ts`.

- [ ] **Step 3: Write `mcp/resources.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Files above this are truncated (text) or refused (binary). A long raw.jsonl is megabytes. */
const MAX_BYTES = 256 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".log": "text/plain",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const TEXT_MIME = /^(text\/|application\/(json|x-ndjson|xml))/;

export function mimeOf(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Resolve a path and refuse anything that is not strictly inside `<root>/logs`.
 *
 * URIs are untrusted input — a model can propose any string — so this is enforced on
 * every read, not just at the template. Two checks, because `..` and a symlink escape by
 * different routes: the lexical one catches `logs/../secret`, and the realpath one
 * catches `logs/link → /etc`. `logs/` itself is refused: it is the root, not a run.
 */
export function resolveUnderLogs(root: string, target: string): string | undefined {
  const logs = path.resolve(root, "logs");
  const resolved = path.resolve(target);
  const inside = (candidate: string): boolean => {
    const rel = path.relative(logs, candidate);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  if (!inside(resolved)) return undefined;
  try {
    const real = fs.realpathSync.native(resolved);
    const realLogs = fs.realpathSync.native(logs);
    const rel = path.relative(realLogs, real);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return real;
  } catch {
    return undefined; // does not exist — nothing to read either way
  }
}

/** A run folder the caller named directly (a path from `get_run`, or one a client kept). */
export function resolveRunFolder(root: string, candidate: string): string | undefined {
  const resolved = resolveUnderLogs(root, candidate);
  if (!resolved) return undefined;
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The newest run of one om. Folder names are `<date>/<time>` with zero-padded,
 * fixed-width components (`2026-08-04/11-30-00`), so lexical sort is chronological
 * sort — no parsing, and no dependence on filesystem mtime.
 *
 * This is what the run-folder-identity constraint is *for*: "a script or an assistant
 * can always find the latest run of X without parsing scrollback".
 */
export function latestRun(root: string, folderName: string): string | undefined {
  const base = resolveUnderLogs(root, path.join(root, "logs", folderName));
  if (!base) return undefined;
  const newest = (dir: string): string | undefined =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .pop();
  try {
    const date = newest(base);
    if (!date) return undefined;
    const time = newest(path.join(base, date));
    return time ? path.join(base, date, time) : undefined;
  } catch {
    return undefined;
  }
}

export interface RunFileRead {
  readonly path: string;
  readonly mimeType: string;
  readonly text?: string;
  readonly blob?: string;
}

/** Read one file from a run folder, confined, size-capped, and typed by extension. */
export function readRunFile(root: string, segments: string[]): RunFileRead | undefined {
  const target = resolveUnderLogs(root, path.join(root, "logs", ...segments));
  if (!target) return undefined;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return undefined;
  }
  if (!stat.isFile()) return undefined;

  const mimeType = mimeOf(target);
  if (!TEXT_MIME.test(mimeType)) {
    // Binary is all-or-nothing: half a PNG is not a smaller PNG. Too large comes back as
    // a plain-text explanation rather than an error — the client asked a reasonable
    // question and deserves an answer, and a read with neither `text` nor `blob` is not
    // a valid MCP result.
    if (stat.size > MAX_BYTES) {
      return {
        path: target,
        mimeType: "text/plain",
        text: `${path.basename(target)} is ${stat.size} bytes, over the ${MAX_BYTES}-byte inline cap. Read it from disk at ${target}.`,
      };
    }
    return { path: target, mimeType, blob: fs.readFileSync(target).toString("base64") };
  }

  const raw = fs.readFileSync(target, "utf8");
  const text =
    stat.size > MAX_BYTES
      ? `${raw.slice(0, MAX_BYTES)}\n\n… truncated at ${MAX_BYTES} bytes of ${stat.size}. ` +
        `Use tail_run with a cursor to page through this run's log.`
      : raw;
  return { path: target, mimeType, text };
}

/**
 * Publish the two templates. Read-only by construction: there is no write path here, and
 * no way to delete a run folder through MCP.
 *
 * `list` is `undefined` deliberately — enumerating every file of every historical run
 * would be a large, mostly-useless listing. `get_run` returns resource links for the run
 * a client actually asked about, which is the path that matters.
 */
export function registerResources(server: McpServer, opts: { root: string }): void {
  const respond = (uri: URL, read: RunFileRead | undefined) => {
    if (!read)
      throw new Error(`no such run file, or it is outside this project's logs/: ${uri.href}`);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: read.mimeType,
          ...(read.text !== undefined ? { text: read.text } : {}),
          ...(read.blob !== undefined ? { blob: read.blob } : {}),
        },
      ],
    };
  };

  server.registerResource(
    "run-latest",
    new ResourceTemplate("omkit://runs/{run}/latest/{file}", { list: undefined }),
    {
      title: "The newest run of one om",
      description:
        "A file from the most recent run of `{run}` (the `folderName` from list_oms). " +
        "Try main.log for the narrative, result.json for the verdict, artifacts.log for files.",
    },
    async (uri, { run, file }) => {
      const folder = latestRun(opts.root, String(run));
      if (!folder) throw new Error(`no runs recorded for ${String(run)}`);
      const rel = path.relative(path.resolve(opts.root, "logs"), folder).split(path.sep);
      return respond(uri, readRunFile(opts.root, [...rel, String(file)]));
    }
  );

  server.registerResource(
    "run-at",
    new ResourceTemplate("omkit://runs/{run}/{date}/{time}/{file}", { list: undefined }),
    { title: "A file from one specific run" },
    async (uri, { run, date, time, file }) =>
      respond(uri, readRunFile(opts.root, [run, date, time, file].map(String)))
  );
}
```

- [ ] **Step 4: Return resource links from `get_run`**

Extend `get_run`'s settled branch in `mcp/tools.ts`. Curated artifacts (Spec A's
`ctx.artifact`) come from `result.json` and carry a real name and description; everything
else in the folder is listed too, unlabelled.

```ts
const verdict = await readVerdict(live.verdict!);
const links = runFileLinks(ctx.root, verdict.folder);
return {
  content: [
    { type: "text", text: JSON.stringify({ status: "settled", ...verdict }, null, 2) },
    ...links,
  ],
  structuredContent: { status: "settled" as const, name: live.name, ...verdict },
};
```

Add to `mcp/resources.ts`:

```ts
/** A curated artifact as `result.json` records it. Re-declared, not imported: `mcp/` may not reach into `output/`. */
interface ArtifactRecordLike {
  readonly name: string;
  readonly file: string;
  readonly description?: string;
  readonly mime: string;
}

/**
 * The run's files as `resource_link` blocks rather than inlined content, so a model reads
 * only what it needs — `raw.jsonl` on a long run is megabytes. Curated artifacts come
 * first, carrying the name and description the om gave them; the rest of the folder
 * follows, unlabelled. Curation raises signal; it does not gate access.
 */
export function runFileLinks(
  root: string,
  folder: string
): Array<{
  type: "resource_link";
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}> {
  const resolved = resolveRunFolder(root, folder);
  if (!resolved) return [];
  const rel = path.relative(path.resolve(root, "logs"), resolved).split(path.sep);
  const uriFor = (file: string): string => `omkit://runs/${rel.join("/")}/${file}`;

  let curated: ArtifactRecordLike[] = [];
  try {
    curated =
      (
        JSON.parse(fs.readFileSync(path.join(resolved, "result.json"), "utf8")) as {
          artifacts?: ArtifactRecordLike[];
        }
      ).artifacts ?? [];
  } catch {
    curated = [];
  }

  const links = curated.map((a) => ({
    type: "resource_link" as const,
    uri: uriFor(path.basename(a.file)),
    name: a.name,
    ...(a.description ? { description: a.description } : {}),
    mimeType: a.mime,
  }));
  const named = new Set(curated.map((a) => path.basename(a.file)));

  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!entry.isFile() || named.has(entry.name)) continue;
    links.push({
      type: "resource_link" as const,
      uri: uriFor(entry.name),
      name: entry.name,
      mimeType: mimeOf(entry.name),
    });
  }
  return links;
}
```

Now that confinement exists, widen `tail_run` to accept a run-folder path as well as a
`runId` — Task 7 deliberately left this out until a caller-supplied path could be checked:

```ts
const live = ctx.runs.get(run);
if (live?.status === "running") {
  return both({ ...tailLive(live, cursor, limit), status: "running" as const });
}
const folder = live?.verdict?.folder ?? resolveRunFolder(ctx.root, run);
if (!folder) {
  return toolError(`no run "${run}" — pass a runId from start_om, or a folder under logs/.`);
}
return both({ ...tailFile(folder, cursor, limit), status: "settled" as const });
```

Add the same widening to `get_run`, whose description already promises it.

In `mcp/server.ts`, call `registerResources(server, { root: opts.root })`.

- [ ] **Step 5: Run the tests and commit**

Run: `npx vitest run packages/omkit/tests/unit/mcp-resources.test.ts packages/omkit/tests/unit/mcp-runs.test.ts packages/omkit/tests/unit/mcp-tail.test.ts`
Expected: PASS.

```bash
git add packages/omkit/src packages/omkit/tests
git commit -m "feat(omkit): serve run artifacts as confined MCP resources"
```

---

### Task 10: Action-backed tools

An action cannot run standalone — `ExecutionTree.require()` throws outside a run — so omkit ships a real host om and forks that.

**Files:**

- Create: `packages/omkit/src/mcp/action-host.ts`
- Modify: `packages/omkit/src/mcp/tools.ts`
- Test: `packages/omkit/tests/unit/mcp-action-host.test.ts`

**Interfaces:**

- Consumes: `om` from `../index.ts`; `omHash` from `foundation/ids.ts`; `ActionRegistration.exportName` (Task 3).
- Produces: `hostFile()` from `mcp/tools.ts` (or a small `mcp/action-launch.ts`) — the fork target and env for an action-backed call.

- [ ] **Step 1: Write the failing test**

Create `packages/omkit/tests/unit/mcp-action-host.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { omHash } from "../../src/foundation/ids.ts";
import { connectServer, fixtureClient } from "../support/mcp-harness.ts";

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-host-"));
let open: Client | undefined;

afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("action-backed tools", () => {
  test("run_om runs an exposed action through the shipped host om", async () => {
    open = await connectServer(await fixtureClient(), workdir);
    const result = await open.callTool({
      name: "run_om",
      arguments: { name: "seed", args: { rows: 7 } },
    });
    expect(result.isError).toBeFalsy();
    const verdict = result.structuredContent as { ok: boolean; folder: string };
    expect(verdict.ok).toBe(true);

    // The run landed in the same logs/ tree as an om's, under `<name>@<hash8>` — the
    // disambiguator lives in the *name*, so run identity is satisfied literally rather
    // than forged. Nothing gained an escape hatch to claim another run's folder.
    expect(verdict.folder).toMatch(/seed@[0-9a-f]{8}[\\/]\d{4}-\d{2}-\d{2}[\\/]/);
  }, 60_000);

  test("the host name is stable across runs, so 'latest' keeps working", async () => {
    open = await connectServer(await fixtureClient(), workdir);
    const folders: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const result = await open.callTool({
        name: "run_om",
        arguments: { name: "seed", args: { rows: 1 } },
      });
      folders.push((result.structuredContent as { folder: string }).folder);
    }
    // Different timestamps, same folder family.
    expect(path.basename(path.resolve(folders[0]!, "../.."))).toBe(
      path.basename(path.resolve(folders[1]!, "../.."))
    );
    expect(folders[0]).not.toBe(folders[1]);
  }, 90_000);

  test("same-named actions in different files get different folders", () => {
    // The suffix is `omHash(name, actionFile)`, so the defining file is what diverges.
    // Asserted directly on the rule rather than through two fixtures: the rule *is* the
    // contract, and a second fixture would only re-run the same hash.
    expect(omHash("seed", "/a/seed.ts")).not.toBe(omHash("seed", "/b/seed.ts"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/mcp-action-host.test.ts`
Expected: FAIL — `run_om` forks the action's own file, which defines no om, so the run never settles with a verdict.

- [ ] **Step 3: Write `mcp/action-host.ts`**

```ts
import { pathToFileURL } from "node:url";
import { om } from "../index.ts";
import { omHash } from "../foundation/ids.ts";

/**
 * The host om for an action-backed tool. Forked as the om file, with the action to run
 * named on the environment.
 *
 * An action cannot run standalone — `ExecutionTree.require()` throws outside a run — so
 * something has to host it. Nothing here is forged: `callerSite()` captures this file,
 * which genuinely is where the run is defined. The disambiguator lives in the **name**:
 * `seed@a1b2c3d4` is stable across runs, and two same-named actions in different files
 * get different suffixes and therefore different folders. That satisfies the
 * run-folder-identity contract through the name rather than around it, and avoids adding
 * an escape hatch that would let any caller claim another run's identity.
 *
 * Known sharp edge: an action declared with `.ref<H>()` publishes a capability for
 * downstream actions. Standalone it does its work and hands that capability to nobody —
 * `chromePage` would attach to Chrome and return nothing useful. Such actions make poor
 * tools. Documented, not prevented.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} must be set — the MCP server sets it when forking this host`);
  return value;
}

const file = required("OMKIT_ACTION_FILE");
const name = required("OMKIT_ACTION_NAME");
const exportName = required("OMKIT_ACTION_EXPORT");
// Deliberately not OMKIT_ARGS: this om declares no `.args()`, so nothing here would read
// that variable, and a distinct name keeps a host run from colliding with an om's args.
const args: unknown = JSON.parse(process.env.OMKIT_ACTION_ARGS ?? "{}");

type Launchable = (a: unknown) => { result: Promise<unknown> };

om(`${name}@${omHash(name, file)}`)
  .describe({ summary: `Standalone host for the ${name} action.` })
  .run(async () => {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    const launch = mod[exportName];
    if (typeof launch !== "function") {
      throw new Error(`${file} has no exported action "${exportName}"`);
    }
    // The action reaches `ExecutionTree.require()` through the copy of omkit *its* file
    // imported, and `current` is a static — so this only works when both resolve to the
    // same installed omkit. True for a normal install and for the fixtures; false under
    // `npm link`, a non-hoisted pnpm layout, or two omkit versions in one tree. The bare
    // error is undiagnosable from a client, so name the cause here.
    try {
      await (launch as Launchable)(args).result;
    } catch (e) {
      if (e instanceof Error && /no active om\(\) run/.test(e.message)) {
        throw new Error(
          `${name} could not see this run. Its file resolved a different copy of omkit ` +
            `than the host did — check for a linked, duplicated, or non-hoisted omkit install.`
        );
      }
      throw e;
    }
  });
```

- [ ] **Step 4: Route action entries through the host**

In `mcp/tools.ts`, `launch()` chooses the fork target by `entry.kind`:

```ts
/**
 * Absolute path of omkit's shipped action host, with the extension this build uses —
 * `.ts` under tsx and vitest, `.js` once compiled. Same reasoning as
 * `siblingScript` in client/discovery.ts: this is a fork target, so
 * `rewriteRelativeImportExtensions` does not touch it.
 */
const hostFile = (): string => {
  const here = fileURLToPath(import.meta.url);
  return path.join(path.dirname(here), `action-host${path.extname(here)}`);
};

const launch = (entry: ToolEntry, args: Record<string, unknown>): LiveRun => {
  const isAction = entry.kind === "action";
  const file = isAction ? hostFile() : entry.file;
  const env = isAction
    ? {
        OMKIT_ACTION_FILE: entry.file,
        OMKIT_ACTION_NAME: entry.name,
        OMKIT_ACTION_EXPORT: entry.exportName!,
        OMKIT_ACTION_ARGS: JSON.stringify(args),
      }
    : { OMKIT_ARGS: JSON.stringify(args) };
  return ctx.runs.start(
    entry.name,
    isAction ? `${entry.name}@${omHash(entry.name, entry.file)}` : entry.folderName!,
    // cwd is the project root here too — see D6: a host run must write its folder where
    // this server's resources look, which is `<root>/logs`.
    ctx.client.run(file, { cwd: ctx.root, env })
  );
};
```

Import `omHash` and `fileURLToPath` in `tools.ts`.

- [ ] **Step 5: Run the tests and commit**

Run: `npx vitest run packages/omkit/tests/unit/mcp-action-host.test.ts packages/omkit/tests/unit/mcp-run-om.test.ts`
Expected: PASS.

Run the full suite once here — this is the last behavioural task: `npm test`

```bash
git add packages/omkit/src packages/omkit/tests
git commit -m "feat(omkit): run an exposed action through a shipped host om"
```

---

### Task 11: Documentation, changelog, and version

**Files:**

- Create: `docs/src/omkit/mcp.tskb.tsx`
- Modify: `docs/src/omkit/main.tskb.tsx`
- Modify: `packages/omkit/README.md`
- Modify: `packages/omkit/CHANGELOG.md`
- Modify: `packages/omkit/package.json`

- [ ] **Step 1: Bump the version**

Set `packages/omkit/package.json` `"version": "0.6.0"` and check it matches `VERSION` in
`src/mcp/server.ts`.

- [ ] **Step 2: Write the tskb doc**

Read `docs/src/omkit/client.tskb.tsx` and `docs/src/omkit/run-folder-identity.tskb.tsx`
first — they are the models for tone, structure, and node registration. Then write
`docs/src/omkit/mcp.tskb.tsx` answering **"What does omkit expose over MCP, and how does a
client drive it?"**, at `essential` priority.

Rules that bind this file (from the repo's own constraint docs and conventions):

- Register the new boundary as a Folder node (`packages/omkit/src/mcp`) and its modules;
  register `discovery-mode.ts` and `discover-child.ts` too.
- Reference registered nodes with `{NodeRef}` — never hardcode a path, function name, or
  module string in prose as a bare `<code>`.
- "deps" is never bare prose; use the registered export or the term.
- Do **not** edit `.claude/skills/*/SKILL.md` — those are generated. Run
  `npm run build:docs` and let them regenerate.

Cover, at minimum: the two-phase discovery split and why phase 2 needs a fork; that
exposure is opt-in via `.mcp()`; the settling/long-lived split and why omkit expresses
duration when MCP cannot; the six tools; the two resource URI templates and the `latest`
payoff; and the action-host's identity rule.

- [ ] **Step 3: Add it to the omkit doc index**

In `docs/src/omkit/main.tskb.tsx`, add the `mcp` boundary alongside the existing ones so
the folder tree and the essential-docs list both pick it up.

- [ ] **Step 4: Rebuild the graph**

Run: `npm run build:docs`

The `.claude/skills/tskb*/SKILL.md` files regenerate as a side effect. Commit whatever
changes — do not hand-edit them.

- [ ] **Step 5: Update the README**

Add an **MCP server** section to `packages/omkit/README.md`: `.mcp({ mode })` on the
builder, `omkit mcp`, the six tools, the two URI templates, and the client config snippet:

```json
{
  "mcpServers": {
    "omkit": {
      "command": "npx",
      "args": ["--no", "--", "omkit", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Note that the Inspector drives the same binary: `npx @modelcontextprotocol/inspector npx omkit mcp`.

- [ ] **Step 6: Write the changelog entry**

Add a `## 0.6.0` section to `packages/omkit/CHANGELOG.md`, above `0.5.0`, in the same
shape. Under **Added**: `.mcp({ mode })`; the `omkit mcp` command and its six tools; the
two resource templates; progress, cancellation and elicitation during a run;
`discoverRegistrations()` and why `discover()` is unchanged; the action host. Under
**Changed**: `RunOptions.env`. State plainly that nothing changes for a project that never
calls `.mcp()`.

- [ ] **Step 7: Verify and commit**

Run: `npm run format && npm test && npm run build:docs`

```bash
git add -A
git commit -m "docs(omkit): document the MCP server and release 0.6.0"
```

---

## Sequencing note

Tasks 1-3 are the whole of what Spec C (`2026-08-05-omkit-skill-generation-design.md`)
depends on: the registration fork, not the server. If skill generation becomes the more
urgent deliverable, Tasks 1-3 can ship on their own and Spec C can start against them
while Tasks 4-11 continue.
