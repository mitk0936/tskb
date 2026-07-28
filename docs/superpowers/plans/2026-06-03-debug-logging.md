# debug-based Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tskb's single-boolean logger with a centralized `debug`-based logging system that has namespaces + numeric verbosity levels, plus a convention-compatible setup for the isolated browser explorer-spa.

**Architecture:** A runtime-agnostic "namespace + numeric level" model implemented twice. Node side: new `src/log/index.ts` factory wrapping `debug`, configured once at CLI startup, with all subsystem namespaces (`tskb:*`) default-enabled and a default level of `info`. Browser side: `explorer-app/src/log.ts`, same shape, config from `localStorage` + URL params. A message emits only if its namespace is enabled AND its numeric level ≤ the configured threshold. The stdout result path (`jsonOut`/`plainOut` and JSON error results) is untouched.

**Tech Stack:** TypeScript (ESM), `debug` + `@types/debug`, Vite (browser build), `tsc` (lib build).

**Note on verification:** This repo has no unit-test harness (`"test"` is a no-op). Per the spec, adding a test runner is out of scope. Verification is therefore: (a) `tsc` type-check / build passes, and (b) behavioral checks — running real CLI commands and asserting stdout/stderr contents. Each task's verification steps reflect this.

---

## File Structure

**Node (new / changed):**

- Create `packages/tskb/src/log/index.ts` — `createLogger(namespace)` factory, `configure()`, level constants, the level gate. Single responsibility: diagnostic logging.
- Modify `packages/tskb/src/cli/utils/logger.ts` — reduced to `jsonOut` / `plainOut` only (stdout output). All logging functions removed.
- Modify `packages/tskb/src/cli/index.ts` — import `configure` from `../log`, create a `cli` logger for `error()`.
- Modify call sites: `cli/commands/{build,search,pick,ls,docs,flows,registry,init,explore}.ts`, `core/explorer/server.ts`.

**Browser (new / changed):**

- Create `packages/tskb/explorer-app/src/log.ts` — browser `createLogger` + `configure` reading `localStorage` + URL params.
- Modify `explorer-app/src/main.ts`, `explorer-app/src/components/BoundaryRenderer.ts`, `explorer-app/src/workers/search.worker.ts`.

**Docs / deps:**

- Modify `packages/tskb/package.json` — add `debug` dep + `@types/debug` devDep.
- Modify `docs/src/tskb/cli/logging.tskb.tsx` — rewrite constraint doc for the new model.

**Explicitly NOT touched (output contract, not logging):**

- `cli/utils/logger.ts` `jsonOut` / `plainOut`.
- JSON error results via `console.log`/`console.error` in `pick.ts:583`, `pick.ts:600`, `ls.ts:45`, `context.ts:206`.
- Help text via `console.error` in `cli/utils/help.ts:59`.

---

## Level / namespace conventions (reference for all tasks)

```
LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 }
```

Old-API → new-API migration mapping (used throughout the node migration tasks):

| Old call          | New call              | Notes                                                |
| ----------------- | --------------------- | ---------------------------------------------------- |
| `info(x)`         | `log.info(x)`         | level 2, visible by default                          |
| `verbose(x)`      | `log.debug(x)`        | level 3, hidden unless `--verbose` / level raised    |
| `error(x)`        | `log.error(x)`        | level 0                                              |
| `time(label)`     | `log.time(label)`     | returns closure; label + elapsed at `debug` level    |
| `infoTime(label)` | `log.infoTime(label)` | returns closure; label at `info`, elapsed at `debug` |

Per-file namespace:

| File                       | `createLogger("…")` |
| -------------------------- | ------------------- |
| `cli/index.ts`             | `cli`               |
| `cli/commands/build.ts`    | `cli:build`         |
| `cli/commands/search.ts`   | `cli:search`        |
| `cli/commands/pick.ts`     | `cli:pick`          |
| `cli/commands/ls.ts`       | `cli:ls`            |
| `cli/commands/docs.ts`     | `cli:docs`          |
| `cli/commands/flows.ts`    | `cli:flows`         |
| `cli/commands/registry.ts` | `cli:registry`      |
| `cli/commands/init.ts`     | `cli:init`          |
| `cli/commands/explore.ts`  | `cli:explore`       |
| `core/explorer/server.ts`  | `core:explorer`     |

