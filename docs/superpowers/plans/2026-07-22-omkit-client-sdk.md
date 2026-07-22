# omkit Client SDK (Plan B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless, UI-free client SDK that discovers oms/actions from a `tsconfig.omkit.json`, spawns an om as a supervised child process, and exposes its live logs, prompts, verdict, and cancellation as a `RunSession` — the engine every frontend (the CLI commands, the Ink app, a future MCP server) drives.

**Architecture:** Four modules under `packages/omkit/src/cli/client/`, plus shared types. `discovery.ts` uses the TypeScript Compiler API (mirroring `packages/tskb/src/core/typescript/program.ts`) to statically find `om(...)` calls (runnable) and exported `action(...)` builders (inspectable), degrading gracefully on type errors. `channel.ts` is the supervisor half of the Plan A protocol — it wraps an abstract transport (`send`/`onMessage`/`onClose`) and turns child messages into a `RunSession`. `runner.ts` `fork`s the om file through the `tsx` loader with `OMKIT_SUPERVISED=1`, wiring the real `ChildProcess` into `channel.ts`. `index.ts` composes them into `createOmkitClient(config)`. The transport abstraction lets `channel.ts` be unit-tested with a fake and `runner.ts` be integration-tested with a real fork.

**Tech Stack:** TypeScript (NodeNext ESM, `.ts` imports), `typescript` (Compiler API), Node `child_process.fork`, `tsx` (runtime TS loader for children), Vitest.

## Global Constraints

- **Node ≥ 20.11**, **ESM only**. Consumes Plan A's `core/interaction.ts` exports (`ChildMessage`, `SupervisorMessage`, `PromptSpec`, `AnswerMessage`).
- **Import paths carry the explicit `.ts` extension** (NodeNext).
- **`cli/client/` imports nothing from `cli/commands/` or `cli/ui/`** — it is UI-free and transport-agnostic (structural rule from the spec §3).
- **Tests are Vitest, colocated** under `packages/omkit/tests/unit/` (unit) and use fixtures under `packages/omkit/tests/fixtures/`.
- **Discovery degrades gracefully** — type errors in a scanned file become `warnings`, never thrown exceptions; whatever parsed is still returned.
- **New dependency:** `tsx` (added to `packages/omkit` `dependencies` in Task 4) — the loader that runs `.ts` om children. `typescript` is already a dependency.

---

### Task 1: Shared SDK types (`cli/client/registry.ts`, `cli/client/types.ts`)

**Files:**

- Create: `packages/omkit/src/cli/client/registry.ts`
- Create: `packages/omkit/src/cli/client/types.ts`

**Interfaces:**

- Consumes: `LogEntry` from `../../foundation/LogEntry.ts`; `PromptSpec` from `../../core/interaction.ts`.
- Produces (relied on by every later task):
  - `DiscoveredOm { name, file, line }`, `DiscoveredAction { name, file, exportName, publishesCapability, events }`, `Registry { oms, actions, warnings }`.
  - `Verdict { ok, folder }`, `Diagnostic { file, line, message }`, `RunOptions { cwd? }`, `PromptRequest { id, spec }`.
  - `RunSession` and `OmkitClient` (shapes below).

- [ ] **Step 1: Write the type files**

```ts
// packages/omkit/src/cli/client/registry.ts

/** A runnable om discovered from a top-level `om("name", …)` call. */
export interface DiscoveredOm {
  /** The om's name — its first string argument. */
  readonly name: string;
  /** Absolute path of the file that defines it. */
  readonly file: string;
  /** 1-based line of the `om(...)` call (informational). */
  readonly line: number;
}

/** An inspectable action discovered from an exported `action("name")…` builder. */
export interface DiscoveredAction {
  /** The action's name — the first string argument to `action(...)`. */
  readonly name: string;
  /** Absolute path of the file that defines it. */
  readonly file: string;
  /** The exported binding name (`export const <exportName> = action(...)`). */
  readonly exportName: string;
  /** True when the builder chain includes `.ref<…>()` (publishes a capability). */
  readonly publishesCapability: boolean;
  /** True when the builder chain includes `.emits<…>()`. */
  readonly events: boolean;
}

/** The result of scanning a project: runnable oms, inspectable actions, and soft warnings. */
export interface Registry {
  readonly oms: DiscoveredOm[];
  readonly actions: DiscoveredAction[];
  /** Non-fatal diagnostics (type errors, unresolved config) — discovery never throws for these. */
  readonly warnings: string[];
}
```

