# omkit CLI layer — design

**Date:** 2026-07-22
**Status:** Approved design, pre-implementation
**Scope:** The CLI layer for omkit — `bin`, `init` scaffolding, discovery, run commands, and the interactive Ink app, built on a thin reusable client SDK. The MCP layer is the **next** target and is explicitly out of scope here; it is treated only as a forcing function on the architecture (the client SDK and interaction channel must be reusable by an MCP server without engine changes).

---

## 1. Goal

Give omkit a first-class CLI, mirroring the ergonomics of the tskb CLI, so that developer workflows (oms) can be discovered, run, inspected, and driven interactively — and so an AI assistant can later drive the same engine over MCP.

Concretely:

- `omkit init` scaffolds an omkit project (`tsconfig.omkit.json`, `oms/`, `actions/`, samples).
- `omkit run <om>` compiles-and-runs an om.
- `omkit ls` / `omkit check` list and typecheck.
- `omkit ui` (also bare `omkit`) launches an interactive terminal app (Ink) with views: search oms, run, live logging, and prompts answered in-console.
- A thin **client SDK** underpins all of the above and is reused, unchanged, by the future MCP server.

---

## 2. Key decisions (with rationale)

1. **Execution model: one child process per run.** Each om runs in its own `node`/tsx child process; the CLI/Ink app is a supervisor. This keeps omkit's process-wide singleton (`ExecutionTree.current`), SIGINT/teardown handlers, and "success is keep-alive" semantics untouched, isolates crashes, and lets the app supervise many runs. The run folder + an IPC channel are the interfaces between supervisor and child. (Rejected: in-process execution — collides head-on with the singleton, keep-alive daemons, and stdin/stdout ownership.)

2. **Only oms are directly runnable.** oms run by spawning their file. Actions are **discovered for inspection** (name, args, events, whether they publish a capability) but not directly executed — running an action standalone would require synthesizing a throwaway om and inventing arg/capability semantics. Capability-dependent work is expressed as an om. (Rejected: synthetic-om wrapping of actions — unnecessary surface for v1.)

3. **Prompts use a generalized supervisor interaction channel.** `prompt` is refactored so that when an om runs under a supervisor it emits a structured prompt-request over the channel and awaits the answer; when run bare it falls back to today's `readline`. The Ink app renders the request as a view and sends the answer back. This is the exact shape the MCP server reuses (an assistant answering a prompt is just another supervisor). Timeout/teardown fallback is preserved, so a detached or slow supervisor can never wedge a run. (Rejected: deferring prompts, or suspending Ink to pass the tty through — the latter is fragile and does not generalize to MCP.)

4. **Toolchain: transpile-and-run, no typecheck on the hot path.** oms are spawned through a fast TS loader (`tsx` via `execArgv: ["--import", "tsx"]`), using `tsconfig.omkit.json` for module/path resolution. No build step, no `dist`, near-instant start. Typechecking is a separate opt-in: `omkit check` runs `tsc --noEmit`. (Rejected: `tsc`-then-run — seconds per run; esbuild bundling — extra dep and noisier stack traces.)

5. **Packaging: single `omkit` package (Approach B) with multiple entries + lazy imports + chunking.** Everything ships in `packages/omkit` with `bin: { "omkit": "./dist/cli/index.js" }`, mirroring how tskb ships its CLI. The `exports` map (`.`, `./actions`) never transitively references `cli/`, `ui/`, ink, react, or the loader. The bin dynamically `import()`s each command, so the Ink/React chunk is pulled only by `omkit ui` and the TS loader only by `run`/`check`. `import { om } from "omkit"` never reaches UI deps.
   - **Caveat:** ink/react/tsx live in `dependencies`, so a library consumer still _installs_ them even though their import graph never touches them. If install weight becomes a complaint, the drop-in fix is moving them to `optionalDependencies`/`peerDependencies`; the lazy-import structure already supports it. Ship as regular deps for zero-friction `npx omkit`; revisit only if needed.

6. **A thin client SDK is the seam.** Discovery + run supervision + the interaction channel are consolidated into one UI-free, transport-agnostic façade (`createOmkitClient`). The CLI commands and the Ink app are thin adapters over it; the MCP server will be a third adapter with **zero engine changes**. Built internally now; promoted to a public subpath export (`omkit/client`) when MCP becomes a real external consumer, but designed as if public from day one. In-process only — no socket/daemon now, but the transport-agnostic shape does not foreclose a future long-running daemon.

---

