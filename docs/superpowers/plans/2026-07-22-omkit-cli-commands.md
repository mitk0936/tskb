# omkit CLI Commands + bin (Plan B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `omkit` command-line binary — `init`, `ls`, `check`, and `run` — as thin adapters over the Plan B1 client SDK, wired through a lazy-loading `bin` entry and a packaging setup that keeps the CLI out of the runtime import graph.

**Architecture:** Each command in `packages/omkit/src/cli/commands/` is a pure-ish function that takes its inputs and returns text / an exit code (so it is unit-testable without spawning a process or capturing global stdout). `run` is the _bare_ path — it spawns the om with inherited stdio and no supervision (native `readline` prompts, the child owns the terminal), distinct from the SDK's supervised `runOm`; a new `spawnBare` in `runner.ts` provides it. `cli/index.ts` is the `#!/usr/bin/env node` entry: it parses argv with `node:util`'s `parseArgs` and `await import()`s exactly one command module, so the heavy chunks never load for the wrong command. `package.json` gains a `bin` and an `exports` map that never reaches `cli/`.

**Tech Stack:** TypeScript (NodeNext ESM, `.ts` imports), `node:util` `parseArgs`, `node:child_process`, Vitest. Consumes Plan B1's `createOmkitClient`, `Registry`, `Diagnostic`, and `runner.ts`.

## Global Constraints

- **Node ≥ 20.11**, **ESM only**; `.ts` extension imports.
- **`cli/` stays out of the runtime import graph** — `package.json` `exports` expose only `.` and `./actions`; the `bin` is the sole entry into `cli/`.
- **Commands are testable as functions** — they return strings / exit codes; only `cli/index.ts` touches `process.stdout` / `process.exit`.
- **`omkit run` is the bare path** — inherited stdio, no `OMKIT_SUPERVISED`, native readline prompts. Do not route it through the supervised `runOm`.
- **Tests are Vitest, colocated** under `packages/omkit/tests/unit/`; reuse the `tests/fixtures/discovery` and `tests/fixtures/run` fixtures from Plan B1.
- **No new dependencies** — everything is Node built-ins plus the Plan B1 SDK.

---

### Task 1: `ls` command (`cli/commands/ls.ts`)

**Files:**

- Create: `packages/omkit/src/cli/commands/ls.ts`
- Test: `packages/omkit/tests/unit/ls.test.ts`

**Interfaces:**

- Consumes: `Registry` from `../client/registry.ts`.
- Produces: `export function formatRegistry(registry: Registry, opts?: { json?: boolean }): string` — renders discovered oms (runnable) and actions (inspectable) as plain text, or `JSON.stringify` when `json`. Warnings render to a trailing section in plain mode.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/ls.test.ts
import { describe, expect, test } from "vitest";
import { formatRegistry } from "../../src/cli/commands/ls.ts";
import type { Registry } from "../../src/cli/client/registry.ts";

const registry: Registry = {
  oms: [{ name: "dev", file: "/p/oms/dev.ts", line: 3 }],
  actions: [
    {
      name: "build",
      file: "/p/actions/build.ts",
      exportName: "build",
      publishesCapability: true,
      events: true,
    },
  ],
  warnings: ["broken.ts:4 Type 'string' is not assignable to type 'number'."],
};