`createLogger` prepends the `tskb:` root, so `createLogger("cli:build")` → namespace `tskb:cli:build`.

---

## Task 1: Add `debug` dependency

**Files:**

- Modify: `packages/tskb/package.json`

- [ ] **Step 1: Install debug + types**

Run (from `packages/tskb/`):

```bash
npm install debug@^4.4.0
npm install -D @types/debug@^4.1.12
```

Expected: `debug` appears under `dependencies`, `@types/debug` under `devDependencies` in `packages/tskb/package.json`, and `package-lock.json` updates.

- [ ] **Step 2: Verify install**

Run (from `packages/tskb/`):

```bash
node -e "console.log(require('debug/package.json').version)"
```

Expected: prints a `4.x` version, no error.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/package.json package-lock.json
git commit -m "build: add debug dependency for logging"
```

---

## Task 2: Create the node logging module

**Files:**

- Create: `packages/tskb/src/log/index.ts`

- [ ] **Step 1: Write the module**

Create `packages/tskb/src/log/index.ts` with exactly this content:

```ts
import createDebug from "debug";

/** Numeric verbosity levels. Lower = more important / more likely visible. */
export const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
} as const;

export type LevelName = keyof typeof LEVELS;

/** Root namespace prepended to every logger. */
const ROOT = "tskb";

/** Module-level threshold. Messages with LEVELS[level] <= threshold may emit. */
let threshold: number = LEVELS.info;

type Message = string | (() => string);
type LogFn = (msg: Message, ...args: unknown[]) => void;

export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  /** Timer whose label + elapsed ms both log at `debug` level. */
  time(label: string): () => void;
  /** Timer whose label logs at `info` and elapsed ms at `debug`. */
  infoTime(label: string): () => void;
}

/** Resolve a message that may be a lazy function. */
function resolve(msg: Message): string {
  return typeof msg === "function" ? msg() : msg;
}

/**
 * Parse a level from a string: accepts a name ("debug") or a number ("3").
 * Returns undefined if unrecognized.
 */
export function parseLevel(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed in LEVELS) return LEVELS[trimmed as LevelName];
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 0 && n <= LEVELS.trace) return n;
  return undefined;
}

/**
 * Configure logging once at startup.
 * - level: TSKB_LOG_LEVEL env wins; else `trace` when verbose; else `info`.
 * - namespaces: DEBUG env wins (debug reads it on import); else enable `tskb:*`.
 * - object inspect depth: DEBUG_DEPTH env wins; else 4 (so nested state isn't truncated).
 */
export function configure(opts: { verbose: boolean }): void {
  const envLevel = parseLevel(process.env.TSKB_LOG_LEVEL);
  threshold = envLevel ?? (opts.verbose ? LEVELS.trace : LEVELS.info);

  if (!process.env.DEBUG) {
    createDebug.enable(`${ROOT}:*`);
  } else if (opts.verbose) {
    // Keep explicit DEBUG selection but ensure tskb namespaces are on too.
    createDebug.enable(`${process.env.DEBUG},${ROOT}:*`);
  }

  const depth = process.env.DEBUG_DEPTH ? Number(process.env.DEBUG_DEPTH) : 4;
  // inspectOpts exists on the node build of debug.
  (createDebug as unknown as { inspectOpts: { depth: number } }).inspectOpts = {
    ...(createDebug as unknown as { inspectOpts?: object }).inspectOpts,
    depth,
  };
}

