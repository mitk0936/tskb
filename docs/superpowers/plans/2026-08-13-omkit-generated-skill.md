# omkit Generated Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate `.claude/skills/omkit-runs/SKILL.md` from a project's registrations, so an agent knows what is runnable — and how to run it — before its first tool call.

**Architecture:** A pure model/render core under `src/skill/` consumes the `RegistrationSet` that Spec B's discovery fork already produces, plus a new AST-derived "calls" outline carried on `DiscoveredOm`. A thin `omkit skill` command does the I/O: discovery, frontmatter preservation, write, and `--check`. `omkit ls --describe` reuses the same registrations.

**Tech Stack:** TypeScript, the TypeScript compiler API (AST outline), Node `crypto` (registry hash), vitest.

## Global Constraints

- **Generation executes no user workflow.** It reuses Spec B's `OMKIT_DISCOVER=1` fork, which returns from `launch()` before any execution tree exists. Nothing else may import an om file.
- **The generated file is never hand-edited** beyond its `description`. It carries a generated-by header; regeneration is the only supported edit. (`constraint-skill-generation.tskb.tsx`)
- **Regeneration is byte-deterministic.** Stable ordering (oms then actions, each alphabetical by name), no timestamps, no absolute paths. Every emitted path is project-relative with forward slashes on every platform.
- **Exposure stays opt-in.** Only `.mcp()`-marked oms and actions appear. Same rule as Spec B.
- **Run identity is `logs/<name>-<hash8>/<date>/<time>/`** and the skill must not imply any other addressing scheme. (`run-folder-identity.tskb.tsx`)
- **An action cannot run outside a run.** `ExecutionTree.require()` throws, so every action entry carries the host-om caveat inline.
- **`omkit ls` stays AST-only by default.** Summaries require the fork; `--describe` opts in.
- **`src/skill/` may import `client`, `core`, and `foundation` — not `cli`, `output`, `actions`, or `mcp`.** Enforced by an eslint boundary.
- **Unit tests are colocated** in `packages/omkit/tests/unit/`. (`constraint-test-coverage.tskb.tsx`)

## Deviations from the spec

Recorded here so a reviewer can check them against the spec rather than treating them as drift.

**D1 — the calls outline sees only calls made directly in the body.** The spec's sample output lists `prompt` for `tskb:dev`, but that call lives inside `runTestsPrompt()`, a module-level helper the body invokes. The implemented rule — imported identifiers called directly within `.run(body)` — does not follow that indirection. This joins the limitations the spec already documents (a conditional call appears unconditionally, a loop appears once) and is pinned by a test rather than assumed.

**D2 — the registry hash covers the calls outline.** The spec enumerates the hash inputs as names, summaries, arg schemas, modes, and paths. Excluding the outline would let an om body edit stale the file silently, which is exactly the drift C8 exists to catch. Including it does not weaken the property the spec's test pins — the hash still covers registry data, not rendering, so a whitespace-only edit to the rendered body still passes `--check`.

**D3 — `DiscoveredOm` gains `calls`, so `omkit ls --json` output grows a field.** Additive, and the outline is AST-only, so the documented "discover() stays AST-only and instant" property holds.

**D4 — `--root` was added alongside the spec's `--out`.** The spec offers `--out` for "consumers whose layout differs", and this repo is one: its om project lives in `om/`, so the tsconfig-derived root put the skill in `om/.claude/`. `--out` alone cannot fix that — it moves the file to the repo root while leaving the recorded paths relative to `om/`, so every "Defined in" would point somewhere the reader cannot follow. The root governs both the output location and the path basis because they are one question ("which project is this a map of?"), and `--root` is how a nested layout answers it. This repo generates with `--tsconfig om/tsconfig.omkit.json --root .`.

**D5 — `RegistrationSet` gained an optional `registry`.** `discoverRegistrations()` already builds a TypeScript program to pick candidate files and discarded it. The skill needs that scan for the outline and for `publishesCapability`, and rebuilding a second program costs ~2.3s for data that was just computed and thrown away. Absent when the fork is driven with an explicit file list, since there is no scan to carry.