```ts
// packages/omkit/src/cli/client/types.ts
import type { LogEntry } from "../../foundation/LogEntry.ts";
import type { PromptSpec } from "../../core/interaction.ts";
import type { Registry } from "./registry.ts";

/** A run's terminal verdict, resolved when the child settles. */
export interface Verdict {
  readonly ok: boolean;
  /** The absolute run-folder path the child reported. */
  readonly folder: string;
}

/** A typecheck diagnostic from `check()`. */
export interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

/** Options for launching a run. */
export interface RunOptions {
  /** Working directory for the child process (defaults to the om file's directory). */
  readonly cwd?: string;
}

/** A prompt the running om is waiting on — surfaced to the frontend, answered via `answer`. */
export interface PromptRequest {
  readonly id: string;
  readonly spec: PromptSpec;
}

/** Handler map for {@link RunSession.on}. */
export interface RunEvents {
  log: (entry: LogEntry) => void;
  prompt: (request: PromptRequest) => void;
  settled: (verdict: Verdict) => void;
}

/** A live handle to one supervised run. */
export interface RunSession {
  on<K extends keyof RunEvents>(event: K, handler: RunEvents[K]): void;
  /** Answer a pending prompt (`via` defaults to "input"). */
  answer(id: string, value: string, via?: string): void;
  /** Request graceful teardown of the run. */
  cancel(): void;
  /** Resolves when the run settles (or the child exits without settling → ok:false). */
  readonly result: Promise<Verdict>;
}

/** The headless engine behind every omkit frontend. */
export interface OmkitClient {
  /** Statically scan the project's `tsconfig.omkit.json` for oms and actions. */
  discover(): Promise<Registry>;
  /** Spawn an om file as a supervised child and return its live session. */
  run(omFile: string, opts?: RunOptions): RunSession;
  /** Typecheck the project (`tsc --noEmit`) and return diagnostics. */
  check(): Promise<Diagnostic[]>;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck --workspace omkit`
Expected: exit 0 (pure type declarations; no runtime).

- [ ] **Step 3: Commit**

```bash
git add packages/omkit/src/cli/client/registry.ts packages/omkit/src/cli/client/types.ts
git commit -m "Add omkit client SDK shared types"
```

---

### Task 2: Static discovery via the TS Compiler API (`cli/client/discovery.ts`)

**Files:**

- Create: `packages/omkit/src/cli/client/discovery.ts`
- Create fixtures:
  - `packages/omkit/tests/fixtures/discovery/tsconfig.omkit.json`
  - `packages/omkit/tests/fixtures/discovery/oms/dev.ts`
  - `packages/omkit/tests/fixtures/discovery/actions/build.ts`
  - `packages/omkit/tests/fixtures/discovery/actions/broken.ts`
- Test: `packages/omkit/tests/unit/discovery.test.ts`

**Interfaces:**

- Consumes: `typescript` (default import `ts`); `Registry`, `DiscoveredOm`, `DiscoveredAction` from `./registry.ts`.
- Produces: `export function discover(tsconfigPath: string): Registry` — synchronous static scan; matches `import … from "omkit"` bindings, finds `om(...)`/`step(...)` calls (→ oms) and exported `action(...)` chains (→ actions with `.ref`/`.emits` detection); collects type diagnostics into `warnings` without throwing.

- [ ] **Step 1: Write the fixtures**

```jsonc
// packages/omkit/tests/fixtures/discovery/tsconfig.omkit.json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
  },
  "include": ["oms/**/*.ts", "actions/**/*.ts"],
}
```

```ts
// packages/omkit/tests/fixtures/discovery/oms/dev.ts
import { om } from "omkit";

om("dev", async () => {
  // two daemons + a gate, elided for the fixture
});

om("build", async () => {});
```

