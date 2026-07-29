# omkit MCP server — design (Spec B)

**Date:** 2026-07-29
**Status:** approved, ready for planning
**Package:** `packages/omkit`
**Depends on:** Spec A — `2026-07-29-omkit-runtime-primitives-design.md`

Spec A supplies the om builder, `.describe()`, `.args(schema)`, arg resolution,
`ctx.artifact`, and the `multiline` prompt kind.

**This spec adds no new runtime primitives.** It lives in a new `mcp/` boundary and
consumes what A provides. It does touch `core/` in exactly two narrow places, both
listed under Changed files: the `.mcp({ mode })` marker on the builder, and the
`OMKIT_DISCOVER` guard that makes `.run` register instead of launch. `output/` is
untouched.

## Problem

omkit runs developer workflows and narrates each run to disk, but the only way to
drive it is a human at a terminal. An assistant that wants to run a smoke suite,
read why it failed, or open a screenshot has to shell out and scrape stdout.

Expose omkit over the Model Context Protocol so Claude and other assistants can
discover the runnable oms in a project, run one, get a verdict, and read the
artifacts the run produced.

## Goals

- An assistant can list the oms and actions a project chooses to expose.
- It can run one and receive a structured verdict (ok/failed, assert tally, summary).
- It can read that run's artifacts — logs, `result.json`, snapshots, screenshots.
- Exposure is opt-in: nothing is visible to MCP unless its author says so.

## Non-goals

- Authoring or editing om files through MCP.
- A network-reachable server (stdio only — see B6, and Deferred for `--port`).
- Replacing the CLI or the Ink app. This is a third frontend, not a successor.

## Constraints

From the existing code:

1. **Discovery never imports user code.** `client/discovery.ts` is a pure
   TypeScript AST scan, finding `om("name", …)` calls and
   `export const x = action("name")…` chains, recording only _whether_ `.ref` /
   `.emits` appear (`actionChain`, discovery.ts:140-163).

2. **Importing an om file runs it.** `om(name).args(…).run(body)` executes at module
   load, by design (Spec A §1), so no om module can be loaded merely to read its
   metadata. **This is the constraint that forces the `OMKIT_DISCOVER` fork below** —
   were import free of side effects, discovery would be an ordinary import with no
   child process.

3. **Actions cannot run standalone.** `ExecutionTree.require()` (action.ts:39)
   throws outside a run, so an action-as-tool needs a host om.

4. **Runs are long-lived and can talk back.** Oms start servers, watch, and drive
   Chrome. A run can raise a `PromptRequest` over the interaction channel.

5. **Run folders are already agent-shaped.** `logs/<name>-<hash8>/<date>/<time>/`
   with `result.json`, `raw.jsonl`, `main.log`, per-action logs, and rollups.
   `main.log`'s legend block exists explicitly "so an agent can follow the run"
   (NodeLogWriter.ts:50-59).

6. **Run identity is a contract.** `run-folder-identity.tskb.tsx` (constraint):
   `omHash` keys on the om's name plus the absolute path of its **defining file**,
   captured from the call stack — never from `process.argv` or the entry script.

### MCP facts that shaped the design

Checked against the 2025-06-18 specification. One item carries a verification
caveat, flagged inline rather than left implicit.

- **A tool definition cannot express duration.** Its fields are `name`, `title`,
  `description`, `inputSchema`, `outputSchema`, `annotations`; `annotations` are
  behavioral-safety hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
  `openWorldHint`) with nothing about how long a call takes or whether it is
  asynchronous. So a client **cannot infer duration from `tools/list`**.

  This is what B5's per-om `mode` answers, and the two do not conflict: `mode`
  never travels as tool metadata. It decides which of the two entry tools accepts a
  given om, informs their `description` prose, and appears as a field in `list_oms`
  **results**. A client can therefore learn that `dev-server` is long-lived — by
  calling `list_oms`, not by reading annotations.

  > Verification note: the field list is confirmed against the 2025-06-18 spec, as
  > is the absence of any duration/async hint. The four annotation names are carried
  > from prior knowledge and were not re-confirmed against the published
  > `ToolAnnotations` type — confirm before relying on that list being exhaustive.
  > Nothing in this design depends on it beyond "none of them means long-running".

- **Progress notifications** are the sanctioned mechanism for long calls: the client
  supplies a `progressToken` in `_meta`, the server emits `notifications/progress`
  with a monotonically increasing `progress`, an optional `total`, and a
  human-readable `message`. `total` MAY be omitted when unknown.
