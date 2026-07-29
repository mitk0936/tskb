# omkit Runtime Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `om(name, body)` with a builder that carries `.describe()` and `.args()`, add declared-argument resolution, add `ctx.artifact` for curating run output, and add a `multiline` prompt kind.

**Architecture:** Four independent primitives in `packages/omkit/src/core` and `src/output`, none of which know MCP exists. Two pure functions (zod → JSON Schema, JSON Schema → human hint) land first because everything else consumes them. The builder is added _alongside_ the old form, all call sites migrate, then the old form is deleted — so the test suite stays green at every commit rather than going red for three tasks.

**Tech Stack:** TypeScript (ESM, `.ts` extensions in relative imports), vitest, zod v4, Node ≥ 20.11.

**Spec:** `docs/superpowers/specs/2026-07-29-omkit-runtime-primitives-design.md`

## Global Constraints

- **Node ≥ 20.11**, ESM only. Relative imports carry the `.ts` extension (`./ids.ts`), matching every existing file.
- **Run-folder identity is a contract.** `docs/src/omkit/run-folder-identity.tskb.tsx` is a constraint doc: `omHash` keys on the om's name plus its **defining file** from the call stack, never `process.argv`. `siteFile` strips `:line`. Nothing in this plan may change what "the same run" means.
- **README sync is a constraint.** `docs/src/tskb/constraints/constraint-readme-sync.tskb.tsx` requires `packages/omkit/README.md` to match the public API.
- **Test coverage is a constraint.** `docs/src/tskb/constraints/constraint-test-coverage.tskb.tsx`. Unit tests are colocated: `packages/omkit/tests/unit/*.test.ts`.
- **`zod` stays out of `output/`.** It may appear in `core/` and in user om files only.
- **Tests run from the repo root**, not the package dir: `npx vitest run <path>`. The root `vitest.config.ts` sets `globalSetup: ["tests/e2e/global-setup.ts"]`, which builds the e2e fixture graph on **every** invocation — expect ~10–30s of setup before any unit test runs. This is pre-existing and not something this plan changes.
- **Every test file that runs an om must reset the engine**, or the next test throws "an om() run is already active in this process":

```ts
afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});
```

---

### Task 1: zod dependency and `schema-json.ts`

Converts a zod schema to JSON Schema. Owned here; Spec B's `list_oms` consumes it.

**Files:**

- Modify: `packages/omkit/package.json` (add `zod` to `dependencies`)
- Create: `packages/omkit/src/core/schema-json.ts`
- Test: `packages/omkit/tests/unit/schema-json.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `toJsonSchema(schema: z.ZodType): JsonSchema` where `JsonSchema` is `Record<string, unknown>`. Used by Task 2 and Task 10.

- [ ] **Step 1: Install zod and confirm the major version**

```bash
npm install zod@^4 --workspace packages/omkit
node -e "console.log(require('./node_modules/zod/package.json').version)"
```

Expected: a `4.x` version. **If it resolves to 3.x**, `z.toJSONSchema` does not exist — stop and install `zod-to-json-schema` as well, then use that in Step 3 instead of `z.toJSONSchema`. The rest of the plan is unaffected either way, because every other task depends only on `toJsonSchema`, not on how it is implemented.

- [ ] **Step 2: Write the failing test**

```ts
// packages/omkit/tests/unit/schema-json.test.ts
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "../../src/core/schema-json.ts";