```ts
// packages/omkit/tests/fixtures/discovery/actions/build.ts
import { action } from "omkit";

export const build = action("build")
  .emits<{ progress: number }>()
  .ref<number>()
  .run(async () => 0);

export const lint = action("lint").run(async () => {});
```

```ts
// packages/omkit/tests/fixtures/discovery/actions/broken.ts
import { action } from "omkit";

// A deliberate type error: discovery must still report `flaky` and warn, not throw.
export const flaky = action("flaky").run(async (): Promise<number> => {
  const n: number = "not a number";
  return n;
});
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/omkit/tests/unit/discovery.test.ts
import { describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "../../src/cli/client/discovery.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsconfig = path.join(here, "../fixtures/discovery/tsconfig.omkit.json");

describe("discover", () => {
  test("finds runnable oms with names, files, and lines", () => {
    const { oms } = discover(tsconfig);
    const names = oms.map((o) => o.name).sort();
    expect(names).toEqual(["build", "dev"]);
    const dev = oms.find((o) => o.name === "dev")!;
    expect(path.basename(dev.file)).toBe("dev.ts");
    expect(dev.line).toBeGreaterThan(0);
  });

  test("finds inspectable actions with capability/events metadata", () => {
    const { actions } = discover(tsconfig);
    const build = actions.find((a) => a.name === "build")!;
    expect(build.exportName).toBe("build");
    expect(build.publishesCapability).toBe(true);
    expect(build.events).toBe(true);

    const lint = actions.find((a) => a.name === "lint")!;
    expect(lint.publishesCapability).toBe(false);
    expect(lint.events).toBe(false);
  });

  test("degrades gracefully: a type-broken file still yields its action, plus a warning", () => {
    const { actions, warnings } = discover(tsconfig);
    expect(actions.some((a) => a.name === "flaky")).toBe(true);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/discovery.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/client/discovery.ts'`.

- [ ] **Step 4: Write the implementation**

```ts
// packages/omkit/src/cli/client/discovery.ts
import ts from "typescript";
import path from "node:path";
import type { Registry, DiscoveredOm, DiscoveredAction } from "./registry.ts";

/** Local binding names imported from "omkit" (handles `import { om as run } from "omkit"`). */
interface OmkitNames {
  om?: string;
  step?: string;
  action?: string;
}

/**
 * Statically scan the project described by `tsconfigPath` for runnable oms and inspectable
 * actions. Never throws for user-code problems — type errors become `warnings`, and whatever
 * parsed is still returned (so an editor-in-progress project stays useful).
 */
export function discover(tsconfigPath: string): Registry {
  const oms: DiscoveredOm[] = [];
  const actions: DiscoveredAction[] = [];
  const warnings: string[] = [];

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    warnings.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
    return { oms, actions, warnings };
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  const fileSet = new Set(parsed.fileNames.map((f) => path.normalize(f)));

  for (const sf of program.getSourceFiles()) {
    if (!fileSet.has(path.normalize(sf.fileName))) continue;

    for (const d of program.getSemanticDiagnostics(sf)) warnings.push(formatDiagnostic(d));

    const names = omkitImports(sf);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === names.om || node.expression.text === names.step)
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) {
          oms.push({ name: arg.text, file: sf.fileName, line: lineOf(sf, node) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt) || !isExported(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
        const info = actionChain(decl.initializer, names.action);
        if (info) {
          actions.push({
            name: info.name,
            file: sf.fileName,
            exportName: decl.name.text,
            publishesCapability: info.ref,
            events: info.emits,
          });
        }
      }
    }
  }

  return { oms, actions, warnings };
}

/** Collect the local names bound to om/step/action from `import … from "omkit"`. */
function omkitImports(sf: ts.SourceFile): OmkitNames {
  const names: OmkitNames = {};
  for (const stmt of sf.statements) {
    if (
      !ts.isImportDeclaration(stmt) ||
      !ts.isStringLiteral(stmt.moduleSpecifier) ||
      stmt.moduleSpecifier.text !== "omkit"
    ) {
      continue;
    }
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (imported === "om") names.om = el.name.text;
      if (imported === "step") names.step = el.name.text;
      if (imported === "action") names.action = el.name.text;
    }
  }
  return names;
}

/**
 * Walk a builder chain (`action("x").emits<…>().ref<…>().run(fn)`) from the outer call down to
 * the base `action("name")` call, noting whether `.ref` / `.emits` appear. Returns undefined
 * when the chain is not rooted in the local `action` binding with a string-literal name.
 */
function actionChain(
  expr: ts.Node,
  actionName: string | undefined
): { name: string; ref: boolean; emits: boolean } | undefined {
  if (actionName === undefined) return undefined;
  let ref = false;
  let emits = false;
  let node: ts.Node = expr;
  while (ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "ref") ref = true;
      if (method === "emits") emits = true;
      node = node.expression.expression;
      continue;
    }
    if (ts.isIdentifier(node.expression) && node.expression.text === actionName) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) return { name: arg.text, ref, emits };
    }
    return undefined;
  }
  return undefined;
}

function isExported(stmt: ts.VariableStatement): boolean {
  return Boolean(stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function formatDiagnostic(d: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file && d.start !== undefined) {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${path.basename(d.file.fileName)}:${line + 1} ${message}`;
  }
  return message;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/discovery.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/omkit/src/cli/client/discovery.ts packages/omkit/tests/fixtures/discovery packages/omkit/tests/unit/discovery.test.ts