---

## File Structure

**Create:**

- `packages/omkit/src/client/outline.ts` — AST extraction of the calls outline. Pure helpers over `ts.Node`.
- `packages/omkit/src/skill/model.ts` — `SkillEntry` / `SkillModel`, `buildSkillModel`, `registryHash`. Pure.
- `packages/omkit/src/skill/render.ts` — `renderSkill(model, opts)` → markdown. Pure.
- `packages/omkit/src/skill/file.ts` — read an existing file's `description` and hash; write. The only fs in the folder.
- `packages/omkit/src/skill/index.ts` — the folder's public surface.
- `packages/omkit/src/cli/commands/skill.ts` — the command adapter.

**Modify:**

- `packages/omkit/src/client/registry.ts` — add `OmCall`, `DiscoveredOm.calls`.
- `packages/omkit/src/client/discovery.ts` — collect the outline during the existing walk.
- `packages/omkit/src/cli/commands/ls.ts` — render summaries and `[mcp]` markers under `--describe`.
- `packages/omkit/src/cli/index.ts` — route `skill`; parse `--describe`, `--check`, `--out`.
- `packages/omkit/src/cli/commands/help.ts` — document the command and flags.
- `packages/omkit/eslint.config.js` — the `skill` boundary.
- `packages/omkit/package.json`, `packages/omkit/CHANGELOG.md` — version 0.7.0.
- `docs/src/omkit/commands.tskb.tsx` — currently stale (no `omkit mcp`); add both commands.

**Test:**

- `packages/omkit/tests/unit/outline.test.ts`
- `packages/omkit/tests/unit/skill-model.test.ts`
- `packages/omkit/tests/unit/skill-render.test.ts`
- `packages/omkit/tests/unit/skill-file.test.ts`
- `packages/omkit/tests/unit/ls-describe.test.ts`

---

### Task 1: The calls outline

**Files:**

- Create: `packages/omkit/src/client/outline.ts`
- Modify: `packages/omkit/src/client/registry.ts`, `packages/omkit/src/client/discovery.ts`
- Test: `packages/omkit/tests/unit/outline.test.ts`

**Interfaces:**

- Produces: `OmCall { readonly name: string; readonly tag?: string }`, `DiscoveredOm.calls?: readonly OmCall[]`, and `outlineBody(body: ts.Node, imported: ReadonlySet<string>): OmCall[]`.
- Consumes: the `ts.SourceFile` and local-binding names `discover()` already computes.

The rule: within `.run(body)`, every `CallExpression` whose callee is a plain identifier bound by an import declaration counts as a step. Property-access calls (`path.resolve`, `console.log`, `z.object`) are excluded by construction. For each such call, climb the fluent chain through `.tag("…")` and record the first string-literal tag.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import ts from "typescript";
import { outlineBody, importedNames } from "../../src/client/outline.ts";

const parse = (src: string): ts.SourceFile =>
  ts.createSourceFile("t.ts", src, ts.ScriptTarget.ESNext, true);

/** Pull the arrow passed to `.run(...)` out of a parsed om chain. */
function bodyOf(sf: ts.SourceFile): ts.Node {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "run" &&
      n.arguments[0]
    ) {
      found ??= n.arguments[0];
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error("no .run(body) in source");
  return found;
}