- **Timeouts are client-side.** The spec only says clients SHOULD implement them.
  Whether a client extends its deadline on progress is implementation-dependent, so
  the design must not assume progress buys unlimited time.
- **Cancellation** is `notifications/cancelled` for an in-flight request.
- **Elicitation** lets a server request user input mid-request.
- **Tool results may return `resource_link` items** instead of inlined content.
- **The MCP Inspector speaks stdio**, spawning the server as a subprocess
  (`npx @modelcontextprotocol/inspector npx omkit mcp`). Its ports (UI 6274, proxy 6277) are its own; the inspected server needs none.

## Decisions

| #   | Decision                                     | Rationale                                                                                                                                     |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | MCP server is a frontend over `OmkitClient`  | `client.tskb.tsx` (essential): every frontend goes through the client. `discover` / `run` / `runBare` / `check` is already the needed surface |
| B2  | Generic tools + opt-in filter                | Tool list stays fixed as files change; only oms marked `.mcp()` are listed                                                                    |
| B3  | Entry point split by mode, not by om         | Lets each tool carry a precise `outputSchema` instead of a shape that varies with which om was named                                          |
| B4  | Metadata read via a discovery fork           | Real zod schemas; side effects isolated in a throwaway child                                                                                  |
| B5  | `mode` declared per om                       | MCP cannot express duration, so omkit does                                                                                                    |
| B6  | stdio only                                   | Covers Claude Code, Claude Desktop, and the Inspector. No port, no auth surface                                                               |
| B7  | Actions hosted by a shipped `action-host.ts` | Satisfies run-folder identity literally, with no forging primitive                                                                            |

## Architecture

```
                    ┌─────────────────────────────┐
   MCP client  ───▶ │  omkit MCP server (stdio)   │  ← new boundary
 (Claude Code,      │  packages/omkit/src/mcp/    │
  Inspector)        └──────────────┬──────────────┘
                                   │ createOmkitClient()
   omkit CLI / Ink app ────────────┤
                                   ▼
                        packages/omkit/src/client
                     discover · run · runBare · check
                                   │ fork
                                   ▼
                      om child process → run folder
```

### New files — `packages/omkit/src/mcp/` (new tskb boundary)

| File                  | Responsibility                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `server.ts`           | Assembles the `McpServer`, registers tools and resources, binds stdio                                                                |
| `tools.ts`            | Registry entries → tool registrations; the settling/long-lived split                                                                 |
| `resources.ts`        | Run folders → resources; URI templates and path confinement                                                                          |
| `progress.ts`         | `session.on("log")` → `notifications/progress`; `notifications/cancelled` → `session.cancel()`; `session.on("prompt")` → elicitation |
| `action-host.ts`      | The shipped host om for action-backed tools                                                                                          |
| `cli/commands/mcp.ts` | Thin `omkit mcp` command, lazily imported like the existing commands                                                                 |

### Changed files

| File                           | Change                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `core/om.ts`, `core/action.ts` | `.mcp({ mode })` on the builder; `.run` registers instead of launching under `OMKIT_DISCOVER` |
| `client/discovery.ts`          | Add `discoverRegistrations()` alongside the AST scan                                          |
| `client/registry.ts`           | `DiscoveredOm` / `DiscoveredAction` carry metadata                                            |
| `client/types.ts`              | `RunOptions` gains `env?: Record<string, string>`                                             |

`@modelcontextprotocol/sdk` is imported only under `mcp/`. Nothing in `core/`,
`client/`, or `output/` learns that MCP exists, so an om file never imports it and
the runtime is unchanged for anyone not using the server.

## Exposure and mode

Spec A's builder gains one MCP-specific method:

```ts
om("smoke-test")
  .describe({ summary: "Boot the app and run the smoke suite" })
  .args(z.object({ headless: z.boolean().default(true) }))
  .mcp({ mode: "settling" })
  .run(async (ctx, args) => {
    /* … */
  });
```

- **`.mcp()` marks the om as exposed.** Absent, it is invisible to the server —
  `.describe()` and `.args()` alone do not expose anything.
- **`mode` defaults to `"settling"`.** Being wrong that way surfaces as a timeout
  error rather than a silently orphaned process.
- Actions use the same method, with the same meaning. Most settle; a `watch`- or
  server-shaped action must declare `mode: "long-lived"`.

## Tool surface

Six tools, fixed regardless of how many oms a project has.