git commit -m "Add TS-compiler discovery of omkit oms and actions"
```

---

### Task 3: Supervisor-side channel → RunSession (`cli/client/channel.ts`)

**Files:**

- Create: `packages/omkit/src/cli/client/channel.ts`
- Test: `packages/omkit/tests/unit/channel.test.ts`

**Interfaces:**

- Consumes: `ChildMessage`, `SupervisorMessage` from `../../core/interaction.ts`; `RunSession`, `Verdict`, `PromptRequest`, `RunEvents` from `./types.ts`.
- Produces:
  - `interface Transport { send(m: SupervisorMessage): void; onMessage(cb: (m: ChildMessage) => void): void; onClose(cb: (code: number | null) => void): void; }`
  - `export function createChannel(transport: Transport): RunSession` — routes `prompt`/`log`/`settled` child messages to handlers, resolves `result` on `settled` (or on an unexpected close → `{ ok: false, folder: "" }`), and maps `answer`/`cancel` to `send`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/channel.test.ts
import { describe, expect, test, vi } from "vitest";
import { createChannel, type Transport } from "../../src/cli/client/channel.ts";
import type { ChildMessage, SupervisorMessage } from "../../src/core/interaction.ts";

/** A fake child transport the test drives directly. */
function fakeTransport() {
  const sent: SupervisorMessage[] = [];
  let onMsg: ((m: ChildMessage) => void) | undefined;
  let onClose: ((code: number | null) => void) | undefined;
  return {
    sent,
    transport: {
      send: (m: SupervisorMessage) => void sent.push(m),
      onMessage: (cb: (m: ChildMessage) => void) => void (onMsg = cb),
      onClose: (cb: (code: number | null) => void) => void (onClose = cb),
    } satisfies Transport,
    emit: (m: ChildMessage) => onMsg?.(m),
    close: (code: number | null) => onClose?.(code),
  };
}

const entry = {
  sequence: 1,
  ts: 0,
  nodeId: "main",
  path: "main",
  level: "event",
  source: "lifecycle",
  message: "done · ok",
};

describe("createChannel", () => {
  test("routes log/prompt and resolves result on settled", async () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);

    const logs: unknown[] = [];
    const prompts: string[] = [];
    session.on("log", (e) => logs.push(e));
    session.on("prompt", (r) => prompts.push(r.id));

    f.emit({ kind: "log", entry });
    f.emit({ kind: "prompt", id: "p1", spec: { kind: "input", message: "Name?", default: "" } });
    f.emit({ kind: "settled", ok: true, folder: "/runs/dev-abc" });

    expect(logs).toHaveLength(1);
    expect(prompts).toEqual(["p1"]);
    await expect(session.result).resolves.toEqual({ ok: true, folder: "/runs/dev-abc" });
  });

  test("answer and cancel send the right supervisor messages", () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);
    session.answer("p1", "Ada");
    session.answer("p2", "yes", "input");
    session.cancel();
    expect(f.sent).toEqual([
      { kind: "answer", id: "p1", value: "Ada", via: "input" },
      { kind: "answer", id: "p2", value: "yes", via: "input" },
      { kind: "cancel" },
    ]);
  });

  test("an unexpected close before settle resolves a failed verdict", async () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);
    f.close(1);
    await expect(session.result).resolves.toEqual({ ok: false, folder: "" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/channel.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/client/channel.ts'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/omkit/src/cli/client/channel.ts
import type { ChildMessage, SupervisorMessage } from "../../core/interaction.ts";
import type { RunSession, RunEvents, Verdict } from "./types.ts";

/** The minimal duplex the channel needs — satisfied by a real ChildProcess or a fake. */
export interface Transport {
  send(message: SupervisorMessage): void;
  onMessage(handler: (message: ChildMessage) => void): void;
  onClose(handler: (code: number | null) => void): void;
}

/**
 * Turn a child transport into a {@link RunSession}: fan `log`/`prompt` child messages out to
 * handlers, resolve `result` on `settled`, and map `answer`/`cancel` back down the wire. A
 * close before `settled` resolves a failed verdict so `result` never hangs.
 */
export function createChannel(transport: Transport): RunSession {
  const handlers: { [K in keyof RunEvents]: RunEvents[K][] } = { log: [], prompt: [], settled: [] };
  let settled = false;
  let resolveResult!: (v: Verdict) => void;
  const result = new Promise<Verdict>((resolve) => (resolveResult = resolve));

  transport.onMessage((message) => {
    if (message.kind === "log") {
      for (const h of handlers.log) h(message.entry);
    } else if (message.kind === "prompt") {
      for (const h of handlers.prompt) h({ id: message.id, spec: message.spec });
    } else if (message.kind === "settled") {
      settled = true;
      const verdict: Verdict = { ok: message.ok, folder: message.folder };
      for (const h of handlers.settled) h(verdict);
      resolveResult(verdict);
    }
  });

  transport.onClose(() => {
    if (!settled) resolveResult({ ok: false, folder: "" });
  });

  return {
    on(event, handler) {
      handlers[event].push(handler as never);
    },
    answer(id, value, via = "input") {
      transport.send({ kind: "answer", id, value, via });
    },
    cancel() {
      transport.send({ kind: "cancel" });
    },
    result,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/channel.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/cli/client/channel.ts packages/omkit/tests/unit/channel.test.ts
git commit -m "Add supervisor-side channel that turns child messages into a RunSession"
```