describe("formatRegistry", () => {
  test("plain text lists oms, actions, and warnings", () => {
    const out = formatRegistry(registry);
    expect(out).toContain("dev");
    expect(out).toContain("build");
    expect(out).toContain("broken.ts:4");
  });

  test("json mode emits parseable JSON", () => {
    const out = formatRegistry(registry, { json: true });
    expect(JSON.parse(out).oms[0].name).toBe("dev");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/ls.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/commands/ls.ts'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/omkit/src/cli/commands/ls.ts
import path from "node:path";
import type { Registry } from "../client/registry.ts";

/** Render a {@link Registry} for the terminal (plain text) or as JSON. */
export function formatRegistry(registry: Registry, opts: { json?: boolean } = {}): string {
  if (opts.json) return JSON.stringify(registry, null, 2);

  const lines: string[] = [];
  lines.push(`oms (${registry.oms.length})`);
  for (const om of registry.oms) {
    lines.push(`  ${om.name}  ${path.basename(om.file)}:${om.line}`);
  }
  lines.push("");
  lines.push(`actions (${registry.actions.length})`);
  for (const a of registry.actions) {
    const tags = [a.publishesCapability ? "ref" : "", a.events ? "events" : ""].filter(Boolean);
    const suffix = tags.length ? `  [${tags.join(", ")}]` : "";
    lines.push(`  ${a.name}  ${path.basename(a.file)}${suffix}`);
  }
  if (registry.warnings.length) {
    lines.push("");
    lines.push(`warnings (${registry.warnings.length})`);
    for (const w of registry.warnings) lines.push(`  ${w}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/ls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/cli/commands/ls.ts packages/omkit/tests/unit/ls.test.ts
git commit -m "Add omkit ls command formatter"
```

---

### Task 2: `check` command (`cli/commands/check.ts`)

**Files:**

- Create: `packages/omkit/src/cli/commands/check.ts`
- Test: `packages/omkit/tests/unit/check-command.test.ts`

**Interfaces:**

- Consumes: `Diagnostic` from `../client/types.ts`.
- Produces: `export function formatDiagnostics(diagnostics: Diagnostic[]): { text: string; code: number }` — returns human output plus a shell exit code (`0` when clean, `1` when any diagnostic).

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/check-command.test.ts
import { describe, expect, test } from "vitest";
import { formatDiagnostics } from "../../src/cli/commands/check.ts";

describe("formatDiagnostics", () => {
  test("clean project → code 0 and a success line", () => {
    const { text, code } = formatDiagnostics([]);
    expect(code).toBe(0);
    expect(text.toLowerCase()).toContain("no type errors");
  });

  test("errors → code 1 and each diagnostic listed", () => {
    const { text, code } = formatDiagnostics([
      {
        file: "/p/actions/broken.ts",
        line: 4,
        message: "Type 'string' is not assignable to type 'number'.",
      },
    ]);
    expect(code).toBe(1);
    expect(text).toContain("broken.ts:4");
    expect(text).toContain("not assignable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/check-command.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/omkit/src/cli/commands/check.ts
import path from "node:path";
import type { Diagnostic } from "../client/types.ts";

/** Format typecheck diagnostics into terminal text plus a process exit code. */
export function formatDiagnostics(diagnostics: Diagnostic[]): { text: string; code: number } {
  if (diagnostics.length === 0) {
    return { text: "no type errors", code: 0 };
  }
  const lines = diagnostics.map((d) => `${path.basename(d.file)}:${d.line}  ${d.message}`);
  lines.push("");
  lines.push(`${diagnostics.length} error${diagnostics.length === 1 ? "" : "s"}`);
  return { text: lines.join("\n"), code: 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/check-command.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/cli/commands/check.ts packages/omkit/tests/unit/check-command.test.ts
git commit -m "Add omkit check command formatter"
```

---

### Task 3: bare spawn + `run` command (`cli/client/runner.ts`, `cli/commands/run.ts`)

**Files:**

- Modify: `packages/omkit/src/cli/client/runner.ts` (add `spawnBare`)
- Create: `packages/omkit/src/cli/commands/run.ts`
- Test: `packages/omkit/tests/unit/run-command.test.ts`

**Interfaces:**

- Consumes: `discover` from `../client/discovery.ts`; `spawnBare` from `../client/runner.ts`; `fork` from `node:child_process`.
- Produces:
  - `runner.ts` → `export function spawnBare(omFile: string, opts?: { cwd?: string }): Promise<number>` — forks `omFile` with `execArgv: ["--import", <tsx>]`, **inherited stdio**, **no** `OMKIT_SUPERVISED`; resolves the child's exit code.
  - `run.ts` → `export function resolveOm(arg: string, registry: { oms: { name: string; file: string }[] }, cwd: string): string | undefined` — maps a CLI argument (a file path or an om name) to an absolute file, or `undefined` if unresolved.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/run-command.test.ts
import { describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOm } from "../../src/cli/commands/run.ts";
import { spawnBare } from "../../src/cli/client/runner.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const runDir = path.join(here, "../fixtures/run");

describe("resolveOm", () => {
  const registry = { oms: [{ name: "hello", file: path.join(runDir, "hello.ts") }] };

  test("resolves an existing file path argument", () => {
    const rel = path.join("..", "fixtures", "run", "hello.ts");
    expect(resolveOm(rel, registry, here)).toBe(path.resolve(here, rel));
  });

  test("resolves a bare om name against the registry", () => {
    expect(resolveOm("hello", registry, here)).toBe(path.join(runDir, "hello.ts"));
  });

  test("returns undefined for an unknown target", () => {
    expect(resolveOm("nope", registry, here)).toBeUndefined();
  });
});

describe("spawnBare", () => {
  test("runs an om unsupervised to completion and returns exit code 0", async () => {
    // hello.ts prompts with a 5s timeout; unsupervised + non-tty stdin → it falls back to
    // the default and exits cleanly.
    const code = await spawnBare(path.join(runDir, "hello.ts"), { cwd: runDir });
    expect(code).toBe(0);
  }, 20_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/run-command.test.ts`
Expected: FAIL — `resolveOm` / `spawnBare` not found.

- [ ] **Step 3: Add `spawnBare` to `runner.ts`**

Add to `packages/omkit/src/cli/client/runner.ts` (after `runOm`, reusing the existing `tsxLoader` constant):

```ts
/**
 * Spawn `omFile` **bare** — inherited stdio, no supervision. The child owns the terminal, so
 * its LiveRenderer, summary, and native `readline` prompts all work. Resolves the exit code.
 */
export function spawnBare(omFile: string, opts: { cwd?: string } = {}): Promise<number> {
  const child = fork(omFile, [], {
    execArgv: ["--import", tsxLoader],
    cwd: opts.cwd ?? path.dirname(omFile),
    stdio: "inherit",
  });
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
}
```

- [ ] **Step 4: Write `run.ts`**

```ts
// packages/omkit/src/cli/commands/run.ts
import fs from "node:fs";
import path from "node:path";

/**
 * Resolve a `run` argument to an absolute om file: an existing file path (relative to `cwd`)
 * wins; otherwise match a discovered om by name. Returns undefined when nothing matches.
 */
export function resolveOm(
  arg: string,
  registry: { oms: { name: string; file: string }[] },
  cwd: string
): string | undefined {
  const asPath = path.resolve(cwd, arg);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) return asPath;
  return registry.oms.find((o) => o.name === arg)?.file;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/run-command.test.ts`
Expected: PASS (4 tests). If `spawnBare` hangs, confirm `hello.ts`'s prompt `timeoutMs` fires under a non-tty stdin.

- [ ] **Step 6: Commit**

```bash
git add packages/omkit/src/cli/client/runner.ts packages/omkit/src/cli/commands/run.ts packages/omkit/tests/unit/run-command.test.ts
git commit -m "Add bare om spawn and the run command's om resolver"
```

---

### Task 4: `init` scaffolding (`cli/commands/init.ts`)

**Files:**

- Create: `packages/omkit/src/cli/commands/init.ts`
- Test: `packages/omkit/tests/unit/init.test.ts`

**Interfaces:**

- Consumes: `node:fs`, `node:path`.
- Produces: `export function scaffold(dir: string): { created: string[]; skipped: string[] }` — writes `tsconfig.omkit.json`, `oms/dev.ts`, `actions/hello.ts` under `dir`; never overwrites an existing file (records it in `skipped`). Pure filesystem, no prompts (the `bin` handles interactive confirmation later).

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/init.test.ts
import { afterEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../../src/cli/commands/init.ts";

let dir: string;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe("scaffold", () => {
  test("creates the config, oms, and actions with runnable samples", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-init-"));
    const { created } = scaffold(dir);

    expect(fs.existsSync(path.join(dir, "tsconfig.omkit.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "oms/dev.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "actions/hello.ts"))).toBe(true);
    expect(created.length).toBe(3);

    const dev = fs.readFileSync(path.join(dir, "oms/dev.ts"), "utf8");
    expect(dev).toContain('from "omkit"');
    expect(dev).toContain("om(");
  });

  test("is idempotent — a second run skips existing files", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-init-"));
    scaffold(dir);
    const { created, skipped } = scaffold(dir);
    expect(created).toEqual([]);
    expect(skipped.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/init.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/omkit/src/cli/commands/init.ts
import fs from "node:fs";
import path from "node:path";

const TSCONFIG = `{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["oms/**/*.ts", "actions/**/*.ts"]
}
`;

const DEV_OM = `import { om } from "omkit";
import { command, healthcheck } from "omkit/actions";

om("dev", async () => {
  command("npm run dev", { cwd: "api" })().tag("api");
  const up = await healthcheck({ url: "http://localhost:3000" }).result;
  if (!up.ok) return;
  console.log("stack is up — press Ctrl+C to stop");
});
`;

const HELLO_ACTION = `import { action } from "omkit";

export const hello = action("hello")
  .ref<string>()
  .run(async ({ attach }) => {
    attach("world");
  });
`;

const FILES: ReadonlyArray<{ rel: string; body: string }> = [
  { rel: "tsconfig.omkit.json", body: TSCONFIG },
  { rel: "oms/dev.ts", body: DEV_OM },
  { rel: "actions/hello.ts", body: HELLO_ACTION },
];

/** Write the starter project into `dir`, never overwriting existing files. */
export function scaffold(dir: string): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { rel, body } of FILES) {
    const target = path.join(dir, rel);
    if (fs.existsSync(target)) {
      skipped.push(rel);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    created.push(rel);
  }
  return { created, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/init.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/cli/commands/init.ts packages/omkit/tests/unit/init.test.ts
git commit -m "Add omkit init scaffolding"
```

---

### Task 5: The bin + packaging (`cli/index.ts`, `package.json`)

**Files:**

- Create: `packages/omkit/src/cli/index.ts`
- Modify: `packages/omkit/package.json` (add `bin`, extend `exports`)
- Test: `packages/omkit/tests/unit/cli-args.test.ts`

**Interfaces:**

- Consumes: `parseArgs` from `node:util`; the command modules (lazy `import()`); `createOmkitClient` from `../cli/client/index.ts`.
- Produces:
  - `cli/index.ts` → `export function parseCli(argv: string[]): { command: string; target?: string; json: boolean; tsconfig: string }` (testable arg parsing) plus a `main()` that routes to the lazily-imported command and owns `process.stdout` / `process.exitCode`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/cli-args.test.ts
import { describe, expect, test } from "vitest";
import { parseCli } from "../../src/cli/index.ts";

describe("parseCli", () => {
  test("parses a command, target, and flags", () => {
    const p = parseCli(["run", "oms/dev.ts", "--json"]);
    expect(p.command).toBe("run");
    expect(p.target).toBe("oms/dev.ts");
    expect(p.json).toBe(true);
  });

  test("defaults command to ui and tsconfig to tsconfig.omkit.json", () => {
    const p = parseCli([]);
    expect(p.command).toBe("ui");
    expect(p.tsconfig).toBe("tsconfig.omkit.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/cli-args.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `cli/index.ts`**

```ts
#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { createOmkitClient } from "./client/index.ts";

export interface Cli {
  command: string;
  target?: string;
  json: boolean;
  tsconfig: string;
}

/** Parse argv (without node/script) into a command, an optional target, and flags. */
export function parseCli(argv: string[]): Cli {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
      tsconfig: { type: "string", default: "tsconfig.omkit.json" },
    },
    allowPositionals: true,
  });
  return {
    command: positionals[0] ?? "ui",
    target: positionals[1],
    json: Boolean(values.json),
    tsconfig: values.tsconfig as string,
  };
}

/** The bin entry: route to a lazily-imported command; owns stdout and the exit code. */
async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const client = createOmkitClient({ tsconfig: cli.tsconfig });

  if (cli.command === "init") {
    const { scaffold } = await import("./commands/init.ts");
    const { created, skipped } = scaffold(process.cwd());
    for (const f of created) console.log(`created ${f}`);
    for (const f of skipped) console.log(`exists, skipped ${f}`);
    return;
  }
  if (cli.command === "ls") {
    const { formatRegistry } = await import("./commands/ls.ts");
    console.log(formatRegistry(await client.discover(), { json: cli.json }));
    return;
  }
  if (cli.command === "check") {
    const { formatDiagnostics } = await import("./commands/check.ts");
    const { text, code } = formatDiagnostics(await client.check());
    console.log(text);
    process.exitCode = code;
    return;
  }
  if (cli.command === "run") {
    if (!cli.target) {
      console.error("usage: omkit run <om file | om name>");
      process.exitCode = 1;
      return;
    }
    const { resolveOm } = await import("./commands/run.ts");
    const { spawnBare } = await import("./client/runner.ts");
    const registry = await client.discover();
    const omFile = resolveOm(cli.target, registry, process.cwd());
    if (!omFile) {
      console.error(
        `no om matches "${cli.target}". Known oms: ${registry.oms.map((o) => o.name).join(", ")}`
      );
      process.exitCode = 1;
      return;
    }
    process.on("SIGINT", () => {}); // let the child tear down; don't die first
    process.exitCode = await spawnBare(omFile, { cwd: path.dirname(omFile) });
    return;
  }
  // "ui" (and bare \`omkit\`) is delivered in Plan C.
  console.error(`the "${cli.command}" command is not available yet`);
  process.exitCode = 1;
}

// Run main() only when executed as the bin, not when imported by tests.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/cli-args.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire `package.json`**

Edit `packages/omkit/package.json`: add a `bin` and extend `exports`. The runtime entries (`.`, `./actions`) must not reference `cli/`.

```jsonc
{
  "bin": { "omkit": "./dist/cli/index.js" },
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./actions": { "types": "./dist/actions/index.d.ts", "import": "./dist/actions/index.js" },
  },
}
```

(The `bin` points at the compiled output; the CLI ships built. `exports` stays limited to the runtime surface, so `import { om } from "omkit"` never pulls `cli/`.)

- [ ] **Step 6: Verify the bin builds and runs end-to-end**

Run: `npm run build --workspace omkit`
Expected: exit 0; `packages/omkit/dist/cli/index.js` exists.

Run (smoke, against the discovery fixture):
`node packages/omkit/dist/cli/index.js ls --tsconfig packages/omkit/tests/fixtures/discovery/tsconfig.omkit.json`
Expected: prints an `oms (2)` / `actions (3)` listing.

- [ ] **Step 7: Commit**

```bash
git add packages/omkit/src/cli/index.ts packages/omkit/package.json packages/omkit/tests/unit/cli-args.test.ts
git commit -m "Add omkit bin: parseArgs router with lazy command imports and packaging"
```

---

### Task 6: Typecheck, lint, and full-suite gate

**Files:** verification only.

- [ ] **Step 1: Typecheck** — Run: `npm run typecheck --workspace omkit` — Expected: exit 0.
- [ ] **Step 2: Lint** — Run: `npm run lint --workspace omkit` — Expected: 0 errors.
- [ ] **Step 3: Full suite** — Run: `npx vitest run packages/omkit` — Expected: PASS (Plan A + B1 + the new ls (2), check (2), run (4), init (2), cli-args (2) tests).
- [ ] **Step 4: Commit any fixups** (skip if clean)

```bash
git add -A packages/omkit
git commit -m "Typecheck/lint fixups for the omkit CLI commands"
```

---

## Plan B2 — Definition of Done

- `omkit init` scaffolds a runnable starter project (idempotent).
- `omkit ls` lists discovered oms and actions (plain + `--json`).
- `omkit check` prints diagnostics and exits non-zero on type errors.
- `omkit run <file|name>` resolves and spawns an om bare (inherited stdio, native prompts), forwarding Ctrl+C and propagating the exit code.
- The `bin` lazily imports each command; `exports` keeps `cli/` out of the runtime graph.
- `typecheck`, `lint`, and the full suite are green.
- `ui` remains a stub until Plan C.