/** Create a namespaced logger. `ns` is appended to the `tskb:` root. */
export function createLogger(ns: string): Logger {
  const d = createDebug(`${ROOT}:${ns}`);

  const make = (level: number): LogFn => {
    return (msg, ...args) => {
      if (level > threshold) return; // cheap numeric gate, runs before formatting
      if (!d.enabled) return; // namespace gate
      d(resolve(msg), ...args);
    };
  };

  const debugFn = make(LEVELS.debug);
  const infoFn = make(LEVELS.info);

  return {
    error: make(LEVELS.error),
    warn: make(LEVELS.warn),
    info: infoFn,
    debug: debugFn,
    trace: make(LEVELS.trace),
    time(label) {
      const start = performance.now();
      debugFn(`${label}...`);
      return () => debugFn(`${label} (${Math.round(performance.now() - start)}ms)`);
    },
    infoTime(label) {
      const start = performance.now();
      infoFn(`${label}...`);
      return () => debugFn(`${label} (${Math.round(performance.now() - start)}ms)`);
    },
  };
}
```

- [ ] **Step 2: Type-check the new module compiles**

Run (from `packages/tskb/`):

```bash
npx tsc --noEmit
```

Expected: PASS (no errors). If `inspectOpts` errors, the `@types/debug` install from Task 1 is missing — re-run it.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/src/log/index.ts
git commit -m "feat(log): add debug-based logger factory with levels"
```

---

## Task 3: Reduce old logger to stdout helpers; wire configure

**Files:**

- Modify: `packages/tskb/src/cli/utils/logger.ts`
- Modify: `packages/tskb/src/cli/index.ts`

- [ ] **Step 1: Replace logger.ts with stdout-only helpers**

Replace the entire content of `packages/tskb/src/cli/utils/logger.ts` with:

```ts
/**
 * Stdout output helpers. NOT logging — these write command results to stdout.
 * All diagnostic logging lives in src/log/. See logging.tskb.tsx.
 */

/** Write a JSON value to stdout, compact when optimized is true. */
export function jsonOut(value: unknown, optimized: boolean): void {
  console.log(optimized ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

/** Write plain text to stdout. */
export function plainOut(text: string): void {
  console.log(text);
}
```

- [ ] **Step 2: Update index.ts imports and error usage**

In `packages/tskb/src/cli/index.ts`:

Replace line 18:

```ts
import { configure, error } from "./utils/logger.js";
```

with:

```ts
import { configure, createLogger } from "../log/index.js";

const log = createLogger("cli");
```

Then replace every `error(` call in this file with `log.error(`. There are 10 occurrences at lines 56, 60, 70, 71, 80, 81, 94, 95, 129, 133. Example — line 133:

```ts
log.error("❌ Error: " + (err instanceof Error ? err.message : String(err)));
```

The `configure({ verbose: values.verbose! });` call at line 44 stays unchanged (now resolves to the new `configure`).

- [ ] **Step 3: Type-check**

Run (from `packages/tskb/`):

```bash
npx tsc --noEmit
```

Expected: errors ONLY in the not-yet-migrated command files / server.ts that still import `info`/`verbose`/`time`/`infoTime`/`error` from `../utils/logger.js`. `index.ts` and `logger.ts` themselves must be clean. (These remaining errors are fixed in Tasks 4–5.)

- [ ] **Step 4: Commit**

```bash
git add packages/tskb/src/cli/utils/logger.ts packages/tskb/src/cli/index.ts
git commit -m "refactor(log): reduce logger.ts to stdout helpers, wire new logger in index"
```

---

## Task 4: Migrate node command call sites

**Files:**

- Modify: `cli/commands/build.ts`, `search.ts`, `pick.ts`, `ls.ts`, `docs.ts`, `flows.ts`, `registry.ts`, `init.ts`, `explore.ts`
- Modify: `core/explorer/server.ts`

For EACH file below, apply the same recipe: (1) delete the `import { … } from "../utils/logger.js"` line for logging functions, **keeping** any `jsonOut`/`plainOut` import (those move to a separate import that still points at `../utils/logger.js`); (2) add `import { createLogger } from "../../log/index.js";` and `const log = createLogger("<ns>");`; (3) rename calls per the mapping table in the conventions section (`info→log.info`, `verbose→log.debug`, `error→log.error`, `time→log.time`, `infoTime→log.infoTime`).

Note the relative import depth: command files are at `src/cli/commands/`, so the path to the log module is `../../log/index.js`. `core/explorer/server.ts` is at `src/core/explorer/`, so it is also `../../log/index.js`.

- [ ] **Step 1: build.ts**

In `cli/commands/build.ts`, replace line 8:

```ts
import { info, verbose, infoTime } from "../utils/logger.js";
```

with:

```ts
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:build");
```