describe("toJsonSchema", () => {
  test("converts an object with required and defaulted fields", () => {
    const schema = z.object({
      rows: z.number(),
      truncate: z.boolean().default(false),
    });
    const json = toJsonSchema(schema) as {
      type: string;
      properties: Record<string, { type: string }>;
      required?: string[];
    };

    expect(json.type).toBe("object");
    expect(json.properties.rows.type).toBe("number");
    expect(json.properties.truncate.type).toBe("boolean");
    expect(json.required).toEqual(["rows"]);
  });

  test("converts nested objects and arrays", () => {
    const schema = z.object({
      tags: z.array(z.string()),
      nested: z.object({ host: z.string() }),
    });
    const json = toJsonSchema(schema) as {
      properties: {
        tags: { type: string; items: { type: string } };
        nested: { type: string };
      };
    };

    expect(json.properties.tags.type).toBe("array");
    expect(json.properties.tags.items.type).toBe("string");
    expect(json.properties.nested.type).toBe("object");
  });

  test("is stable across calls for the same schema", () => {
    const schema = z.object({ a: z.string() });
    expect(JSON.stringify(toJsonSchema(schema))).toBe(JSON.stringify(toJsonSchema(schema)));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/schema-json.test.ts`
Expected: FAIL — cannot resolve `../../src/core/schema-json.ts`.

- [ ] **Step 4: Write the implementation**

```ts
// packages/omkit/src/core/schema-json.ts
import { z } from "zod";

/** A JSON Schema document, kept deliberately loose — consumers read known keys. */
export type JsonSchema = Record<string, unknown>;

/**
 * Convert a zod schema to JSON Schema. The single conversion point in omkit: prompt
 * hints (`schema-hint.ts`) and any external consumer read the result, so the choice of
 * converter stays here rather than spreading across callers.
 */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema) as JsonSchema;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/schema-json.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck --workspace packages/omkit
git add packages/omkit/package.json package-lock.json packages/omkit/src/core/schema-json.ts packages/omkit/tests/unit/schema-json.test.ts
git commit -m "feat(omkit): add zod and the schema-json converter"
```

---

### Task 2: `schema-hint.ts` — the human shape line

Renders a JSON Schema as the one-line type sketch shown in prompts.

**Files:**

- Create: `packages/omkit/src/core/schema-hint.ts`
- Test: `packages/omkit/tests/unit/schema-hint.test.ts`

**Interfaces:**

- Consumes: `JsonSchema` from Task 1.
- Produces: `shapeHint(schema: JsonSchema): string`. Used by Task 10.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/schema-hint.test.ts
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "../../src/core/schema-json.ts";
import { shapeHint } from "../../src/core/schema-hint.ts";

const hintFor = (schema: z.ZodType): string => shapeHint(toJsonSchema(schema));

describe("shapeHint", () => {
  test("renders scalars", () => {
    expect(hintFor(z.string())).toBe("string");
    expect(hintFor(z.number())).toBe("number");
    expect(hintFor(z.boolean())).toBe("boolean");
  });

  test("renders an object with optional fields marked", () => {
    const hint = hintFor(z.object({ host: z.string(), port: z.number().optional() }));
    expect(hint).toBe("{ host: string, port?: number }");
  });

  test("renders arrays as type[]", () => {
    expect(hintFor(z.object({ tags: z.array(z.string()) }))).toBe("{ tags: string[] }");
  });

  test("renders enums as a union of quoted literals", () => {
    expect(hintFor(z.object({ mode: z.enum(["fast", "slow"]) }))).toBe('{ mode: "fast" | "slow" }');
  });

  test("degrades to 'see schema' for a shape it cannot sketch", () => {
    expect(shapeHint({ not: "a shape it understands" })).toBe("see schema");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/schema-hint.test.ts`
Expected: FAIL — cannot resolve `../../src/core/schema-hint.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/omkit/src/core/schema-hint.ts
import type { JsonSchema } from "./schema-json.ts";

/** What we print when a schema is too gnarly to sketch (deep unions, recursion). */
const OPAQUE = "see schema";

/**
 * Render a JSON Schema as a one-line type sketch for a prompt — `{ host: string,
 * port?: number }`. Deliberately partial: anything it cannot express degrades to
 * {@link OPAQUE} rather than printing something misleading, and the caller prints the
 * raw schema alongside.
 */
export function shapeHint(schema: JsonSchema): string {
  return render(schema);
}

function render(node: unknown): string {
  if (typeof node !== "object" || node === null) return OPAQUE;
  const s = node as JsonSchema;

  const enumValues = s.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return enumValues.map((v) => JSON.stringify(v)).join(" | ");
  }

  switch (s.type) {
    case "string":
    case "number":
    case "integer":
    case "boolean":
    case "null":
      return String(s.type);
    case "array":
      return `${render(s.items)}[]`;
    case "object":
      return renderObject(s);
    default:
      return OPAQUE;
  }
}

function renderObject(s: JsonSchema): string {
  const properties = s.properties;
  if (typeof properties !== "object" || properties === null) return OPAQUE;
  const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  const entries = Object.entries(properties as Record<string, unknown>);
  if (entries.length === 0) return OPAQUE;
  const fields = entries.map(([key, value]) => {
    const optional = required.has(key) ? "" : "?";
    return `${key}${optional}: ${render(value)}`;
  });
  return `{ ${fields.join(", ")} }`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/schema-hint.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/core/schema-hint.ts packages/omkit/tests/unit/schema-hint.test.ts
git commit -m "feat(omkit): render a human shape hint from JSON Schema"
```

---

### Task 3: `multiline` prompt kind

A third prompt kind that accepts a block of text, terminated by parseable JSON, a sentinel line, or a predicate.

**Files:**

- Modify: `packages/omkit/src/core/interaction.ts:6-13` (`PromptSpec`)
- Modify: `packages/omkit/src/actions/prompt.ts`
- Test: `packages/omkit/tests/unit/prompt-multiline.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `MultilinePromptOptions { kind: "multiline"; message?: string; hint?: string; until?: "json" | string | ((text: string) => boolean); timeoutMs?: number; default?: string }`, added to the `PromptOptions` union. `PromptSpec` gains `kind: "multiline"` and `hint?: string`. Used by Task 10.

- [ ] **Step 1: Write the failing test**

`readLines` is injected so the test drives input without a TTY. Production passes a readline-backed reader.

```ts
// packages/omkit/tests/unit/prompt-multiline.test.ts
import { describe, expect, test } from "vitest";
import { readUntil } from "../../src/actions/prompt.ts";

/** Feed a fixed script of lines, one per call, then EOF (undefined). */
const scripted = (lines: string[]) => {
  let i = 0;
  return async (): Promise<string | undefined> => lines[i++];
};

describe("readUntil", () => {
  test("'json' stops as soon as the accumulated text parses", async () => {
    const read = scripted(["{", '  "host": "db.local",', '  "port": 5432', "}", "never"]);
    expect(await readUntil(read, "json")).toBe('{\n  "host": "db.local",\n  "port": 5432\n}');
  });

  test("a sentinel string stops on that line and excludes it", async () => {
    const read = scripted(["first", "second", ".", "after"]);
    expect(await readUntil(read, ".")).toBe("first\nsecond");
  });

  test("a predicate stops when it returns true", async () => {
    const read = scripted(["a", "ab", "abc"]);
    expect(await readUntil(read, (text) => text.length >= 4)).toBe("a\nab");
  });

  test("EOF ends input and returns what was collected", async () => {
    const read = scripted(["only line"]);
    expect(await readUntil(read, ".")).toBe("only line");
  });

  test("'json' returns the text unparsed if EOF arrives first", async () => {
    const read = scripted(["{ broken"]);
    expect(await readUntil(read, "json")).toBe("{ broken");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/prompt-multiline.test.ts`
Expected: FAIL — `readUntil` is not exported from `prompt.ts`.

- [ ] **Step 3: Extend `PromptSpec`**

In `packages/omkit/src/core/interaction.ts`, replace the `PromptSpec` interface (lines 6-13):

```ts
export interface PromptSpec {
  kind: "input" | "choice" | "multiline";
  message: string;
  default: string;
  choices?: { label: string; value: string }[];
  /** A one-line type sketch shown with the message — set for `multiline` JSON prompts. */
  hint?: string;
}
```

- [ ] **Step 4: Add `readUntil` and the multiline option type to `prompt.ts`**

Add near the other option interfaces in `packages/omkit/src/actions/prompt.ts`:

```ts
/** How a multiline prompt decides the user is done. */
export type MultilineUntil = "json" | string | ((text: string) => boolean);

export interface MultilinePromptOptions extends PromptCommon {
  kind: "multiline";
  /** A one-line type sketch printed under the message. */
  hint?: string;
  /** Default `"json"` — stop once the text parses as JSON. */
  until?: MultilineUntil;
  /** Value used on EOF with no input, or on timeout. Default "". */
  default?: string;
}
```

Widen the union:

```ts
export type PromptOptions = InputPromptOptions | ChoicePromptOptions | MultilinePromptOptions;
```

Add the reader (exported for tests — it is pure, so it needs no terminal):

```ts
/** Reads one line, or `undefined` at EOF. */
export type LineReader = () => Promise<string | undefined>;

/**
 * Accumulate lines until `until` says stop, or EOF. Exported for testing: keeping the
 * termination rule separate from the terminal means it can be driven by a scripted
 * reader instead of a TTY.
 *
 * `"json"` is self-terminating — pasting a pretty-printed blob just works, with no
 * sentinel to explain. A sentinel line is excluded from the result.
 */
export async function readUntil(read: LineReader, until: MultilineUntil): Promise<string> {
  const lines: string[] = [];
  for (;;) {
    const line = await read();
    if (line === undefined) break; // EOF
    if (typeof until === "string" && until !== "json" && line === until) break;
    lines.push(line);
    const text = lines.join("\n");
    if (until === "json" && parses(text)) break;
    if (typeof until === "function" && until(text)) break;
  }
  return lines.join("\n");
}

function parses(text: string): boolean {
  if (text.trim() === "") return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/prompt-multiline.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Wire `multiline` into the prompt action**

In the `prompt` action body in `packages/omkit/src/actions/prompt.ts`, add a branch before the existing `if (opts.kind === "choice")`:

```ts
if (opts.kind === "multiline") {
  defaultValue = opts.default ?? "";
  message = opts.message ?? "Input:";
  query = opts.hint ? `${message}\n  ${opts.hint}\n> ` : `${message}\n> `;
  resolveRaw = (raw): string | undefined => raw;
} else if (opts.kind === "choice") {
  // ...existing choice branch unchanged...
```

In `askTerminal`, read multiple lines when the spec is multiline. Change its signature to take the kind and `until`, and branch:

```ts
async function askTerminal(
  query: string,
  resolveRaw: (raw: string) => string | undefined,
  defaultValue: string,
  waitSignal: AbortSignal,
  multiline?: { until: MultilineUntil }
): Promise<Answer> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (multiline) {
      process.stdout.write(query);
      const read: LineReader = async () => {
        try {
          return await rl.question("", { signal: waitSignal });
        } catch {
          return undefined;
        }
      };
      const text = await readUntil(read, multiline.until);
      if (text.trim() === "") return { value: defaultValue, via: "default" };
      return { value: text, via: "input" };
    }
    const raw = (await rl.question(query, { signal: waitSignal })).trim();
    if (raw === "") return { value: defaultValue, via: "default" };
    const resolved = resolveRaw(raw);
    if (resolved !== undefined) return { value: resolved, via: "input" };
    console.log(`invalid answer "${raw}", using default`);
    return { value: defaultValue, via: "default" };
  } finally {
    rl.close();
  }
}
```

At the call site, pass the multiline config and the `hint` through to the supervisor spec:

```ts
const multiline =
  opts.kind === "multiline" ? { until: opts.until ?? ("json" as MultilineUntil) } : undefined;

const outcome = supervisor
  ? await askSupervisor(supervisor, { opts, message, defaultValue, resolveRaw }, waitSignal)
  : await askTerminal(query, resolveRaw, defaultValue, waitSignal, multiline);
```

And in `askSupervisor`, build the spec with the new kind and hint:

```ts
const spec: PromptSpec = {
  kind: opts.kind === "choice" ? "choice" : opts.kind === "multiline" ? "multiline" : "input",
  message,
  default: defaultValue,
  ...(opts.kind === "choice" ? { choices: asChoices(opts.choices) } : {}),
  ...(opts.kind === "multiline" && opts.hint ? { hint: opts.hint } : {}),
};
```

- [ ] **Step 7: Typecheck, run the full suite, commit**

The Ink app renders `PromptSpec` — confirm the widened union still compiles there. A dedicated multiline editor is **deferred by the spec**; the Ink app falls back to its single-line input, which is correct behavior, not a gap to fix here.

```bash
npm run typecheck --workspace packages/omkit
npx vitest run packages/omkit/tests/unit
```

Expected: PASS, including the pre-existing `prompt-supervised.test.ts`.

```bash
git add packages/omkit/src/core/interaction.ts packages/omkit/src/actions/prompt.ts packages/omkit/tests/unit/prompt-multiline.test.ts
git commit -m "feat(omkit): add a multiline prompt kind"
```

---

### Task 4: `ArtifactStore` and `ctx.artifact`

Register a label, description, and MIME for a file the om wrote, and drop a timeline line.

**Files:**

- Create: `packages/omkit/src/output/artifact/ArtifactStore.ts`
- Modify: `packages/omkit/src/core/types.ts` (`ActionContext`, `OmContext`)
- Modify: `packages/omkit/src/core/ActionRun.ts:26-29, 69-70, 99-100, 267-302`
- Modify: `packages/omkit/src/core/ExecutionTree.ts:151-169` (`nodeDeps`)
- Test: `packages/omkit/tests/unit/artifact.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `ArtifactRecord { name: string; file: string; description?: string; mime: string; nodeId: string }`
  - `class ArtifactStore { register(name, file, nodeId, opts?): ArtifactRecord; all(): readonly ArtifactRecord[] }`
  - `ctx.artifact(name: string, file: string, opts?: { description?: string; mime?: string }): string` on both `ActionContext` and `OmContext`, returning the absolute file path.

  Used by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/artifact.test.ts
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import { ArtifactStore } from "../../src/output/artifact/ArtifactStore.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("ArtifactStore", () => {
  test("infers mime from the extension", () => {
    const store = new ArtifactStore();
    expect(store.register("shot", "/runs/a/shot.png", "main").mime).toBe("image/png");
    expect(store.register("data", "/runs/a/data.json", "main").mime).toBe("application/json");
    expect(store.register("log", "/runs/a/out.log", "main").mime).toBe("text/plain");
  });

  test("an explicit mime wins over inference", () => {
    const store = new ArtifactStore();
    const record = store.register("odd", "/runs/a/thing.bin", "main", {
      mime: "application/x-custom",
    });
    expect(record.mime).toBe("application/x-custom");
  });

  test("falls back to application/octet-stream for an unknown extension", () => {
    const store = new ArtifactStore();
    expect(store.register("blob", "/runs/a/thing.qqq", "main").mime).toBe(
      "application/octet-stream"
    );
  });

  test("all() returns registrations in order", () => {
    const store = new ArtifactStore();
    store.register("one", "/runs/a/1.png", "main");
    store.register("two", "/runs/a/2.png", "main");
    expect(store.all().map((r) => r.name)).toEqual(["one", "two"]);
  });
});

describe("ctx.artifact", () => {
  test("registers from an om body and returns the path", async () => {
    let returned = "";
    await om("artifact-probe", async (ctx) => {
      returned = ctx.artifact("login-failure", path.join(ctx.artifactsFolder, "shot.png"), {
        description: "Screenshot at the failing assertion",
      });
    });

    const artifacts = ExecutionTree.last!.artifactsForTest();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].name).toBe("login-failure");
    expect(artifacts[0].description).toBe("Screenshot at the failing assertion");
    expect(artifacts[0].mime).toBe("image/png");
    expect(returned).toBe(artifacts[0].file);
  });

  test("the registration reaches the run timeline", async () => {
    await om("artifact-timeline", async (ctx) => {
      ctx.artifact("report", path.join(ctx.artifactsFolder, "report.json"));
    });

    const lines = ExecutionTree.last!.entriesForTest().map((e) => e.message);
    expect(lines.some((m) => m.includes("report") && m.includes("report.json"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/artifact.test.ts`
Expected: FAIL — cannot resolve `ArtifactStore`.

- [ ] **Step 3: Write `ArtifactStore`**

```ts
// packages/omkit/src/output/artifact/ArtifactStore.ts
import path from "node:path";

/** One curated artifact — a file the om chose to label. */
export interface ArtifactRecord {
  readonly name: string;
  /** Absolute path to the file. */
  readonly file: string;
  readonly description?: string;
  readonly mime: string;
  /** The node that registered it. */
  readonly nodeId: string;
}

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
  ".zip": "application/zip",
};

/**
 * The run's curated artifacts — the files an om labelled via `ctx.artifact`, in
 * registration order. Holds no I/O: the om already wrote the file, this records what it
 * means. Unregistered files stay in the run folder and stay listed by anything
 * enumerating it; curation raises signal, it does not gate access.
 */
export class ArtifactStore {
  private readonly records: ArtifactRecord[] = [];

  register(
    name: string,
    file: string,
    nodeId: string,
    opts: { description?: string; mime?: string } = {}
  ): ArtifactRecord {
    const record: ArtifactRecord = {
      name,
      file,
      nodeId,
      mime: opts.mime ?? mimeOf(file),
      ...(opts.description === undefined ? {} : { description: opts.description }),
    };
    this.records.push(record);
    return record;
  }

  all(): readonly ArtifactRecord[] {
    return this.records;
  }
}

function mimeOf(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}
```

- [ ] **Step 4: Add `artifact` to the context types**

In `packages/omkit/src/core/types.ts`, add to `ActionContext` (after `snapshot`):

```ts
  /**
   * Label a file this action wrote — name, optional description, MIME inferred from the
   * extension. Drops a timeline line and returns the file's path. Purely descriptive:
   * the file must already exist (or be written next); this records what it is.
   */
  readonly artifact: (
    name: string,
    file: string,
    opts?: { description?: string; mime?: string }
  ) => string;
```

Add the identical member to `OmContext` (after its `snapshot`).

- [ ] **Step 5: Thread the store through `ExecutionTree` and `ActionRun`**

In `ExecutionTree.ts`, import and construct alongside the snapshot store:

```ts
import { ArtifactStore } from "../output/artifact/ArtifactStore.ts";
```

Add the field next to `snapshotStore` (near line 53) and initialize it next to line 84:

```ts
  private readonly artifactStore = new ArtifactStore();
```

Add it to `nodeDeps()` (lines 152-168) — both the return type and the object:

```ts
artifacts: ArtifactStore;
```

```ts
      artifacts: this.artifactStore,
```

Add two test seams beside `runViewForTest` (near line 369):

```ts
  /** Test seam: the run's curated artifacts. */
  artifactsForTest(): readonly ArtifactRecord[] {
    return this.artifactStore.all();
  }

  /** Test seam: every log entry recorded for this run. */
  entriesForTest(): readonly LogEntry[] {
    return this.store.entries();
  }
```

`entries()` is the public accessor on `LogStore` (LogStore.ts:54) — the `history` array itself is private, so do not reach for `this.store.history`.

Import `ArtifactRecord` as a type from `../output/artifact/ArtifactStore.ts`, and `LogEntry` from `../foundation/LogEntry.ts` if not already imported.

In `ActionRun.ts`, add to `NodeInit` (beside `snapshots`, near line 27):

```ts
  /** The run's artifact registry — backs `ctx.artifact`. */
  readonly artifacts: ArtifactStore;
```

Add the private field (near line 69) and assign it (near line 99):

```ts
  private readonly artifacts: ArtifactStore;
```

```ts
this.artifacts = init.artifacts;
```

Add to `context()` (after the `snapshot` line, 280):

```ts
      artifact: (name, file, opts) => this.registerArtifact(name, file, opts),
```

And the method beside `captureSnapshot`:

```ts
  private registerArtifact(
    name: string,
    file: string,
    opts?: { description?: string; mime?: string }
  ): string {
    const record = this.artifacts.register(name, file, this.id, opts);
    this.log("artifact", "artifact", `${name} → ${record.file}`);
    this.bubble(`📎 ${name} → ${record.file}`);
    return record.file;
  }
```

If the `level` union on `LogEntry` is a closed string type, add `"artifact"` to it in `packages/omkit/src/foundation/LogEntry.ts`.

- [ ] **Step 6: Expose `artifact` on the om root context**

In `packages/omkit/src/core/om.ts`, add to the object passed to `body(...)`:

```ts
      artifact: ctx.artifact,
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/artifact.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Typecheck, full suite, commit**

```bash
npm run typecheck --workspace packages/omkit
npx vitest run packages/omkit/tests/unit
git add packages/omkit/src/output/artifact/ArtifactStore.ts packages/omkit/src/core/types.ts packages/omkit/src/core/ActionRun.ts packages/omkit/src/core/ExecutionTree.ts packages/omkit/src/core/om.ts packages/omkit/src/foundation/LogEntry.ts packages/omkit/tests/unit/artifact.test.ts
git commit -m "feat(omkit): add ctx.artifact and the artifact registry"
```

---

### Task 5: `artifacts.log` rollup and `result.json`

Curated artifacts reach the on-disk record, so the CLI and any other consumer read the same list.

**Files:**

- Modify: `packages/omkit/src/output/writers/views.ts:26-36` (`RunView`)
- Modify: `packages/omkit/src/core/ExecutionTree.ts:299-306` (finalize), `:328-340` (summary lines), `:373-384` (`runView`)
- Test: `packages/omkit/tests/unit/artifact-output.test.ts`

**Interfaces:**

- Consumes: `ArtifactStore`, `ArtifactRecord` from Task 4.
- Produces: `RunView.artifacts: readonly ArtifactView[]` where `ArtifactView { name: string; file: string; description?: string; mime: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/artifact-output.test.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("artifact output", () => {
  test("curated artifacts appear in the run view", async () => {
    await om("artifact-view", async (ctx) => {
      ctx.artifact("report", path.join(ctx.artifactsFolder, "report.json"), {
        description: "The generated report",
      });
    });

    const view = ExecutionTree.last!.runViewForTest();
    expect(view.artifacts).toHaveLength(1);
    expect(view.artifacts[0]).toMatchObject({
      name: "report",
      description: "The generated report",
      mime: "application/json",
    });
  });

  test("result.json carries the artifacts", async () => {
    await om("artifact-result", async (ctx) => {
      ctx.artifact("shot", path.join(ctx.artifactsFolder, "shot.png"));
    });

    const folder = ExecutionTree.last!.folder.path();
    const parsed = JSON.parse(await readFile(path.join(folder, "result.json"), "utf8")) as {
      artifacts: { name: string; mime: string }[];
    };
    expect(parsed.artifacts).toEqual([
      expect.objectContaining({ name: "shot", mime: "image/png" }),
    ]);
  });

  test("artifacts.log lists each registration", async () => {
    await om("artifact-rollup", async (ctx) => {
      ctx.artifact("one", path.join(ctx.artifactsFolder, "one.png"));
      ctx.artifact("two", path.join(ctx.artifactsFolder, "two.png"));
    });

    const folder = ExecutionTree.last!.folder.path();
    const rollup = await readFile(path.join(folder, "artifacts.log"), "utf8");
    expect(rollup).toContain("one");
    expect(rollup).toContain("two");
  });

  test("a run with no artifacts still writes an empty list", async () => {
    await om("artifact-none", async () => {});
    expect(ExecutionTree.last!.runViewForTest().artifacts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/artifact-output.test.ts`
Expected: FAIL — `view.artifacts` is undefined.

- [ ] **Step 3: Extend `RunView`**

In `packages/omkit/src/output/writers/views.ts`, add above `RunView`:

```ts
/** A curated artifact, as projected into `result.json`. Data-only — no core import. */
export interface ArtifactView {
  readonly name: string;
  /** Absolute path to the file. */
  readonly file: string;
  readonly description?: string;
  readonly mime: string;
}
```

And add the member to `RunView`:

```ts
  /** Files the run labelled via `ctx.artifact`, in registration order. */
  readonly artifacts: readonly ArtifactView[];
```

- [ ] **Step 4: Populate it and write the rollup**

In `ExecutionTree.ts`, add to `runView()`:

```ts
      artifacts: this.artifactStore.all().map(({ name, file, description, mime }) => ({
        name,
        file,
        mime,
        ...(description === undefined ? {} : { description }),
      })),
```

In finalize, add the rollup beside the others (after the `snapshots.log` line, 305):

```ts
await writeRollup(at("artifacts.log"), flat, entries, (e) => e.level === "artifact");
```

In `summaryLines` (near 328-340), add the sibling path so the end-of-run recap lists it beside the others:

```ts
      `  artifacts → ${at("artifacts.log")}`,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/artifact-output.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Full suite and commit**

Other tests assert on `result.json` or the summary block and may need the new key or line added to their expectations. Update them — the new field is intended output, not a regression.

```bash
npm run typecheck --workspace packages/omkit
npx vitest run packages/omkit/tests/unit
git add packages/omkit/src/output/writers/views.ts packages/omkit/src/core/ExecutionTree.ts packages/omkit/tests/unit/artifact-output.test.ts
git commit -m "feat(omkit): write curated artifacts to artifacts.log and result.json"
```

---

### Task 6: The om builder, alongside the existing form

Adds `om(name).describe(…).run(body)`. **`om(name, body)` keeps working** — it is removed in Task 9, after every call site has moved. This ordering keeps the suite green at every commit.

**Files:**

- Modify: `packages/omkit/src/core/om.ts`
- Modify: `packages/omkit/src/core/types.ts` (builder interfaces)
- Test: `packages/omkit/tests/unit/om-builder.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `OmDescription { summary: string }`
  - `OmBuilder { describe(d: OmDescription): OmBuilder; run(body: (ctx: OmContext) => Awaitable<void>): Promise<void> }`
  - `om(name: string): OmBuilder` **and** `om(name: string, body: (ctx: OmContext) => Awaitable<void>): Promise<void>` as overloads.

  Task 10 extends `OmBuilder` with `.args()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/om-builder.test.ts
import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("om builder", () => {
  test("om(name).run(body) runs the body", async () => {
    let ran = false;
    await om("builder-basic").run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test(".describe() is optional and chainable", async () => {
    let ran = false;
    await om("builder-described")
      .describe({ summary: "Does a thing" })
      .run(async () => {
        ran = true;
      });
    expect(ran).toBe(true);
  });

  test("the builder produces the same run identity as the two-arg form", async () => {
    await om("identity-parity", async () => {});
    const legacy = ExecutionTree.last!.folder.name();
    ExecutionTree.reset();

    await om("identity-parity").run(async () => {});
    expect(ExecutionTree.last!.folder.name()).toBe(legacy);
  });

  test("the builder rejects an empty name", () => {
    expect(() => om("")).toThrow(/name/);
    expect(() => om("   ")).toThrow(/name/);
  });

  test("the body receives the om context", async () => {
    let sawFolder = "";
    await om("builder-ctx").run(async (ctx) => {
      sawFolder = ctx.artifactsFolder;
    });
    expect(sawFolder).toContain("builder-ctx");
  });
});
```

The third test is the one that matters: it proves migrating a call site does not move its run folder. `siteFile` strips `:line`, so both forms hash identically **as long as the `callerSite()` capture stays in the same file**.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/om-builder.test.ts`
Expected: FAIL — `om("builder-basic").run` is not a function.

- [ ] **Step 3: Add the builder types**

In `packages/omkit/src/core/types.ts`:

```ts
/** Human-readable metadata about an om or action. */
export interface OmDescription {
  /** One line saying what this does. */
  summary: string;
}

/** The builder returned by `om(name)`. `.run(body)` launches the run. */
export interface OmBuilder {
  describe(description: OmDescription): OmBuilder;
  run(body: (ctx: OmContext) => Awaitable<void>): Promise<void>;
}
```

- [ ] **Step 4: Implement the builder in `om.ts`**

`callerSite()` must be captured where `om()` itself was called, **not** inside `.run()`, or the defining file becomes `om.ts` and every run folder changes. Capture it once in `om()` and carry it on the builder.

```ts
// packages/omkit/src/core/om.ts
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
 * `.run(body)`. The name plus the absolute path of the calling file identify the run;
 * its log folder is `logs/<name>-<hash8>/…`, so same-named oms in different files never
 * share a folder.
 *
 * @deprecated The two-argument form is being removed. Use `om(name).run(body)`.
 */
export function om(name: string): OmBuilder;
export function om(name: string, body: (ctx: OmContext) => Awaitable<void>): Promise<void>;
export function om(
  name: string,
  body?: (ctx: OmContext) => Awaitable<void>
): OmBuilder | Promise<void> {
  assertName(name);
  const site = callerSite(); // the om() call site — the run's defining script
  return body === undefined ? new Builder(name, site) : launch(name, site, body);
}
```

- [ ] **Step 5: Run both the new and the identity tests**

```bash
npx vitest run packages/omkit/tests/unit/om-builder.test.ts packages/omkit/tests/unit/om-identity.test.ts
```

Expected: PASS. If `om-identity.test.ts` fails on folder names, `callerSite()` is being captured in the wrong frame — verify it is called directly inside `om()`.

- [ ] **Step 6: Export the new types and commit**

Add `OmBuilder` and `OmDescription` to the type exports in `packages/omkit/src/index.ts`.

```bash
npm run typecheck --workspace packages/omkit
npx vitest run packages/omkit/tests/unit
git add packages/omkit/src/core/om.ts packages/omkit/src/core/types.ts packages/omkit/src/index.ts packages/omkit/tests/unit/om-builder.test.ts
git commit -m "feat(omkit): add the om builder alongside the two-arg form"
```

---

### Task 7: `.describe()` and `.args()` on `action`

Adds the same metadata methods to the action builder. `.args()` here is **type-level only** — it pins the first parameter; nothing resolves it (an action called from an om is passed its args directly in code).

**Files:**

- Modify: `packages/omkit/src/core/action.ts:20-52`
- Modify: `packages/omkit/src/core/types.ts:126-132` (`ActionBuilderEvents`)
- Test: `packages/omkit/tests/unit/action-metadata.test.ts`

**Interfaces:**

- Consumes: `OmDescription` from Task 6, `toJsonSchema` from Task 1.
- Produces: `ActionBuilderEvents` gains `describe(d: OmDescription): this` and `args<S extends z.ZodType>(schema: S): ActionBuilderArgs<S, Events, Handle>`, where `ActionBuilderArgs.run(body: (ctx, args: z.infer<S>) => Awaitable<Result>)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/action-metadata.test.ts
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("action metadata", () => {
  test(".describe() is chainable and does not change behavior", async () => {
    const doubled = action("doubled")
      .describe({ summary: "Doubles a number" })
      .run(async (_ctx, n: number) => n * 2);

    let result = 0;
    await om("action-describe").run(async () => {
      result = await doubled(21).result;
    });
    expect(result).toBe(42);
  });

  test(".args() pins the first parameter and passes it through", async () => {
    const seed = action("seed")
      .args(z.object({ rows: z.number() }))
      .run(async (_ctx, args) => args.rows);

    let result = 0;
    await om("action-args").run(async () => {
      result = await seed({ rows: 500 }).result;
    });
    expect(result).toBe(500);
  });

  test(".describe() and .args() compose with .emits() and .ref()", async () => {
    const built = action("composed")
      .describe({ summary: "Everything at once" })
      .emits<{ tick: number }>()
      .ref<string>()
      .args(z.object({ label: z.string() }))
      .run(async (ctx, args) => {
        ctx.emit("tick", 1);
        ctx.attach(args.label);
        return args.label;
      });

    let handle = "";
    await om("action-composed").run(async () => {
      handle = await built({ label: "ok" }).ref;
    });
    expect(handle).toBe("ok");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/action-metadata.test.ts`
Expected: FAIL — `.describe` is not a function on the action builder.

- [ ] **Step 3: Extend the builder types**

In `packages/omkit/src/core/types.ts`, replace `ActionBuilderEvents` with:

```ts
/** Intermediate step from `action(name)`: declare metadata/events/handle, then the impl. */
export interface ActionBuilderEvents<Events extends object, Handle = void> {
  describe(description: OmDescription): ActionBuilderEvents<Events, Handle>;
  emits<E extends object>(): ActionBuilderEvents<E, Handle>;
  ref<H>(): ActionBuilderEvents<Events, H>;
  /** Pin the first parameter to the schema's inferred type. */
  args<S extends ZodTypeLike>(schema: S): ActionBuilderArgs<S, Events, Handle>;
  run<Args extends unknown[], Result>(
    body: (ctx: ActionContext<Events, Handle>, ...args: Args) => Awaitable<Result>
  ): Action<Args, Result, Events, Handle>;
}

/** After `.args(schema)`: `.run` takes exactly one typed argument. */
export interface ActionBuilderArgs<S extends ZodTypeLike, Events extends object, Handle = void> {
  describe(description: OmDescription): ActionBuilderArgs<S, Events, Handle>;
  run<Result>(
    body: (ctx: ActionContext<Events, Handle>, args: InferSchema<S>) => Awaitable<Result>
  ): Action<[InferSchema<S>], Result, Events, Handle>;
}
```

Add the two structural aliases at the top of the file, so `types.ts` does not import zod's runtime:

```ts
import type { z } from "zod";

/** Any zod schema. Aliased so the rest of the file reads without zod's generics. */
export type ZodTypeLike = z.ZodType;
/** The TypeScript type a schema validates to. */
export type InferSchema<S extends ZodTypeLike> = z.infer<S>;
```

- [ ] **Step 4: Implement in `action.ts`**

Add to the existing `Builder` class:

```ts
  describe(description: OmDescription): ActionBuilderEvents<Events, Handle> {
    this.description = description;
    return this;
  }

  args<S extends ZodTypeLike>(schema: S): ActionBuilderArgs<S, Events, Handle> {
    return new ArgsBuilder<S, Events, Handle>(this.name, schema, this.description);
  }
```

with `private description: OmDescription | undefined;` as a field, and `name` widened from `private readonly` to a settable-at-construction field if needed.

Then the args-flavored builder, which reuses the same launch path:

```ts
/**
 * The builder after `.args(schema)`. The schema pins `.run`'s parameter type; it is not
 * validated here — an action invoked from an om body is passed its args directly in code.
 * (Spec B's MCP server validates before it ever reaches this point.)
 */
class ArgsBuilder<
  S extends ZodTypeLike,
  Events extends object,
  Handle,
> implements ActionBuilderArgs<S, Events, Handle> {
  constructor(
    private readonly name: string,
    private readonly schema: S,
    private description: OmDescription | undefined
  ) {}

  describe(description: OmDescription): ActionBuilderArgs<S, Events, Handle> {
    this.description = description;
    return this;
  }

  run<Result>(
    body: (ctx: ActionContext<Events, Handle>, args: InferSchema<S>) => Awaitable<Result>
  ): Action<[InferSchema<S>], Result, Events, Handle> {
    void this.schema;
    void this.description;
    const name = this.name;
    const definedAt = callerSite();
    const exec = body as unknown as Exec<object, unknown, unknown>;
    const create = (...args: [InferSchema<S>]): Activity<Result, Events, Handle> => {
      const spec: LaunchSpec = { name, args, tags: [], body: exec, definedAt };
      return ExecutionTree.require().launch(spec) as unknown as Activity<Result, Events, Handle>;
    };
    return Object.assign(create, { actionName: name, definedAt });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/action-metadata.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Full suite and commit**

```bash
npm run typecheck --workspace packages/omkit
npx vitest run packages/omkit/tests/unit
git add packages/omkit/src/core/action.ts packages/omkit/src/core/types.ts packages/omkit/tests/unit/action-metadata.test.ts
git commit -m "feat(omkit): add describe and args to the action builder"
```

---

### Task 8: Migrate every call site to the builder

Mechanical: `om(n, body)` → `om(n).run(body)`. Both forms still work, so the suite stays green throughout.

**Files:**

- Modify: `packages/omkit/src/cli/commands/init.ts` (scaffold template)
- Modify: `om/oms/tskb-dev.ts`, `om/oms/tskb-build.ts`
- Modify: `packages/omkit/tests/unit/*.test.ts` (~13 files), `packages/omkit/tests/fixtures/**` (3 files)

**Interfaces:**

- Consumes: `om(name).run(body)` from Task 6.
- Produces: no new API. After this task nothing calls the two-argument form.

- [ ] **Step 1: List every call site**

```bash
grep -rn --include=*.ts --include=*.tsx --include=*.md -E "\bom\(\s*[\"'\`]" packages/omkit om | grep -v node_modules
```

Expected: ~20 hits across tests, fixtures, `init.ts`, the two live oms, and the README.

- [ ] **Step 2: Migrate the scaffold and the live oms**

In each, rewrite `om("name", async (ctx) => { … })` as `om("name").run(async (ctx) => { … })`. Nothing else changes — no `.describe()` is required.

- [ ] **Step 3: Verify the live oms still run**

```bash
npx omkit ls
```

Expected: both `tskb-dev` and `tskb-build` are still discovered. Discovery matches `om("name")` as a call expression with a string-literal first argument, which the builder form still is.

- [ ] **Step 4: Migrate tests and fixtures**

Apply the same rewrite. Two call sites need care:

- `packages/omkit/tests/unit/om-identity.test.ts:14-17` asserts the two-argument form throws on a bad name. Rewrite those to the builder: `expect(() => om("")).toThrow(/name/)`. The `@ts-expect-error` on line 14 becomes unnecessary once `om()` with no name is still a type error — keep it only if the compiler still flags the line.
- `packages/omkit/tests/unit/defined-at.test.ts` asserts on `file:line`. Since `siteFile` strips `:line` for the hash but `definedAt` keeps it, the expected line number may shift — update it to the new line, do not weaken the assertion.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run
```

Expected: PASS, including e2e. Every folder name in `logs/` is unchanged from before the migration — that is what Task 6's parity test guarantees.

- [ ] **Step 6: Commit**

```bash
git add -A packages/omkit/tests packages/omkit/src/cli/commands/init.ts om/oms
git commit -m "refactor(omkit): migrate every om call site to the builder"
```

---

### Task 9: Remove `om(name, body)`

The breaking change. Nothing calls it after Task 8, so this is a deletion plus documentation.

**Files:**

- Modify: `packages/omkit/src/core/om.ts` (drop the overload)
- Modify: `packages/omkit/README.md`
- Modify: `packages/omkit/package.json` (version)
- Create: `packages/omkit/CHANGELOG.md` (if absent; otherwise prepend)
- Test: `packages/omkit/tests/unit/om-builder.test.ts` (add the removal test)

**Interfaces:**

- Consumes: Task 6's builder.
- Produces: `om(name: string): OmBuilder` as the only signature.

- [ ] **Step 1: Write the failing test**

Add to `packages/omkit/tests/unit/om-builder.test.ts`:

```ts
test("the removed two-argument form throws and points at .run()", () => {
  // @ts-expect-error — the two-argument form no longer exists
  expect(() => om("legacy", async () => {})).toThrow(/\.run\(/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/om-builder.test.ts`
Expected: FAIL — the call succeeds and starts a run instead of throwing. The `@ts-expect-error` also reports as unused, since the overload still exists.

- [ ] **Step 3: Delete the overload**

In `packages/omkit/src/core/om.ts`, replace the overloads and implementation with:

```ts
/**
 * Define a run. `om(name)` returns a builder — chain `.describe(…)` / `.args(…)` and
 * finish with `.run(body)`. The name plus the absolute path of the calling file identify
 * the run; its log folder is `logs/<name>-<hash8>/…`, so same-named oms in different
 * files never share a folder.
 */
export function om(name: string): OmBuilder {
  assertName(name);
  if (arguments.length > 1) {
    throw new Error(
      "om(name, body) was removed — use om(name).run(body). See the omkit CHANGELOG."
    );
  }
  return new Builder(name, callerSite());
}
```

`arguments.length` is what makes the JS-side call throw with a useful message rather than silently ignoring the second argument. TypeScript callers get a compile error first.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/om-builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the README**

`constraint-readme-sync.tskb.tsx` requires this. Two edits:

1. **Update every `om(` example in the README** to the builder form.
2. **Add a new section** near the top, titled `## Migrating from om(name, body)`, containing:
   - A sentence stating that `om(name, body)` was removed in 0.5.0 and `.run(body)` replaces it.
   - A fenced `diff` code block showing exactly this before/after:

```diff
-om("dev", async (ctx) => {
+om("dev").run(async (ctx) => {
   // ...
 });
```

- A closing sentence: "Run folders are unaffected — a run's identity is its name plus
  its defining file, and line numbers are not part of the hash, so migrating a call
  site keeps its history."

- [ ] **Step 6: Bump the version and write the changelog**

```bash
npm version minor --workspace packages/omkit --no-git-tag-version
```

Expected: `0.4.8` → `0.5.0`. Prepend to `packages/omkit/CHANGELOG.md`:

```markdown
## 0.5.0

### Breaking

- **`om(name, body)` removed.** Use `om(name).run(body)`. Run folders are unchanged:
  identity is the om's name plus its defining file, and line numbers are excluded from
  the hash, so migrating a call site preserves its history.

### Added

- `om(name).describe({ summary })` and `action(name).describe({ summary })`.
- `action(name).args(schema)` pins the first parameter to a zod schema's inferred type.
- `ctx.artifact(name, file, opts?)` labels a file the run produced. Registrations reach
  the timeline, `artifacts.log`, and `result.json`.
- `prompt({ kind: "multiline" })` reads a block of text, terminated by parseable JSON,
  a sentinel line, or a predicate.
```

- [ ] **Step 7: Full suite, build, commit**

```bash
npm run typecheck --workspace packages/omkit
npx vitest run
npm run build --workspace packages/omkit
git add packages/omkit/src/core/om.ts packages/omkit/README.md packages/omkit/CHANGELOG.md packages/omkit/package.json packages/omkit/tests/unit/om-builder.test.ts
git commit -m "feat(omkit)!: remove om(name, body) in favour of the builder"
```

---

### Task 10: `.args()` on om, and argument resolution

The last piece: an om declares an input shape, and omkit fills it from the environment, defaults, then prompting.

**Files:**

- Create: `packages/omkit/src/core/args.ts`
- Modify: `packages/omkit/src/core/om.ts` (builder gains `.args()`; root body resolves)
- Modify: `packages/omkit/src/core/types.ts` (`OmBuilder`, `OmBuilderArgs`)
- Modify: `packages/omkit/src/core/ExecutionTree.ts:247` (root args)
- Test: `packages/omkit/tests/unit/args-resolution.test.ts`

**Interfaces:**

- Consumes: `toJsonSchema` (Task 1), `shapeHint` (Task 2), `prompt` with `kind: "multiline"` (Task 3), `OmBuilder` (Task 6), `ZodTypeLike` / `InferSchema` (Task 7).
- Produces:
  - `resolveArgs(schema, opts): Promise<unknown>` in `core/args.ts`, where `opts` is `{ supplied: unknown; interactive: boolean; ask: (spec: AskSpec) => Promise<string> }` and `AskSpec` is `{ path: string; kind: "scalar" | "json"; hint: string; jsonSchema: JsonSchema }`.
  - `MissingArgsError` with `.fields: string[]`.
  - `OmBuilderArgs<S>` with `run(body: (ctx: OmContext, args: InferSchema<S>) => Awaitable<void>): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`resolveArgs` takes an injected `ask`, so resolution is testable without a terminal.

```ts
// packages/omkit/tests/unit/args-resolution.test.ts
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { MissingArgsError, resolveArgs } from "../../src/core/args.ts";

const never = async (): Promise<string> => {
  throw new Error("should not have prompted");
};

describe("resolveArgs", () => {
  test("supplied values win and defaults fill the rest", async () => {
    const schema = z.object({ rows: z.number(), truncate: z.boolean().default(false) });
    const resolved = await resolveArgs(schema, {
      supplied: { rows: 500 },
      interactive: false,
      ask: never,
    });
    expect(resolved).toEqual({ rows: 500, truncate: false });
  });

  test("a fully defaulted schema needs no prompting even when non-interactive", async () => {
    const schema = z.object({ truncate: z.boolean().default(false) });
    expect(await resolveArgs(schema, { supplied: {}, interactive: false, ask: never })).toEqual({
      truncate: false,
    });
  });

  test("prompts for a missing scalar and coerces the answer", async () => {
    const schema = z.object({ rows: z.number() });
    const asked: string[] = [];
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async (spec) => {
        asked.push(spec.path);
        return "500";
      },
    });
    expect(resolved).toEqual({ rows: 500 });
    expect(asked).toEqual(["rows"]);
  });

  test("prompts for a missing object as JSON, with a shape hint", async () => {
    const schema = z.object({ config: z.object({ host: z.string(), port: z.number() }) });
    let seenHint = "";
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async (spec) => {
        expect(spec.kind).toBe("json");
        seenHint = spec.hint;
        return '{"host":"db.local","port":5432}';
      },
    });
    expect(resolved).toEqual({ config: { host: "db.local", port: 5432 } });
    expect(seenHint).toBe("{ host: string, port: number }");
  });

  test("non-interactive names every missing field in one error", async () => {
    const schema = z.object({ rows: z.number(), name: z.string() });
    await expect(
      resolveArgs(schema, { supplied: {}, interactive: false, ask: never })
    ).rejects.toThrow(MissingArgsError);

    const error = await resolveArgs(schema, {
      supplied: {},
      interactive: false,
      ask: never,
    }).catch((e: unknown) => e as MissingArgsError);
    expect(error.fields.sort()).toEqual(["name", "rows"]);
  });

  test("an empty answer is not a value — it re-asks rather than coercing to 0", async () => {
    const schema = z.object({ rows: z.number() });
    const answers = ["", "  ", "42"];
    let i = 0;
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async () => answers[i++],
    });
    // Without the empty-answer guard this resolves to 0, because Number("") === 0.
    expect(resolved).toEqual({ rows: 42 });
    expect(i).toBe(3);
  });

  test("re-asks on an invalid answer and gives up after 3 attempts", async () => {
    const schema = z.object({ rows: z.number() });
    let attempts = 0;
    await expect(
      resolveArgs(schema, {
        supplied: {},
        interactive: true,
        ask: async () => {
          attempts++;
          return "not-a-number";
        },
      })
    ).rejects.toThrow(/rows/);
    expect(attempts).toBe(3);
  });

  test("a schema with no fields resolves to an empty object", async () => {
    expect(
      await resolveArgs(z.object({}), { supplied: {}, interactive: false, ask: never })
    ).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/args-resolution.test.ts`
Expected: FAIL — cannot resolve `../../src/core/args.ts`.

- [ ] **Step 3: Implement `args.ts`**

```ts
// packages/omkit/src/core/args.ts
import type { z } from "zod";
import { toJsonSchema, type JsonSchema } from "./schema-json.ts";
import { shapeHint } from "./schema-hint.ts";

/** Thrown when args are missing and nobody can be asked. */
export class MissingArgsError extends Error {
  constructor(readonly fields: string[]) {
    super(
      `missing required arg${fields.length === 1 ? "" : "s"}: ${fields.join(", ")} — ` +
        `pass them via OMKIT_ARGS, or run interactively`
    );
    this.name = "MissingArgsError";
  }
}

/** What the caller must render to get one value from the user. */
export interface AskSpec {
  /** Dotted path of the field, e.g. `rows` or `config`. */
  readonly path: string;
  readonly kind: "scalar" | "json";
  /** One-line type sketch for the prompt. */
  readonly hint: string;
  /** The field's JSON Schema, for printing when the hint degrades. */
  readonly jsonSchema: JsonSchema;
}

export interface ResolveOptions {
  /** Values already supplied (from `OMKIT_ARGS`). */
  readonly supplied: unknown;
  /** False when there is no supervisor and stdin is not a TTY. */
  readonly interactive: boolean;
  readonly ask: (spec: AskSpec) => Promise<string>;
}

const MAX_ATTEMPTS = 3;

/**
 * Fill a schema's shape from supplied values, then defaults, then prompting.
 *
 * Interactivity is checked **once, before any prompting**: if nobody can be asked, every
 * missing field is collected into a single error rather than prompting for one and then
 * discovering the second is unanswerable.
 */
export async function resolveArgs(schema: z.ZodType, opts: ResolveOptions): Promise<unknown> {
  const root = toJsonSchema(schema);
  let current: Record<string, unknown> = asRecord(opts.supplied);

  for (let attempt = 0; ; attempt++) {
    const parsed = schema.safeParse(current);
    if (parsed.success) return parsed.data;

    const missing = missingFields(parsed.error);
    const blocking = missing.length > 0 ? missing : invalidFields(parsed.error);

    if (!opts.interactive) throw new MissingArgsError(blocking);
    if (attempt >= MAX_ATTEMPTS - 1) {
      throw new Error(
        `could not resolve args after ${MAX_ATTEMPTS} attempts: ${message(parsed.error)}`
      );
    }

    for (const field of blocking) {
      const fieldSchema = propertySchema(root, field);
      const kind = isComplex(fieldSchema) ? "json" : "scalar";
      const answer = await opts.ask({
        path: field,
        kind,
        hint: shapeHint(fieldSchema),
        jsonSchema: fieldSchema,
      });
      // An empty answer is *no answer*, not a value. The prompt battery resolves an empty
      // line to its default (""), and `Number("")` is 0 — so coercing here would silently
      // turn a bare Enter on a required number into a real zero. Leave the field missing
      // and let the loop re-ask.
      if (answer.trim() === "") continue;
      current = { ...current, [field]: coerce(answer, fieldSchema, kind) };
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? { ...(value as object) } : {};
}

/** Top-level field names that are absent, as opposed to present-but-wrong. */
function missingFields(error: z.ZodError): string[] {
  const names = error.issues
    .filter(
      (i) => i.code === "invalid_type" && (i as { received?: string }).received === "undefined"
    )
    .map((i) => String(i.path[0] ?? ""))
    .filter((n) => n !== "");
  return [...new Set(names)];
}

function invalidFields(error: z.ZodError): string[] {
  const names = error.issues.map((i) => String(i.path[0] ?? "")).filter((n) => n !== "");
  return [...new Set(names)];
}

function message(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`).join("; ");
}

function propertySchema(root: JsonSchema, field: string): JsonSchema {
  const properties = root.properties;
  if (typeof properties === "object" && properties !== null) {
    const found = (properties as Record<string, unknown>)[field];
    if (typeof found === "object" && found !== null) return found as JsonSchema;
  }
  return {};
}

function isComplex(schema: JsonSchema): boolean {
  return schema.type === "object" || schema.type === "array";
}

/**
 * Turn a prompt answer into a value the schema can accept. Scalars coerce from their
 * string form; complex fields parse as JSON, or are read from a file path when the answer
 * does not start with `{` or `[` — pointing at a file beats pasting a large config.
 */
function coerce(answer: string, schema: JsonSchema, kind: "scalar" | "json"): unknown {
  const text = answer.trim();
  if (kind === "json") {
    const source = text.startsWith("{") || text.startsWith("[") ? text : readFileArg(text);
    try {
      return JSON.parse(source);
    } catch {
      return text; // let the schema reject it, so the error names the field
    }
  }
  if (schema.type === "number" || schema.type === "integer") {
    const n = Number(text);
    return Number.isNaN(n) ? text : n;
  }
  if (schema.type === "boolean") {
    if (/^(true|yes|y|1)$/i.test(text)) return true;
    if (/^(false|no|n|0)$/i.test(text)) return false;
    return text;
  }
  return text;
}

function readFileArg(pathish: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(pathish.replace(/^@/, ""), "utf8");
}
```

If the lint rule forbids `require`, hoist `import { readFileSync } from "node:fs";` to the top of the file instead and drop `readFileArg`'s inline import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/args-resolution.test.ts`
Expected: PASS (7 tests).

If the `missingFields` filter returns nothing, zod v4 may report a missing key with a different `code` than `invalid_type`. Log `parsed.error.issues` once and match on what it actually emits — the _behavior_ the tests assert is what matters, not the specific code string.

- [ ] **Step 5: Add `.args()` to the om builder**

In `types.ts`:

```ts
export interface OmBuilder {
  describe(description: OmDescription): OmBuilder;
  args<S extends ZodTypeLike>(schema: S): OmBuilderArgs<S>;
  run(body: (ctx: OmContext) => Awaitable<void>): Promise<void>;
}

/** After `.args(schema)`: `.run`'s body receives the resolved, typed args. */
export interface OmBuilderArgs<S extends ZodTypeLike> {
  describe(description: OmDescription): OmBuilderArgs<S>;
  run(body: (ctx: OmContext, args: InferSchema<S>) => Awaitable<void>): Promise<void>;
}
```

In `om.ts`, add to `Builder`:

```ts
  args<S extends ZodTypeLike>(schema: S): OmBuilderArgs<S> {
    return new ArgsOmBuilder<S>(this.name, this.site, schema);
  }
```

And the args-flavored builder, which resolves **inside** the run:

```ts
class ArgsOmBuilder<S extends ZodTypeLike> implements OmBuilderArgs<S> {
  private description: OmDescription | undefined;

  constructor(
    private readonly name: string,
    private readonly site: string | undefined,
    private readonly schema: S
  ) {}

  describe(description: OmDescription): OmBuilderArgs<S> {
    this.description = description;
    return this;
  }

  run(body: (ctx: OmContext, args: InferSchema<S>) => Awaitable<void>): Promise<void> {
    void this.description; // carried for `omkit ls` and Spec B; not read by the runtime yet
    // Resolution happens inside the run, not before it: prompting is async, and the run
    // must already exist for the prompt and its answer to land on the timeline.
    return launch(this.name, this.site, async (ctx) => {
      const args = (await resolveArgs(this.schema, {
        supplied: parseSuppliedArgs(),
        interactive: isInteractive(),
        ask: (spec) => askForArg(spec),
      })) as InferSchema<S>;
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

/** Supervised, or a real terminal. Otherwise nobody can answer a prompt. */
function isInteractive(): boolean {
  return activeSupervisor() !== undefined || process.stdin.isTTY === true;
}

async function askForArg(spec: AskSpec): Promise<string> {
  if (spec.kind === "json") {
    return prompt({
      kind: "multiline",
      message: `${spec.path} — JSON`,
      hint: spec.hint === "see schema" ? JSON.stringify(spec.jsonSchema) : spec.hint,
      until: "json",
      timeoutMs: 120_000,
    }).result;
  }
  return prompt({ message: `${spec.path} (${spec.hint})`, timeoutMs: 120_000 }).result;
}
```

Import `resolveArgs`, `AskSpec` from `./args.ts`, `prompt` from `../actions/prompt.ts`, and `activeSupervisor` from `./interaction.ts`.

> **Import-cycle check:** `core/om.ts` importing `actions/prompt.ts`, which imports `core/action.ts`, is a new `core → actions` edge. If the build or lint reports a cycle, invert it: have `om.ts` accept an injected asker defaulting to a lazy `await import("../actions/prompt.ts")` inside `askForArg`. The dynamic import breaks the static cycle without changing behavior.

- [ ] **Step 6: Attach resolved args to the root node**

In `ExecutionTree.runRoot` (line 247), the root currently launches with no args:

```ts
const rootPromise = currentNode.run(this.root, () => this.root.run(body, []));
```

Resolution happens inside the body, so the tree cannot know the values up front. Add a setter the resolver calls, and have `nodeView` read it so `main.log`'s `# args:` header shows what the run was given:

```ts
  /** Record the run's resolved args, so the root's log header reports them. */
  setRootArgs(args: unknown): void {
    this.rootArgs = [args];
  }
```

with `private rootArgs: readonly unknown[] = [];`, and in `nodeView`, use `node.parentId === null ? this.rootArgs : node.args` for the `args` field.

Call it from `ArgsOmBuilder.run` right after resolution:

```ts
ExecutionTree.current?.setRootArgs(args);
```

- [ ] **Step 7: Write the integration test**

```ts
// append to packages/omkit/tests/unit/args-resolution.test.ts
import { afterEach } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  delete process.env.OMKIT_ARGS;
  process.exitCode = 0;
});

describe("om().args()", () => {
  test("resolves from OMKIT_ARGS and passes typed args to the body", async () => {
    process.env.OMKIT_ARGS = JSON.stringify({ rows: 500 });
    let seen = 0;
    await om("args-supplied")
      .args(z.object({ rows: z.number(), truncate: z.boolean().default(false) }))
      .run(async (_ctx, args) => {
        seen = args.rows;
        expect(args.truncate).toBe(false);
      });
    expect(seen).toBe(500);
  });

  test("resolved args reach the root node's log header", async () => {
    process.env.OMKIT_ARGS = JSON.stringify({ rows: 7 });
    await om("args-logged")
      .args(z.object({ rows: z.number() }))
      .run(async () => {});

    const view = ExecutionTree.last!.runViewForTest();
    expect(view.root.args).toEqual([{ rows: 7 }]);
  });

  test("an om without .args() is unaffected", async () => {
    let ran = false;
    await om("args-none").run(async (ctx) => {
      expect(ctx.artifactsFolder).toContain("args-none");
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
```

- [ ] **Step 8: Run it, then the full suite**

```bash
npx vitest run packages/omkit/tests/unit/args-resolution.test.ts
npm run typecheck --workspace packages/omkit
npx vitest run
```

Expected: PASS throughout.

- [ ] **Step 9: Update the README and commit**

Add `.args()` to the README's API section (required by `constraint-readme-sync.tskb.tsx`), showing the resolution order — supplied, defaults, prompt, fail — and add an `### Added` line to the `0.5.0` changelog entry for `om(name).args(schema)`.

```bash
git add packages/omkit/src/core/args.ts packages/omkit/src/core/om.ts packages/omkit/src/core/types.ts packages/omkit/src/core/ExecutionTree.ts packages/omkit/README.md packages/omkit/CHANGELOG.md packages/omkit/tests/unit/args-resolution.test.ts
git commit -m "feat(omkit): declare om args and resolve them at run start"
```

---

### Task 11: Document the primitives in tskb

The repo's own knowledge graph must describe the new surface, or the map goes stale.

**Files:**

- Modify: `docs/src/omkit/main.tskb.tsx` (the essential doc — new public surface)
- Create: `docs/src/omkit/args.tskb.tsx`
- Create: `docs/src/omkit/artifacts.tskb.tsx`

**Interfaces:**

- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Read the authoring rules**

Load the `tskb-update` and `tskb-update-syntax` skills. Do not hand-write `.tskb.tsx` from memory — the registry primitives and the `boundary` prop have specific rules, and `.claude/skills/tskb*/SKILL.md` is generated, so it must not be edited directly.

- [ ] **Step 2: Check what is already registered**

```bash
npx --no -- tskb registry "omkit" --plain
npx --no -- tskb context "omkit.core.om" --depth=2 --plain
```

Reuse existing Terms and Module nodes rather than declaring duplicates.

- [ ] **Step 3: Write the docs**

`args.tskb.tsx` answers "How does an om declare and receive arguments?" — cover the resolution order, why resolution happens inside the run, and the non-interactive guard. `artifacts.tskb.tsx` answers "How does a run label the files it produces?" — cover `ctx.artifact` versus `ctx.snapshot`, and where registrations land.

Reference registered nodes with `{NodeRef}` rather than bare `<code>` strings for paths and functions.

- [ ] **Step 4: Rebuild the graph and verify**

```bash
npm run build:docs
npx --no -- tskb search "artifact" --plain
npx --no -- tskb search "args" --plain
```

Expected: the new docs appear.

- [ ] **Step 5: Commit**

```bash
git add docs/src/omkit .claude/skills
git commit -m "docs(omkit): document args resolution and curated artifacts"
```

---

## Definition of done

- [ ] `npx vitest run` passes, including e2e.
- [ ] `npm run typecheck --workspace packages/omkit` is clean.
- [ ] `npm run lint` is clean.
- [ ] `npm run build --workspace packages/omkit` succeeds.
- [ ] `grep -rn --include=*.ts -E "\bom\(\s*[\"'\`][^\"'\`]_[\"'\`]\s_," packages om`returns nothing outside`docs/superpowers/`.
- [ ] `packages/omkit/README.md` shows only the builder form.
- [ ] `packages/omkit/package.json` is at `0.5.0` with a matching CHANGELOG entry.
- [ ] A run's folder name is unchanged from before the migration (Task 6's parity test).