## 3. Architecture

Three layers, one package:

```
packages/omkit/
  src/
    core/ actions/ output/ …          ← runtime (largely unchanged), zero UI deps
      core/interaction.ts             ← NEW, tiny, dep-free: child-side of the channel
    cli/
      index.ts                        ← bin entry; parseArgs; each command lazy-import()ed
      commands/  init.ts run.ts ls.ts check.ts ui.ts
      client/                         ← THIN SDK — headless, transport-agnostic, no Ink/React
        index.ts                        createOmkitClient(config) → OmkitClient
        discovery.ts                    TS Compiler API scan → Registry
        runner.ts                       fork the om child (execArgv tsx), own the RunSession
        channel.ts                      supervisor-side interaction protocol
        registry.ts                     DiscoveredOm, DiscoveredAction, Registry types
        types.ts                        OmkitClient, RunSession, RunOptions, Verdict, Diagnostic
      ui/                             ← Ink frontend, the ONLY place react/ink are imported
        app.tsx  views/…
```

**Structural rule:** `cli/client/` imports nothing from `cli/commands/` or `cli/ui/`. The only `omkit`-core touchpoint from the client is that the child runs code which uses `core/interaction.ts`.

### 3.1 Client SDK surface

```ts
interface OmkitClient {
  discover(): Promise<Registry>; // the TS-compiler scan
  run(om: string, opts?: RunOptions): RunSession;
  check(): Promise<Diagnostic[]>; // tsc --noEmit
}

interface RunSession {
  readonly folder: string; // resolved run folder (the durable record)
  on(e: "log" | "prompt" | "settled", handler): void;
  answer(id: string, value: string): void; // respond to a prompt request
  cancel(): void; // graceful teardown
  result: Promise<Verdict>; // resolves on settle
}
```

Frontends as thin adapters over the same session:

- **`omkit run`** → `client.run()` + inherit-stdio adapter (native readline prompts).
- **`omkit ui`** → `client.run()` + Ink views subscribing to `on("log"/"prompt")`, calling `answer`/`cancel`.
- **`omkit-mcp`** (later) → `client.run()` + MCP `tools` (run/cancel/answer) and `resources` (registry, run folders); `on("prompt")` → MCP elicitation → reply calls `answer`.

### 3.2 Command surface

| Command                        | What it does                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `omkit init`                   | Scaffold `tsconfig.omkit.json`, `oms/`, `actions/`, a sample om + action, `.gitignore` + npm script |
| `omkit run <om>`               | Discover + spawn the om as a child, **inherit stdio** (readline prompts work), forward Ctrl+C       |
| `omkit ls`                     | List discovered oms (runnable) and actions (inspectable); `--plain`/JSON like tskb                  |
| `omkit check`                  | `tsc --noEmit` via `tsconfig.omkit.json` (opt-in typecheck)                                         |
| `omkit ui` (also bare `omkit`) | Launch the interactive Ink supervisor                                                               |

---

## 4. The interaction channel & run data-flow

### 4.1 Spawning and supervision modes

The supervisor launches an om with `child_process.fork(omFile, argv, { execArgv: ["--import", "tsx"], stdio, env: { OMKIT_SUPERVISED: "1" } })`. `fork` provides a Node IPC channel (`process.send` / `.on("message")`) alongside stdio — IPC is the control wire; the run folder is the durable record.

```
omkit run <om>            (bare)              omkit ui → run           (supervised)
────────────────────────────────             ──────────────────────────────────────
fork, stdio: "inherit"                        fork, stdio: "pipe", IPC on
child owns the tty                            supervisor (Ink) owns the tty
LiveRenderer prints plain lines               child suppresses its own rendering
prompt() → readline on real stdin             prompt() → IPC request → Ink view → answer
Ctrl+C hits child directly                    Ink forwards SIGINT → child teardown
```

The child selects its mode from `OMKIT_SUPERVISED` + the presence of `process.send`. Everything below the mode switch is unchanged omkit.

### 4.2 Protocol (typed messages, `channel.ts` ↔ `core/interaction.ts`)

```
child → supervisor    { kind: "prompt",   id, spec: PromptOptions }
supervisor → child    { kind: "answer",   id, value, via }          // via: "input"|"default"|"timeout"
child → supervisor    { kind: "log",      entry: LogEntry }         // live milestones for the UI
child → supervisor    { kind: "settled",  verdict, folder }         // run finished
supervisor → child    { kind: "cancel" }                            // graceful teardown request
```