Then rename in the file body: `infoTime(` → `log.infoTime(`, `info(` → `log.info(`, `verbose(` → `log.debug(`. (Occurrences at lines 70–224.)

- [ ] **Step 2: search.ts**

In `cli/commands/search.ts`, replace line 4:

```ts
import { verbose, time, jsonOut, plainOut } from "../utils/logger.js";
```

with:

```ts
import { jsonOut, plainOut } from "../utils/logger.js";
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:search");
```

Then rename: `time(` → `log.time(`, `verbose(` → `log.debug(`. (Lines 83, 87, 89, 190.) Leave `jsonOut`/`plainOut` calls unchanged.

- [ ] **Step 3: pick.ts**

In `cli/commands/pick.ts`, replace line 4:

```ts
import { verbose, time, jsonOut, plainOut } from "../utils/logger.js";
```

with:

```ts
import { jsonOut, plainOut } from "../utils/logger.js";
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:pick");
```

Then rename: `time(` → `log.time(`, `verbose(` → `log.debug(`. (Lines 575, 579, 631, 635.) Leave the `console.log(JSON.stringify(...))` error results at lines 583 and 600 unchanged — they are output, not logging.

- [ ] **Step 4: ls.ts**

In `cli/commands/ls.ts`, replace line 4:

```ts
import { verbose, time, jsonOut, plainOut } from "../utils/logger.js";
```

with:

```ts
import { jsonOut, plainOut } from "../utils/logger.js";
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:ls");
```

Then rename: `time(` → `log.time(`, `verbose(` → `log.debug(`. (Lines 36, 59, 63.) Leave the `console.error(JSON.stringify(...))` error result at line 45 unchanged.

- [ ] **Step 5: docs.ts**

In `cli/commands/docs.ts`, replace line 3:

```ts
import { verbose, time, jsonOut, plainOut } from "../utils/logger.js";
```

with:

```ts
import { jsonOut, plainOut } from "../utils/logger.js";
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:docs");
```

Then rename: `time(` → `log.time(`, `verbose(` → `log.debug(`. (Lines 38, 57, 66, 111.)

- [ ] **Step 6: flows.ts**

In `cli/commands/flows.ts`, replace line 4:

```ts
import { verbose, time, jsonOut, plainOut } from "../utils/logger.js";
```

with:

```ts
import { jsonOut, plainOut } from "../utils/logger.js";
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:flows");
```

Then rename: `time(` → `log.time(`, `verbose(` → `log.debug(`. (Lines 46, 60, 69, 111.)

- [ ] **Step 7: registry.ts**

In `cli/commands/registry.ts`, replace line 4:

```ts
import { verbose, time, jsonOut, plainOut, error } from "../utils/logger.js";
```

with:

```ts
import { jsonOut, plainOut } from "../utils/logger.js";
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:registry");
```

Then rename: `error(` → `log.error(`, `time(` → `log.time(`, `verbose(` → `log.debug(`. (Lines 123, 127, 145, 162, 169, 212.)

- [ ] **Step 8: init.ts**

In `cli/commands/init.ts`, replace line 4:

```ts
import { info, error } from "../utils/logger.js";
```

with:

```ts
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:init");
```

Then rename: `info(` → `log.info(`, `error(` → `log.error(`. (Many occurrences, lines 86–240.)

- [ ] **Step 9: explore.ts**

In `cli/commands/explore.ts`, replace line 3:

```ts
import { info } from "../utils/logger.js";
```

with:

```ts
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:explore");
```

Then rename: `info(` → `log.info(`. (Lines 19, 20.)

- [ ] **Step 10: server.ts**

In `core/explorer/server.ts`, replace line 6:

```ts
import { info } from "../../cli/utils/logger.js";
```

with:

```ts
import { createLogger } from "../../log/index.js";

const log = createLogger("core:explorer");
```

Then rename: `info(` → `log.info(`. (Lines 106, 107, 124.) This also removes the core→cli import inversion.

- [ ] **Step 11: Type-check the whole lib**

Run (from `packages/tskb/`):

```bash
npx tsc --noEmit
```

Expected: PASS, zero errors.

- [ ] **Step 12: Build the lib**

Run (from `packages/tskb/`):

```bash
npm run build:lib
```