---

### Task 4: Fork an om as a supervised child (`cli/client/runner.ts`) + add `tsx`

**Files:**

- Modify: `packages/omkit/package.json` (add `tsx` dependency)
- Create: `packages/omkit/src/cli/client/runner.ts`
- Create fixture: `packages/omkit/tests/fixtures/run/hello.ts`
- Test: `packages/omkit/tests/unit/runner.test.ts`

**Interfaces:**

- Consumes: `child_process.fork`; `createChannel`, `Transport` from `./channel.ts`; `RunSession`, `RunOptions` from `./types.ts`.
- Produces: `export function runOm(omFile: string, opts?: RunOptions): RunSession` — forks `omFile` with `execArgv: ["--import", "tsx"]`, `env.OMKIT_SUPERVISED = "1"`, `stdio: ["ignore", "pipe", "pipe", "ipc"]`, and wraps the `ChildProcess` in `createChannel`.

- [ ] **Step 1: Add the tsx dependency**

Run: `npm install tsx --workspace omkit --save-exact`
Expected: `packages/omkit/package.json` gains `"tsx": "<version>"` under `dependencies`; exit 0.

- [ ] **Step 2: Write the fixture om**

```ts
// packages/omkit/tests/fixtures/run/hello.ts
import { om } from "../../../src/index.ts";
import { prompt } from "../../../src/actions/prompt.ts";

om("hello", async ({ snapshot }) => {
  await snapshot("start", { ok: true });
  const name = await prompt({ message: "Name?", default: "anon", timeoutMs: 5000 }).result.then(
    (o) => (o.ok ? o.value : "ERR")
  );
  await snapshot("greeted", { name });
});
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/omkit/tests/unit/runner.test.ts
import { describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOm } from "../../src/cli/client/runner.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const helloOm = path.join(here, "../fixtures/run/hello.ts");

describe("runOm (real fork)", () => {
  test("runs a supervised om, round-trips a prompt, and settles ok", async () => {
    const session = runOm(helloOm);
    const logs: LogEntry[] = [];
    session.on("log", (e) => logs.push(e));
    session.on("prompt", (req) => session.answer(req.id, "Ada"));

    const verdict = await session.result;
    expect(verdict.ok).toBe(true);
    expect(verdict.folder).toContain("hello-");
    // The greeted snapshot recorded the answered name → it flowed over the channel.
    expect(logs.some((e) => e.message.includes("greeted"))).toBe(true);
  }, 20_000);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/runner.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/client/runner.ts'`.