- **Child side** (`core/interaction.ts`, dependency-free, in `omkit`): a tiny `Supervisor | null` singleton. `prompt` calls `supervisor?.request(spec) ?? readlineFallback(spec)`. The request returns a promise keyed by `id`, resolved when the matching `answer` arrives. The existing `timeoutMs`→default and teardown behavior is preserved unchanged.
- **Supervisor side** (`channel.ts`, no UI deps): parses messages, exposes `onPrompt`/`onLog`/`onSettled` plus `answer(id, value)` and `cancel()`. UI-free, so MCP reuses it verbatim.

### 4.3 Two channels, deliberately

- **Live view:** the child forwards curated milestone entries over IPC (`kind:"log"`) so the Ink list updates in real time without filesystem polling.
- **Durable record:** the child still writes `raw.jsonl` + `result.json` to its run folder (survives crashes; full per-action detail the UI can open on demand).
- Bare `omkit run` uses neither IPC channel — inherited stdio shows everything.

### 4.4 Teardown / lifecycle

Ink SIGINT → `channel.cancel()` → child's existing `ExecutionTree` graceful teardown (procs killed, waits unblocked, log flushed, `result.json` written) → child emits `settled` → supervisor shows verdict and reaps. A second Ctrl+C force-kills. The grace-timer logic is the child's existing behavior, untouched.

---

## 5. Changes to `omkit` core (small, dependency-free)

1. **`core/interaction.ts` (new):** child-side channel client — supervised-request / readline-fallback, keyed by `id`, preserving timeout/teardown.
2. **`actions/prompt.ts`:** one branch — `supervisor?.request(spec) ?? readlineFallback(spec)`.
3. **`output/milestones.ts` (new):** extract the pure `format()` curation logic (milestone selection, icons, persist/transient) out of `LiveRenderer` so it is surface-agnostic and reused by both the plain reporter and the Ink log view.
4. **`output/LiveRenderer.ts`:** shrink to the **plain non-TTY reporter** (its existing append branch + `milestones.format`). **Delete the in-place TTY status-line redraw** (the `\r\x1b[2K` cursor machinery) — the Ink UI supersedes it as the interactive surface, and supervised children suppress it. Keep plain stdout for bare/CI/direct-node runs. Add explicit supervised suppression.

Rationale for keeping the plain reporter: bare `omkit run` in CI, in a pipe, or a direct `node --import tsx oms/dev.ts` still needs human-readable stdout; killing all console output would make headless runs blind unless they parse `raw.jsonl`.

---

## 6. `init` scaffolding

Interactive (readline, like `tskb init`) with `--yes` to accept defaults. **Idempotent** — never clobbers an existing file, reports "exists, skipped." Writes:

```
tsconfig.omkit.json         # drives discovery + the tsx loader's resolution
oms/dev.ts                  # sample om: two command daemons + a healthcheck gate
actions/hello.ts            # sample action: action("hello").run(...) that attaches a value
.gitignore   (appends)      # logs/  and  .omkit/
package.json (edits)        # adds script:  "om": "omkit"
```

- **`tsconfig.omkit.json`:** plain TS (no JSX), `module`/`moduleResolution: NodeNext`, `strict`, `include: ["oms/**/*.ts", "actions/**/*.ts"]`. Single source of truth for **both** discovery (which files to scan) and the run loader (module/path resolution). Globs overridable by editing it.
- **Samples** are real, runnable, and small, so immediately after `init` both `omkit run oms/dev.ts` and `omkit ui` do something real.

---

## 7. Discovery (`cli/client/discovery.ts`)