| Tool                       | Returns                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_oms`                 | Exposed oms and actions: name, summary, mode, JSON Schema for args                                                                            |
| `run_om(name, args)`       | Verdict: `ok`, run folder, summary lines, assert tally                                                                                        |
| `start_om(name, args)`     | Handle: run folder + run id, returned immediately                                                                                             |
| `get_run(folder)`          | Status, verdict if settled, artifact listing as `resource_link`s                                                                              |
| `tail_run(folder, cursor)` | Log lines since `cursor` (the `LogStore` global sequence) — from the live session while running, otherwise from the settled run's `raw.jsonl` |
| `cancel_run(folder)`       | Confirmation                                                                                                                                  |

`run_om` blocks until the run settles and **rejects a long-lived om by name**.
`start_om` accepts any om, so it also serves "start this long suite and come back".

### During a `run_om` call

- `session.on("log")` → `notifications/progress`. `message` carries the milestone
  text; `progress` increments off the `LogStore` sequence; `total` is omitted,
  which the spec permits.
- `notifications/cancelled` → `session.cancel()`. The run tears down normally and
  still writes its folder.
- `session.on("prompt")` → elicitation; the answer returns via
  `session.answer(id, value)`; `promptDone` withdraws it. prompt.ts:146 already
  describes its supervisor as "whoever owns the terminal (Ink app / MCP client)".

Because the server validates args and applies defaults **before** spawning, Spec A's
prompt-based resolution is normally dormant under MCP. Were `OMKIT_ARGS` ever
incomplete, the prompt would surface through this same elicitation path — the same
mechanism, not a special case.

### Accepted trade-off

`run_om`'s `inputSchema` can only be `{ name: string, args: object }`, so per-om zod
schemas are **not** enforced client-side. The server validates at call time and
returns `isError: true` with the validation message. Claude must call `list_oms`
first to learn what `args` to build. This is the cost of a tool list that does not
churn when a file changes.

## Resources

Two URI templates, published via `resources/templates/list`:

```
omkit://runs/{run}/latest/{file}          → newest run of that om
omkit://runs/{run}/{date}/{time}/{file}   → one specific run
```

`{run}` is the `<name>-<hash8>` folder name. Discovery is a filesystem scan of
`logs/` — no registry involvement.

`{file}` covers what `ExecutionTree` finalize writes (ExecutionTree.ts:302-306):
`main.log`, per-action `<name>.log`, `events.log`, `asserts.log`, `snapshots.log`,
`artifacts.log` (Spec A), `result.json`, `raw.jsonl`, plus anything the om wrote to
`artifactsFolder`.

The `latest` template is the payoff of the run-folder-identity constraint, whose
stated purpose is that "a script or an assistant can always find 'the latest run of
X' without parsing scrollback."

MIME types derive from the extension: `application/json`, `text/plain`,
`application/x-ndjson`, `image/png` for screenshots (returned as a base64 `blob`).

Tool results return `resource_link` items rather than inlining content, so Claude
reads only what it needs — `raw.jsonl` on a long run is large. Artifacts registered
via Spec A's `ctx.artifact` become links carrying a real name and description
instead of a bare filename, and MCP's resource annotations (`audience`, `priority`)
become expressible for them. Unregistered files are still listed, just unlabelled.

### Safety rules

1. Every resolved path is confined under the project's `logs/` root. Anything
   escaping via `..` or a symlink is refused. URIs are untrusted input.
2. Reads are size-capped with explicit truncation markers.
3. Read-only. No write path, no deleting run folders through MCP.

## Discovery

Two phases. The cheap one is unchanged.

**Phase 1 — AST scan (existing).** Identifies files importing `"omkit"` that call
`om` / `action`, narrowing phase 2 to files that could possibly register. **The
existing visitor needs no change for the builder**: `om("smoke-test")` is still a
call expression with a string-literal first argument, whether or not a chain follows
it (discovery.ts:39-48). Since Spec A removes `om(name, body)`, there is exactly one
shape to match.

**Phase 2 — registration fork (new).** One throwaway child imports only those files
with `OMKIT_DISCOVER=1`. In that mode `.run(body)` **registers instead of
launching**, posts registrations over IPC, and exits. There is no second form to
guard — the builder is the only way to define an om.

`discover()` stays AST-only and instant — `omkit ls` never executes user code and
does not get slower. A new `discoverRegistrations()` does the fork, called only by
the MCP server.

**Failure stays soft.** discovery.ts:12-17 documents that type errors degrade to
`warnings` and only fatal config problems throw. The fork keeps that contract: a
file that throws on import becomes a warning and the other oms still serve.

Zod → JSON Schema conversion for `list_oms` happens in the child, reusing
`core/schema-json.ts` from Spec A — which owns that converter and the decision of
whether Zod v4's native `z.toJSONSchema` or `zod-to-json-schema` is used. Nothing
new is added here.

## Argument delivery

`OMKIT_ARGS` carries JSON on the child's env — the same channel Spec A's resolution
reads from, so nothing here is MCP-specific beyond who sets it.

The server validates against the declared schema _before_ spawning and passes the
parsed, defaults-applied value, so bad args fail as a clean MCP error rather than a
crashed child.

## Action-backed tools

An action is a tool only if it carries `.mcp()`. Spec A's `.args(schema)` pins its
first parameter, so an action-backed tool takes a single object — **an existing
multi-positional-arg action cannot become a tool without that signature change.**

omkit ships a real host module, forked as the om file:

```ts
// packages/omkit/src/mcp/action-host.ts
const file = process.env.OMKIT_ACTION_FILE!;
const name = process.env.OMKIT_ACTION_NAME!;
const args = JSON.parse(process.env.OMKIT_ARGS ?? "{}");