describe("outlineBody", () => {
  it("lists imported calls in source order with their tags", () => {
    const sf = parse(`
      import { command, healthcheck } from "omkit/actions";
      om("x").run(async () => {
        command("npm test", {}).tag("tskb:tests");
        await healthcheck({ url: "u" }).tag("gate").once("done");
      });
    `);
    expect(outlineBody(bodyOf(sf), importedNames(sf))).toEqual([
      { name: "command", tag: "tskb:tests" },
      { name: "healthcheck", tag: "gate" },
    ]);
  });

  it("omits an untagged call's tag rather than inventing one", () => {
    const sf = parse(`
      import { watchDir } from "omkit/actions";
      om("x").run(async () => { watchDir("."); });
    `);
    expect(outlineBody(bodyOf(sf), importedNames(sf))).toEqual([{ name: "watchDir" }]);
  });

  it("ignores property-access calls and locally-declared functions", () => {
    const sf = parse(`
      import path from "node:path";
      import { command } from "omkit/actions";
      function helper() {}
      om("x").run(async () => {
        path.resolve("a");
        console.log("hi");
        helper();
        command("go");
      });
    `);
    expect(outlineBody(bodyOf(sf), importedNames(sf))).toEqual([{ name: "command" }]);
  });

  it("lists a conditional call unconditionally — the documented approximation", () => {
    const sf = parse(`
      import { command } from "omkit/actions";
      om("x").run(async (_c, { flag }) => {
        if (flag) command("npm test").tag("tests");
      });
    `);
    expect(outlineBody(bodyOf(sf), importedNames(sf))).toEqual([{ name: "command", tag: "tests" }]);
  });

  it("does not follow a module-level helper (D1)", () => {
    const sf = parse(`
      import { prompt } from "omkit/actions";
      const ask = () => prompt({ kind: "choice" });
      om("x").run(async () => { await ask(); });
    `);
    expect(outlineBody(bodyOf(sf), importedNames(sf))).toEqual([]);
  });

  it("de-duplicates an identical name and tag pair", () => {
    const sf = parse(`
      import { command } from "omkit/actions";
      om("x").run(async () => { command("a").tag("t"); command("a").tag("t"); });
    `);
    expect(outlineBody(bodyOf(sf), importedNames(sf))).toEqual([{ name: "command", tag: "t" }]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/outline.test.ts` from `packages/omkit`
Expected: FAIL — cannot resolve `../../src/client/outline.ts`.

- [ ] **Step 3: Write `outline.ts`**

```ts
import ts from "typescript";
import type { OmCall } from "./registry.ts";

/**
 * Every identifier a file binds through an import — the whole allow-list for the outline.
 * An action always arrives by import (`omkit/actions`, or a local actions module), so
 * "was imported" is a cheap stand-in for "is a step" that never needs the type checker.
 */
export function importedNames(sf: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const clause = stmt.importClause;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
    else for (const el of bindings.elements) names.add(el.name.text);
  }
  return names;
}

/**
 * A static sketch of what an om body calls: imported identifiers invoked directly inside
 * `.run(body)`, in source order, each paired with the `.tag("…")` from its own fluent chain.
 *
 * Deliberately an approximation, and labelled as one wherever it is rendered. A conditional
 * call appears unconditionally, a loop appears once, an action picked dynamically does not
 * appear at all, and a call made inside a module-level helper is invisible (the walk does not
 * follow indirection). It answers "roughly what happens in here" and nothing stronger.
 */
export function outlineBody(body: ts.Node, imported: ReadonlySet<string>): OmCall[] {
  const calls: OmCall[] = [];
  const seen = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (imported.has(name)) {
        const tag = tagOf(node);
        const key = `${name} ${tag ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          calls.push(tag === undefined ? { name } : { name, tag });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return calls;
}

/**
 * Climb the fluent chain above a root call — `command(…).tag("x").once("done")` — and return
 * the first `.tag()` string literal. Only ascends while each step is this node's own chain, so
 * a sibling call's tag can never be attributed here.
 */
function tagOf(root: ts.CallExpression): string | undefined {
  let node: ts.Node = root;
  while (
    node.parent &&
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.expression === node &&
    node.parent.parent &&
    ts.isCallExpression(node.parent.parent) &&
    node.parent.parent.expression === node.parent
  ) {
    const call = node.parent.parent;
    if (node.parent.name.text === "tag") {
      const arg = call.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) return arg.text;
    }
    node = call;
  }
  return undefined;
}
```

- [ ] **Step 4: Add `OmCall` and `calls` to `registry.ts`**

```ts
/** One step in an om's static outline: an imported call, with the tag authored on its chain. */
export interface OmCall {
  readonly name: string;
  /** The `.tag("…")` literal from the same fluent chain, when the author wrote one. */
  readonly tag?: string;
}
```

and on `DiscoveredOm`:

```ts
  /**
   * A static approximation of what the body calls, in source order. Absent when the walk
   * found nothing recognisable. Never a contract — see {@link import("./outline.ts").outlineBody}.
   */
  readonly calls?: readonly OmCall[];
```

- [ ] **Step 5: Collect the outline in `discover()`**

In `discovery.ts`, replace the `visit` that records oms so it matches the `.run(...)` chain and carries the body outline. Add to the imports: `import { importedNames, outlineBody } from "./outline.ts";`

```ts
const names = omkitImports(sf);
const imported = importedNames(sf);

const visit = (node: ts.Node): void => {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === names.om || node.expression.text === names.step)
  ) {
    const arg = node.arguments[0];
    if (arg && ts.isStringLiteralLike(arg)) {
      const calls = outlineOf(node, imported);
      oms.push({
        name: arg.text,
        file: sf.fileName,
        line: lineOf(sf, node),
        ...(calls.length ? { calls } : {}),
      });
    }
  }
  ts.forEachChild(node, visit);
};
```

with the helper that climbs from `om("name")` to the `.run(body)` on the same chain:

```ts
/**
 * From the base `om("name")` call, climb its own fluent chain to the `.run(body)` and outline
 * that body. Returns empty when the chain has no `.run` with a function argument — a builder
 * that was assigned and run elsewhere, which the walk deliberately does not chase.
 */
function outlineOf(base: ts.CallExpression, imported: ReadonlySet<string>): OmCall[] {
  let node: ts.Node = base;
  while (
    node.parent &&
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.expression === node &&
    node.parent.parent &&
    ts.isCallExpression(node.parent.parent) &&
    node.parent.parent.expression === node.parent
  ) {
    const call = node.parent.parent;
    if (node.parent.name.text === "run") {
      const body = call.arguments[0];
      return body && ts.isFunctionLike(body) ? outlineBody(body, imported) : [];
    }
    node = call;
  }
  return [];
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/outline.test.ts` — expect PASS.
Run: `npx vitest run` in `packages/omkit` — expect the whole suite green (the `calls` field is additive).

- [ ] **Step 7: Commit**

```bash
git add packages/omkit/src/client/outline.ts packages/omkit/src/client/registry.ts packages/omkit/src/client/discovery.ts packages/omkit/tests/unit/outline.test.ts
git commit -m "feat(omkit): derive a static calls outline from an om body"
```

---

### Task 2: The skill model and the registry hash

**Files:**

- Create: `packages/omkit/src/skill/model.ts`
- Test: `packages/omkit/tests/unit/skill-model.test.ts`

**Interfaces:**

- Consumes: `RegistrationSet` (Spec B), `Registry` (for `calls`), `shapeHint` (`core/schema-hint.ts`).
- Produces:

```ts
export interface SkillCall {
  readonly name: string;
  readonly tag?: string;
}
export interface SkillEntry {
  readonly kind: "om" | "action";
  readonly name: string;
  /** Project-relative, forward slashes on every platform. */
  readonly file: string;
  readonly mode: "settling" | "long-lived";
  readonly summary?: string;
  /** One-line sketch from `shapeHint`. */
  readonly argHint?: string;
  /** The raw schema, present only when `shapeHint` could not sketch it. */
  readonly argSchema?: JsonSchema;
  readonly calls?: readonly SkillCall[];
  readonly unavailable?: string;
  readonly exportName?: string;
  readonly publishesCapability?: boolean;
}
export interface SkillModel {
  readonly oms: readonly SkillEntry[];
  readonly actions: readonly SkillEntry[];
  readonly hash: string;
}
export function buildSkillModel(
  registrations: RegistrationSet,
  registry: Registry,
  root: string
): SkillModel;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { buildSkillModel } from "../../src/skill/model.ts";
import type { RegistrationSet } from "../../src/client/registry.ts";
import type { Registry } from "../../src/client/registry.ts";

const ROOT = path.resolve("/proj");
const file = (rel: string): string => path.join(ROOT, rel);

const set = (over: Partial<RegistrationSet> = {}): RegistrationSet => ({
  oms: [],
  actions: [],
  warnings: [],
  ...over,
});
const reg = (over: Partial<Registry> = {}): Registry => ({
  oms: [],
  actions: [],
  warnings: [],
  ...over,
});

const build = "om/build.ts";

describe("buildSkillModel", () => {
  it("keeps only exposed entries", () => {
    const m = buildSkillModel(
      set({
        oms: [
          { name: "b", file: file(build), folderName: "b-1", mcp: { mode: "settling" } },
          { name: "hidden", file: file("om/h.ts"), folderName: "h-1" },
        ],
      }),
      reg(),
      ROOT
    );
    expect(m.oms.map((o) => o.name)).toEqual(["b"]);
  });

  it("emits project-relative posix paths", () => {
    const m = buildSkillModel(
      set({
        oms: [{ name: "b", file: file(build), folderName: "b-1", mcp: { mode: "settling" } }],
      }),
      reg(),
      ROOT
    );
    expect(m.oms[0]!.file).toBe("om/build.ts");
  });

  it("sketches args, and falls back to the raw schema when it cannot", () => {
    const sketchable = { type: "object", properties: { v: { type: "boolean" } }, required: [] };
    const opaque = { type: "object", properties: { v: { anyOf: [{ type: "string" }] } } };
    const m = buildSkillModel(
      set({
        oms: [
          {
            name: "a",
            file: file(build),
            folderName: "a-1",
            mcp: { mode: "settling" },
            inputSchema: sketchable,
          },
          {
            name: "z",
            file: file(build),
            folderName: "z-1",
            mcp: { mode: "settling" },
            inputSchema: opaque,
          },
        ],
      }),
      reg(),
      ROOT
    );
    expect(m.oms[0]!.argHint).toBe("{ v?: boolean }");
    expect(m.oms[0]!.argSchema).toBeUndefined();
    expect(m.oms[1]!.argHint).toBeUndefined();
    expect(m.oms[1]!.argSchema).toEqual(opaque);
  });

  it("attaches the outline from the AST registry by name and file", () => {
    const m = buildSkillModel(
      set({
        oms: [{ name: "b", file: file(build), folderName: "b-1", mcp: { mode: "settling" } }],
      }),
      reg({
        oms: [{ name: "b", file: file(build), line: 1, calls: [{ name: "command", tag: "t" }] }],
      }),
      ROOT
    );
    expect(m.oms[0]!.calls).toEqual([{ name: "command", tag: "t" }]);
  });

  it("sorts alphabetically regardless of discovery order", () => {
    const mk = (name: string) => ({
      name,
      file: file(build),
      folderName: `${name}-1`,
      mcp: { mode: "settling" as const },
    });
    const a = buildSkillModel(set({ oms: [mk("z"), mk("a")] }), reg(), ROOT);
    const b = buildSkillModel(set({ oms: [mk("a"), mk("z")] }), reg(), ROOT);
    expect(a.oms.map((o) => o.name)).toEqual(["a", "z"]);
    expect(a.hash).toBe(b.hash);
  });

  it("changes the hash when a summary changes, and when the outline changes", () => {
    const base = set({
      oms: [{ name: "b", file: file(build), folderName: "b-1", mcp: { mode: "settling" } }],
    });
    const plain = buildSkillModel(base, reg(), ROOT).hash;
    const described = buildSkillModel(
      set({ oms: [{ ...base.oms[0]!, summary: "does a thing" }] }),
      reg(),
      ROOT
    ).hash;
    const outlined = buildSkillModel(
      base,
      reg({ oms: [{ name: "b", file: file(build), line: 1, calls: [{ name: "command" }] }] }),
      ROOT
    ).hash;
    expect(described).not.toBe(plain);
    expect(outlined).not.toBe(plain);
    expect(plain).toMatch(/^[0-9a-f]{8}$/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/skill-model.test.ts` — FAIL, module not found.

- [ ] **Step 3: Implement `model.ts`**

Key points: relative + posix paths; `shapeHint` first, raw schema only on degradation; entries sorted by name then file; hash over a canonical tuple array (per D2, including `calls`) with `createHash("sha256").digest("hex").slice(0, 8)`.

- [ ] **Step 4: Run the tests** — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/skill/model.ts packages/omkit/tests/unit/skill-model.test.ts
git commit -m "feat(omkit): build the skill model and its registry hash"
```

---

### Task 3: The renderer

**Files:**

- Create: `packages/omkit/src/skill/render.ts`
- Test: `packages/omkit/tests/unit/skill-render.test.ts`

**Interfaces:**

- Produces: `renderSkill(model: SkillModel, opts: { description: string }): string`
- Consumes: `SkillModel` from Task 2.

Sections, in order: frontmatter (`name`, `description`), `# omkit — runnable workflows`, the generated-by comment carrying `registry-hash`, `## How to run`, `## Workflows`, `## Actions` (only when non-empty), `## Where output lands`.

- [ ] **Step 1: Write the failing test**

Cases: a described om with args renders summary and arg line; an om with no `.describe()` renders `_No summary._` rather than fabricated prose; a long-lived om is marked `start_om` only; an unsketchable schema renders a fenced JSON block; an `unavailable` entry says so; an action entry carries the host-om caveat and a `.ref()` action carries the capability warning; the `## Actions` heading is absent when no actions are exposed; rendering twice is byte-identical.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement `render.ts`.** Pure string building, no `Date`, no absolute paths, `\n` line endings throughout.

- [ ] **Step 4: Run the tests** — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/skill/render.ts packages/omkit/tests/unit/skill-render.test.ts
git commit -m "feat(omkit): render the skill markdown"
```

---

### Task 4: The file layer

**Files:**

- Create: `packages/omkit/src/skill/file.ts`, `packages/omkit/src/skill/index.ts`
- Test: `packages/omkit/tests/unit/skill-file.test.ts`

**Interfaces:**

- Produces:
  - `readExisting(file: string): { description?: string; hash?: string }` — tolerant of a missing file.
  - `DEFAULT_DESCRIPTION: string`
  - `SKILL_RELATIVE_PATH = ".claude/skills/omkit-runs/SKILL.md"`
  - `writeSkill(file: string, content: string): void` — creates parent directories.

`description` is preserved verbatim across regeneration, including a folded multi-line value; the fallback is written only when the file does not exist. The hash is read from the generated-by comment.

- [ ] **Step 1: Write the failing test** — an authored description survives; a multi-line description survives with its continuation lines; a fresh file gets the fallback; a missing file yields `{}`; the hash round-trips.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement `file.ts` and the `index.ts` re-exports.**

- [ ] **Step 4: Run the tests** — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/skill/file.ts packages/omkit/src/skill/index.ts packages/omkit/tests/unit/skill-file.test.ts
git commit -m "feat(omkit): preserve the authored description across regeneration"
```

---

### Task 5: The `omkit skill` command

**Files:**

- Create: `packages/omkit/src/cli/commands/skill.ts`
- Modify: `packages/omkit/src/cli/index.ts`, `packages/omkit/src/cli/commands/help.ts`

**Interfaces:**

- Produces: `skillCommand(client, opts: { root: string; out?: string; check?: boolean }): Promise<void>`
- Sets `process.exitCode = 1` when `--check` finds a hash mismatch, and prints the drift to stderr. Writes and reports the path otherwise.

- [ ] **Step 1: Add `--describe`, `--check`, and `--out` to `parseCli`,** and a `skill` branch in `main` that lazily imports the command.

- [ ] **Step 2: Implement `skillCommand`** — discover registrations and the AST registry, build the model, read the existing description, render, then either compare hashes (`--check`) or write.

- [ ] **Step 3: Document the command in `helpText()`,** including the `mcp` command's flags, and add `skill` to the command list.

- [ ] **Step 4: Run the CLI tests** — `npx vitest run tests/unit/cli.test.ts` (or the file that covers `parseCli`) plus the full suite.

- [ ] **Step 5: Generate the repo's own skill** — `node --import tsx src/cli/index.ts skill --tsconfig ../../om/tsconfig.omkit.json` from `packages/omkit`, and read the result to confirm it describes `tskb:build` and `tskb:dev` accurately.

- [ ] **Step 6: Commit**

```bash
git add packages/omkit/src/cli packages/omkit/tests .claude/skills/omkit-runs
git commit -m "feat(omkit): add the omkit skill command"
```

---

### Task 6: `omkit ls --describe`

**Files:**

- Modify: `packages/omkit/src/cli/commands/ls.ts`, `packages/omkit/src/cli/index.ts`
- Test: `packages/omkit/tests/unit/ls-describe.test.ts`

**Interfaces:**

- `formatRegistry(registry: Registry, opts: { json?: boolean; registrations?: RegistrationSet }): string`

With `registrations`, each om gains its summary on a following indented line and an `[mcp]` / `[mcp, long-lived]` suffix. Without them the output is byte-identical to today's.

- [ ] **Step 1: Write the failing test** — `--describe` shows summaries and markers; plain `ls` output is unchanged; an om with no summary shows no blank continuation line.

- [ ] **Step 2: Run it and watch it fail.**

- [ ] **Step 3: Implement,** and wire `--describe` in `main` so it calls `discoverRegistrations()` only when asked.

- [ ] **Step 4: Run the tests,** then confirm plain `omkit ls` against `om/` still prints what it did and does not fork.

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/cli/commands/ls.ts packages/omkit/src/cli/index.ts packages/omkit/tests/unit/ls-describe.test.ts
git commit -m "feat(omkit): render summaries under omkit ls --describe"
```

---

### Task 7: Boundaries, docs, and the release

**Files:**

- Modify: `packages/omkit/eslint.config.js`, `packages/omkit/package.json`, `packages/omkit/CHANGELOG.md`, `docs/src/omkit/commands.tskb.tsx`
- Create: `docs/src/omkit/skill.tskb.tsx`

- [ ] **Step 1: Add the `skill` boundary to eslint** — `skill` may not import `cli`, `output`, `actions`, or `mcp`. Place it beside the existing `client` and `mcp` boundaries, above the `no-console` block that must stay last.

- [ ] **Step 2: Register the new modules and write the doc.** `docs/src/omkit/skill.tskb.tsx` answers "How does omkit generate a skill file, and what is that file for?" — registering `omkit.client.outline`, `omkit.skill.model`, `omkit.skill.render`, `omkit.skill.file`, and `omkit.cli.commands.skill`. Reference registered nodes with `NodeRef`; do not hardcode paths in prose. State the outline's limits and that `list_oms` is authoritative at runtime.

- [ ] **Step 3: Bring `docs/src/omkit/commands.tskb.tsx` current** — it predates the MCP work and lists neither `omkit mcp` nor `omkit skill`.

- [ ] **Step 4: Bump to 0.7.0 and write the changelog entry.**

- [ ] **Step 5: Verify everything.**

```bash
npm test
npm run typecheck --workspace omkit
npm run lint --workspace omkit
npm run build:docs
```

Expect: suite green, typecheck clean, 0 lint errors, docs build clean. Then `npx --no -- tskb pick omkit.skill` to confirm the new nodes actually landed in the graph — the docs build exit code does not catch an unregistered module.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs(omkit): document the generated skill and release 0.7.0"
```