Uses the **TS Compiler API** (same technique as tskb's `build`), driven by `tsconfig.omkit.json`:

1. Parse the config → file list + a `ts.Program` (type checker for robust, alias-proof symbol resolution — not brittle text matching).
2. Walk each source file's statements:
   - **Runnable om** → a top-level call whose callee resolves (via the checker) to `omkit`'s `om`, with a string-literal first arg. Record `{ name, file, line }`. (Line is informational; run identity is file+name per the run-folder-identity constraint.)
   - **Inspectable action** → an exported `action("name")…` builder chain. Record `{ name, file, exportName, publishesCapability: has .ref<>(), events: from .emits<>(), argTypes: from the .run signature }` — all for display.
3. Return `Registry { oms: DiscoveredOm[], actions: DiscoveredAction[] }`.

- **Degrade gracefully:** type errors surface as warnings but do not abort listing — a half-broken file still shows what parsed, so the UI stays useful mid-edit. `omkit check` is the hard, complete typecheck.
- **For the UI:** discovery runs once on launch and re-runs (debounced) on file changes under the include globs, via a small `fs.watch` wrapper independent of omkit's runtime `watch` actions.
- **Shared registry type** in `cli/client/registry.ts` — consumed by `ls`, the Ink app, and (later) the MCP server's resources/tools listing.

---

## 8. Error handling

| Failure                            | Behavior                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| No `tsconfig.omkit.json`           | `init` suggests scaffolding; other commands error with that hint (mirrors tskb's "run init")  |
| Discovery: type error in a file    | Warning, not fatal — list what parsed; `omkit check` is the hard gate                         |
| `run`: unknown om name/file        | Error listing discovered oms (did-you-mean)                                                   |
| Child spawn fails (loader missing) | Actionable error naming the missing loader dep                                                |
| Child crash mid-run                | Session emits `settled` with the failed verdict from `result.json`; non-zero exit surfaced    |
| Ctrl+C                             | Supervisor `cancel()` → child graceful teardown → `settled` → reap; second Ctrl+C force-kills |
| Prompt with no answer              | Existing `timeoutMs`→default fires — a detached UI/MCP client cannot wedge a run              |
| IPC channel drops                  | Session ends failed; the orphaned child tears itself down via its own SIGINT/keep-alive logic |

---

## 9. Testing strategy

Colocated per package (repo convention).

- **Discovery** — fixture `oms/`/`actions/` files → assert the `Registry` (names, files, capability/events/arg metadata); include a deliberately type-broken file to assert graceful-degrade.
- **Channel protocol** — drive `channel.ts` ↔ `core/interaction.ts` with a fake `process.send`/message pair: prompt round-trip, timeout fallback, cancel, out-of-order/duplicate `id` handling.
- **Runner (integration)** — `client.run()` a real fixture om end-to-end: assert `raw.jsonl` + `result.json` exist, a prompt round-trips via the session, and `cancel()` yields a graceful `cancelled` verdict.
- **`core/interaction.ts` unit** — supervised branch routes to the channel; bare branch falls back to `readline`; timeout fires under both.
- **Ink views** — `ink-testing-library`: search filters the list; run view renders `log` milestones (via shared `format()`); prompt view captures a choice and calls `answer`.
- **`format()` promotion** — move existing `LiveRenderer` coverage to `output/milestones.ts`; assert plain reporter + UI consume identical curation.

---

## 10. File-by-file build breakdown (roughly plan-order)

**`omkit` core changes (small, dependency-free):**

1. `core/interaction.ts` — child-side channel client (supervised-request / readline-fallback).
2. `actions/prompt.ts` — one branch: `supervisor?.request(spec) ?? readlineFallback`.
3. `output/milestones.ts` — extract `format()` from `LiveRenderer`.
4. `output/LiveRenderer.ts` — shrink to plain non-TTY reporter; delete in-place-redraw; consume `milestones.ts`; add supervised suppression.

**CLI (new `cli/` tree, lazy-loaded by the bin):**

5. `cli/client/{registry,types}.ts` — shared types.
6. `cli/client/discovery.ts` — TS Compiler scan.
7. `cli/client/channel.ts` — supervisor-side protocol.
8. `cli/client/runner.ts` — fork + `RunSession`.
9. `cli/client/index.ts` — `createOmkitClient` façade.
10. `cli/commands/{ls,check,run}.ts` — thin adapters (run = inherit-stdio).
11. `cli/commands/ui.ts` (thin launcher) + `cli/ui/app.tsx` + `views/` — Ink frontend (search, run, live log, prompt).
12. `cli/commands/init.ts` — scaffolder + templates.
13. `cli/index.ts` — bin: `parseArgs`, lazy `import()` per command.

**`package.json`:** add `bin`, extend `exports` (`.`, `./actions`; keep `cli`/`ui` out of the runtime graph), add `ink`/`react`/`tsx` deps.

---

## 11. Explicitly out of scope (this spec)

- The **MCP layer** (client + server, tools/prompts/resources) — the next target. This design keeps the client SDK and interaction channel reusable by it with zero engine changes, but does not build it.
- A **long-running omkit daemon** / socket transport — the client is transport-agnostic so this stays possible, but is not designed or built now.
- **Running actions standalone** (synthetic-om wrapping, arg/capability wiring).
- The tskb-style **browser explorer** — omkit's interactive surface is the terminal (Ink), not a browser.