om(`${name}@${shortHash(file)}`, async (ctx) => {
  const mod = await import(pathToFileURL(file).href);
  await mod[process.env.OMKIT_ACTION_EXPORT!](args).result;
});
```

**Nothing is forged.** `callerSite()` captures `action-host.ts`, which genuinely is
where the run is defined. The disambiguator lives in the **name** —
`omHash("seed-db@a1b2c3d4", ".../mcp/action-host.ts")` is stable across runs, and
two same-named actions in different files get different `@hash` suffixes and
therefore different folders. That satisfies constraint 6's first rule through the
name rather than around it, and avoids introducing an escape hatch that would let
any caller claim another run's identity.

Runs land at `logs/seed-db@a1b2c3d4/<date>/<time>/`, in the same tree as om runs and
reachable through the same URI templates. No prefix distinguishes action folders;
the `@hash` suffix already reads distinctly.

**Known sharp edge:** an action declared with `.ref<H>()` publishes a capability for
downstream actions. Standalone it does its work and hands the capability to nobody —
`chromePage` would attach to Chrome and return nothing useful. Such actions are poor
tools. Documented, not prevented.

## Testing

Per `constraint-test-coverage.tskb.tsx`; unit tests colocated in
`packages/omkit/tests/unit/`.

- **Discovery fork** — registers without launching; a throwing file degrades to a
  warning; `discover()` remains AST-only.
- **Tools** — `run_om` rejects a long-lived om; arg validation returns `isError`;
  `start_om` returns a handle immediately; `list_oms` omits oms without `.mcp()`.
- **Progress and cancellation** — milestones become progress notifications with a
  monotonic `progress`; `notifications/cancelled` tears the run down and still
  writes its folder.
- **Resources** — path traversal outside `logs/` is refused; `latest` resolves to
  the newest run; size caps truncate; curated artifacts carry name and description.
- **Action host** — identity is stable across runs; same-named actions in different
  files diverge.

## Risks

| Risk                                               | Mitigation                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Discovery fork executes user module top-level code | Isolated in a throwaway child; `discover()` and `omkit ls` unaffected                    |
| Discovery latency on every server start            | Cache the registry for the process; re-discover on demand                                |
| A settling om that never settles                   | Timeout backstop reports it as an error, surfacing the bug                               |
| Client timeout shorter than a legitimate run       | Progress helps but is not guaranteed to extend deadlines; `start_om` is the escape hatch |
| Resource reads leak files outside the project      | Path confinement under `logs/`, enforced on every read                                   |

## Deferred

- `resources/subscribe` + `notifications/resources/updated` for live-tailing
  `main.log`. `tail_run` covers the need; subscriptions add bookkeeping.
- Re-discovery on file change + `notifications/tools/list_changed`. Natural fit with
  the existing watch mode, but v1 discovers at startup and on demand.
- Streamable HTTP transport (`--port`). Add if a shared or remote server proves
  necessary; it drags in binding, origin checks, and session management.
- **MCP's `prompts` primitive** (`prompts/list` / `prompts/get`) — user-invoked
  templates, the third primitive alongside tools and resources. Distinct from
  omkit's `prompt` battery (which maps to elicitation). Deferred because there is no
  concrete use for an omkit prompt template yet, and guessing one produces a
  primitive nobody invokes.
  (`om(name, body)` is not listed here — Spec A removes it outright rather than
  deferring the removal.)