Expected: PASS, `dist/` populated including `dist/log/index.js`.

- [ ] **Step 13: Behavioral check — default level is clean on stderr**

Run (from repo root `d:\tskb`):

```bash
node packages/tskb/dist/cli/index.js ls --plain 1>out.txt 2>err.txt; echo "---STDERR---"; cat err.txt
```

Expected: `out.txt` contains the folder listing; the `---STDERR---` section is empty (no `debug`/`trace` noise at default `info` level for a query command). Note: `info`-level lines would show if any were emitted; `ls` emits only `time`/`verbose` → now `debug` level, so stderr stays empty.

- [ ] **Step 14: Behavioral check — verbose opens the firehose**

Run (from repo root):

```bash
node packages/tskb/dist/cli/index.js ls --plain --verbose 1>out.txt 2>err.txt; echo "---STDERR---"; cat err.txt
```

Expected: `out.txt` unchanged (clean result on stdout); `---STDERR---` now shows `tskb:cli:ls` lines like `Loading graph...` / `Traversing folders (Nms)`.

- [ ] **Step 15: Behavioral check — DEBUG env narrows namespace**

Run (from repo root, PowerShell):

```powershell
$env:DEBUG="tskb:cli:ls"; $env:TSKB_LOG_LEVEL="trace"; node packages/tskb/dist/cli/index.js ls --plain 2>err.txt 1>out.txt; Remove-Item Env:DEBUG; Remove-Item Env:TSKB_LOG_LEVEL; Get-Content err.txt
```

Expected: stderr shows only `tskb:cli:ls` lines (no other namespaces), confirming namespace + level gates both work.

- [ ] **Step 16: Clean up scratch files and commit**

```bash
rm -f out.txt err.txt
git add packages/tskb/src
git commit -m "refactor(log): migrate node call sites to namespaced loggers"
```

---

## Task 5: Create the browser logging module

**Files:**

- Create: `packages/tskb/explorer-app/src/log.ts`

- [ ] **Step 1: Write the browser module**

Create `packages/tskb/explorer-app/src/log.ts` with exactly this content:

```ts
import createDebug from "debug";

/** Numeric verbosity levels. Lower = more important / more likely visible. */
export const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
} as const;

export type LevelName = keyof typeof LEVELS;

const ROOT = "tskb";
let threshold: number = LEVELS.info;

type Message = string | (() => string);
type LogFn = (msg: Message, ...args: unknown[]) => void;

export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  time(label: string): () => void;
  infoTime(label: string): () => void;
}

function resolve(msg: Message): string {
  return typeof msg === "function" ? msg() : msg;
}

function parseLevel(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed in LEVELS) return LEVELS[trimmed as LevelName];
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 0 && n <= LEVELS.trace) return n;
  return undefined;
}

/**
 * Configure browser logging once at startup. Reads:
 * - ?debug= and ?log= URL params (written through to localStorage), then
 * - localStorage.debug (namespaces) and localStorage.tskb_log_level (level).
 * Defaults: namespaces tskb:* enabled, level info.
 */
export function configure(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlDebug = params.get("debug");
    const urlLog = params.get("log");
    if (urlDebug !== null) localStorage.setItem("debug", urlDebug);
    if (urlLog !== null) localStorage.setItem("tskb_log_level", urlLog);
  } catch {
    // window/localStorage may be unavailable (e.g. worker startup before config) — ignore.
  }

  let ns: string | null = null;
  let levelRaw: string | null = null;
  try {
    ns = localStorage.getItem("debug");
    levelRaw = localStorage.getItem("tskb_log_level");
  } catch {
    // ignore
  }

  threshold = parseLevel(levelRaw) ?? LEVELS.info;
  createDebug.enable(ns && ns.length > 0 ? ns : `${ROOT}:*`);
}

export function createLogger(ns: string): Logger {
  const d = createDebug(`${ROOT}:${ns}`);

  const make = (level: number): LogFn => {
    return (msg, ...args) => {
      if (level > threshold) return;
      if (!d.enabled) return;
      d(resolve(msg), ...args);
    };
  };

  const debugFn = make(LEVELS.debug);
  const infoFn = make(LEVELS.info);

  return {
    error: make(LEVELS.error),
    warn: make(LEVELS.warn),
    info: infoFn,
    debug: debugFn,
    trace: make(LEVELS.trace),
    time(label) {
      const start = performance.now();
      debugFn(`${label}...`);
      return () => debugFn(`${label} (${Math.round(performance.now() - start)}ms)`);
    },
    infoTime(label) {
      const start = performance.now();
      infoFn(`${label}...`);
      return () => debugFn(`${label} (${Math.round(performance.now() - start)}ms)`);
    },
  };
}
```