- [ ] **Step 5: Write the implementation**

```ts
// packages/omkit/src/cli/client/runner.ts
import { fork } from "node:child_process";
import path from "node:path";
import { createChannel, type Transport } from "./channel.ts";
import type { ChildMessage, SupervisorMessage } from "../../core/interaction.ts";
import type { RunSession, RunOptions } from "./types.ts";

/**
 * Fork `omFile` as a supervised child: the `tsx` loader runs the TypeScript directly,
 * `OMKIT_SUPERVISED=1` flips the child into channel mode (see core/interaction.ts), and its
 * IPC channel is wrapped into a {@link RunSession}. stdout/stderr are piped (not inherited)
 * so the child never writes to the supervisor's terminal.
 */
export function runOm(omFile: string, opts: RunOptions = {}): RunSession {
  const child = fork(omFile, [], {
    execArgv: ["--import", "tsx"],
    cwd: opts.cwd ?? path.dirname(omFile),
    env: { ...process.env, OMKIT_SUPERVISED: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  const transport: Transport = {
    send: (message: SupervisorMessage) => void child.send(message),
    onMessage: (handler) => void child.on("message", (m) => handler(m as ChildMessage)),
    onClose: (handler) => void child.on("close", (code) => handler(code)),
  };

  return createChannel(transport);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/runner.test.ts`
Expected: PASS (1 test). If it fails to boot the child, confirm `tsx` installed (Step 1) and that `node --import tsx` resolves from the omkit workspace.

- [ ] **Step 7: Commit**

```bash
git add packages/omkit/package.json packages/omkit/package-lock.json packages/omkit/src/cli/client/runner.ts packages/omkit/tests/fixtures/run/hello.ts packages/omkit/tests/unit/runner.test.ts
git commit -m "Fork oms as supervised children via the tsx loader"
```

(The lockfile path may be the repo-root `package-lock.json`; stage whichever the install touched.)

---

### Task 5: Compose the client façade (`cli/client/index.ts`)

**Files:**

- Create: `packages/omkit/src/cli/client/index.ts`
- Test: `packages/omkit/tests/unit/client.test.ts`

**Interfaces:**

- Consumes: `discover` from `./discovery.ts`; `runOm` from `./runner.ts`; `runCheck` (below) from `./check.ts`; `OmkitClient`, `Diagnostic` from `./types.ts`.
- Produces:
  - `cli/client/check.ts` → `export function runCheck(tsconfigPath: string): Diagnostic[]` — a `tsc --noEmit` typecheck returning diagnostics (reuses the discovery config-parse path).
  - `cli/client/index.ts` → `export function createOmkitClient(config: { tsconfig: string }): OmkitClient` and re-exports of the public SDK types.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/client.test.ts
import { describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOmkitClient } from "../../src/cli/client/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsconfig = path.join(here, "../fixtures/discovery/tsconfig.omkit.json");