- [ ] **Step 2: Type-check the explorer-app**

Run (from `packages/tskb/`):

```bash
npx tsc --noEmit --project explorer-app/tsconfig.json
```

Expected: PASS (the new file compiles; existing files unaffected).

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/explorer-app/src/log.ts
git commit -m "feat(log): add browser logger for explorer-spa"
```

---

## Task 6: Migrate explorer-app console calls

**Files:**

- Modify: `explorer-app/src/main.ts`
- Modify: `explorer-app/src/components/BoundaryRenderer.ts`
- Modify: `explorer-app/src/workers/search.worker.ts`

- [ ] **Step 1: main.ts — call configure() and add a logger**

At the top of `explorer-app/src/main.ts`, after the existing imports, add:

```ts
import { configure, createLogger } from "./log.js";

configure();
const log = createLogger("app:render");
```

(Use `./log.js` — `moduleResolution: Bundler` + Vite resolve this correctly.)

- [ ] **Step 2: main.ts — replace console calls**

Apply these replacements in `explorer-app/src/main.ts`:

- Line 298 `console.error("Failed to load meta chunk:", e);` → `log.error("Failed to load meta chunk: %o", e);`
- Line 311 `console.log("[render] start");` → `log.debug("start");`
- Lines 319, 328, 352, 356, 360, 364, 368, 371 — these are `[render] …` timing logs at `console.log`. Replace each `console.log(` with `log.debug(` and drop the literal `[render] ` prefix from the string (the namespace `tskb:app:render` already labels them). Example line 319:
  ```ts
  log.debug(`computeLayout (${(performance.now() - t).toFixed(1)}ms)`);
  ```
- Line 446 `console.error("Failed to load chunk for", node.id, e);` → `log.error("Failed to load chunk for %s %o", node.id, e);`
- Line 587 `console.error("Failed to load chunk for", id, e);` → `log.error("Failed to load chunk for %s %o", id, e);`
- Line 733 `console.info("[tskb explorer] trace links for:", node.id, ...)` → `log.info("trace links for: %s (%d edges)", node.id, node.edgeCount);`

- [ ] **Step 3: BoundaryRenderer.ts — add logger and replace**

At the top of `explorer-app/src/components/BoundaryRenderer.ts`, after existing imports, add:

```ts
import { createLogger } from "../log.js";

const log = createLogger("app:boundary");
```

Then:

- Line 157 `console.log(` (the multi-line `[boundary] …` call) → `log.debug(`, dropping the `[boundary] ` prefix from the format string.
- Line 161 `console.log(`[boundary] resolveBoundaries done — ${resolved.size} resolved`);` → `log.debug(`resolveBoundaries done — ${resolved.size} resolved`);`

- [ ] **Step 4: search.worker.ts — add logger and replace**

A web worker has no `window`; the worker still needs a logger but should not call `configure()` (which reads `window.location`). The browser `configure()` guards `window` access in try/catch, so namespaces fall back to `tskb:*` at `info` — acceptable for the worker.

At the top of `explorer-app/src/workers/search.worker.ts`, after existing imports, add:

```ts
import { createLogger } from "../log.js";

const log = createLogger("app:search-worker");
```

Then replace line 140 `init(msg.url).catch(console.error);` with:

```ts
init(msg.url).catch((e) => log.error("init failed: %o", e));
```

- [ ] **Step 5: Confirm no stray console.\* remain in migrated files**

Run (from `packages/tskb/`):

```bash
grep -rn "console\\." explorer-app/src/main.ts explorer-app/src/components/BoundaryRenderer.ts explorer-app/src/workers/search.worker.ts
```

Expected: no output (all migrated).

- [ ] **Step 6: Build the explorer**

Run (from `packages/tskb/`):

```bash
npm run build:explorer
```

Expected: Vite build succeeds; `debug` resolves to its browser build automatically.

- [ ] **Step 7: Commit**

```bash
git add packages/tskb/explorer-app/src
git commit -m "refactor(log): migrate explorer-spa console calls to namespaced logger"
```

---

## Task 7: Update the logging constraint doc

**Files:**

- Modify: `docs/src/tskb/cli/logging.tskb.tsx`

- [ ] **Step 1: Rewrite the doc body**

Replace the content of `docs/src/tskb/cli/logging.tskb.tsx` so it describes the new model. Keep the file's existing imports and `ref` pattern (do not invent new refs). Use the existing `LoggerModule`/`IndexModule`/`BuildModule` refs where they still apply, and update the prose to cover:

- Two axes: namespace (`tskb:<area>`, via `DEBUG` / `localStorage.debug`) and numeric level (`error<warn<info<debug<trace`, via `TSKB_LOG_LEVEL` / `localStorage.tskb_log_level`).
- Defaults: all `tskb:*` enabled, level `info`; `error`/`warn`/`info` visible by default, `debug`/`trace` on demand.
- `--verbose` raises level to `trace` and ensures `tskb:*`.
- The hard rule (constraint): all logging goes to stderr/console; stdout is reserved for `jsonOut`/`plainOut` and JSON results.
- Browser: `?debug=`/`?log=` URL params write through to localStorage.

Reference the new node module. Since the `ref` system requires the module to be registered, point `LoggerModule` at the registered logger module id. If the registry id for `src/log/index.ts` differs from the old `cli.utils.logger`, use whatever id `npm run build:docs` reports; in prose, refer to it as "the log module (`src/log/`)". Do NOT use the bare word "deps" anywhere in prose (per repo convention — it must be a defined term).

- [ ] **Step 2: Rebuild the docs graph**

Run (from repo root `d:\tskb`):

```bash
npm run build:docs
```

Expected: build succeeds; no TypeScript errors from the doc file. If it reports an unknown module ref, fix the ref id to match a registered module and re-run.

- [ ] **Step 3: Commit**

```bash
git add docs/src/tskb/cli/logging.tskb.tsx .tskb .claude docs-export
git commit -m "docs(log): document namespace + level logging model"
```

---

## Task 8: Full build verification

- [ ] **Step 1: Clean full build**

Run (from `packages/tskb/`):

```bash
npm run clean && npm run build
```

Expected: both `build:explorer` and `build:lib` succeed with no errors.

- [ ] **Step 2: Final behavioral smoke test**

Run (from repo root):

```bash
node packages/tskb/dist/cli/index.js search "logger" --plain 1>out.txt 2>err.txt; echo "exit=$?"; echo "STDERR:"; cat err.txt; rm -f out.txt err.txt
```

Expected: `exit=0`, `out.txt` had results, `STDERR:` section empty at default level.

- [ ] **Step 3: Confirm core no longer imports cli logger**

Run (from `packages/tskb/`):

```bash
grep -rn "cli/utils/logger" src/core
```

Expected: no output (layering inversion removed).

- [ ] **Step 4: Final commit (if any uncommitted changes remain)**

```bash
git add -A
git commit -m "chore(log): finalize debug logging migration" || echo "nothing to commit"
```

---

## Self-Review notes

- **Spec coverage:** centralized factory (Task 2), full replacement w/ stdout untouched (Task 3), levels + namespaces + laziness (Task 2), default-on namespaces + info default (Task 2 `configure`), `--verbose`→`tskb:*`/trace (Task 2), browser setup + URL params (Tasks 5–6), object depth (Task 2), migration of all call sites (Tasks 4, 6), constraint doc + build:docs (Task 7), deps (Task 1). All spec sections map to tasks.
- **Type consistency:** `createLogger`/`configure`/`LEVELS`/`Logger`/`LogFn` names identical across node and browser modules; method names (`error/warn/info/debug/trace/time/infoTime`) consistent with the migration mapping table.
- **No test harness:** verification is `tsc`/build + behavioral CLI runs, matching repo reality (documented at top).