describe("createOmkitClient", () => {
  test("discover() surfaces the project's oms and actions", async () => {
    const client = createOmkitClient({ tsconfig });
    const registry = await client.discover();
    expect(registry.oms.map((o) => o.name).sort()).toEqual(["build", "dev"]);
    expect(registry.actions.some((a) => a.name === "build")).toBe(true);
  });

  test("check() reports the broken fixture's type error", async () => {
    const client = createOmkitClient({ tsconfig });
    const diagnostics = await client.check();
    expect(diagnostics.some((d) => path.basename(d.file) === "broken.ts")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/client.test.ts`
Expected: FAIL — `Cannot find module '../../src/cli/client/index.ts'`.

- [ ] **Step 3: Write `check.ts`**

```ts
// packages/omkit/src/cli/client/check.ts
import ts from "typescript";
import path from "node:path";
import type { Diagnostic } from "./types.ts";

/** Typecheck the project (`tsc --noEmit`) and return per-file diagnostics. */
export function runCheck(tsconfigPath: string): Diagnostic[] {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    return [{ file: tsconfigPath, line: 0, message: msg(configFile.error) }];
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  const fileSet = new Set(parsed.fileNames.map((f) => path.normalize(f)));
  const out: Diagnostic[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!fileSet.has(path.normalize(sf.fileName))) continue;
    for (const d of [
      ...program.getSyntacticDiagnostics(sf),
      ...program.getSemanticDiagnostics(sf),
    ]) {
      const line = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      out.push({ file: sf.fileName, line, message: msg(d) });
    }
  }
  return out;
}

function msg(d: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(d.messageText, "\n");
}
```

- [ ] **Step 4: Write `index.ts`**

```ts
// packages/omkit/src/cli/client/index.ts
import { discover } from "./discovery.ts";
import { runOm } from "./runner.ts";
import { runCheck } from "./check.ts";
import type { OmkitClient } from "./types.ts";

export type {
  OmkitClient,
  RunSession,
  RunOptions,
  Verdict,
  Diagnostic,
  PromptRequest,
  RunEvents,
} from "./types.ts";
export type { Registry, DiscoveredOm, DiscoveredAction } from "./registry.ts";

/** Configuration for a client — the path to the project's `tsconfig.omkit.json`. */
export interface OmkitConfig {
  tsconfig: string;
}

/** Build the headless engine: discovery + supervised run + typecheck over one config. */
export function createOmkitClient(config: OmkitConfig): OmkitClient {
  return {
    discover: async () => discover(config.tsconfig),
    run: (omFile, opts) => runOm(omFile, opts),
    check: async () => runCheck(config.tsconfig),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/omkit/src/cli/client/check.ts packages/omkit/src/cli/client/index.ts packages/omkit/tests/unit/client.test.ts
git commit -m "Compose createOmkitClient over discovery, runner, and check"
```

---

### Task 6: Typecheck, lint, and full-suite gate

**Files:** verification only.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck --workspace omkit`
Expected: exit 0. (The `on<K>` handler push uses `as never` in `channel.ts`; if strict mode rejects any client-type usage, fix inline.)

- [ ] **Step 2: Lint**

Run: `npm run lint --workspace omkit`
Expected: exit 0 (0 errors; warnings tolerated per the repo baseline).

- [ ] **Step 3: Full omkit suite**

Run: `npx vitest run packages/omkit`
Expected: PASS — all Plan A tests plus the new discovery (3), channel (3), runner (1), and client (2) tests.

- [ ] **Step 4: Commit any fixups** (skip if clean)

```bash
git add -A packages/omkit
git commit -m "Typecheck/lint fixups for the omkit client SDK"
```

---

## Plan B1 — Definition of Done

- `createOmkitClient({ tsconfig })` exposes `discover()`, `run(omFile)`, and `check()`.
- `discover()` finds oms and actions via the TS Compiler API and degrades gracefully on type errors.
- `run()` forks a real om as a supervised child (through `tsx`), streams its log entries and prompts, round-trips an answer, resolves a `Verdict`, and supports `cancel()`.
- `check()` returns typecheck diagnostics.
- `cli/client/` imports nothing from `cli/commands/` or `cli/ui/`; `typecheck`, `lint`, and the full suite are green.
- The SDK surface (`OmkitClient`, `RunSession`, `Registry`, `Verdict`, …) is what Plan B2's commands and Plan C's Ink app consume.
