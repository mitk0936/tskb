# omkit generated skill — design (Spec C)

**Date:** 2026-08-05
**Status:** draft, pending review
**Package:** `packages/omkit`
**Depends on:** Spec B's registration fork — `2026-07-29-omkit-mcp-server-design.md`.
**Not** the MCP server itself; see Dependency below.

## Problem

An agent arriving at a repo cannot tell what workflows it can run. `omkit ls` prints
names and file basenames. To learn what `tskb:build` _does_, or what arguments it
takes, the agent must open the om file and read it.

Spec A added `.describe({ summary })` for exactly this, and shipped **no reader** —
the value is stored on the definition and consumed by nothing. Spec B adds
`list_oms`, which reads it at runtime, but pays for that with a round trip: B's own
accepted trade-off is that `run_om`'s input schema can only be `{ name, args }`, so
**an agent must call `list_oms` before it can build arguments for anything**.

A skill file is in context before the first tool call. Generating one removes the
round trip, gives `.describe()` its reader, and — because it also documents the shell
invocation — works for agents with no MCP wiring at all.

## Goals

- An agent knows what is runnable, what each workflow does, what arguments it takes,
  and how to invoke it, **before** its first call.
- The map is useful with or without the MCP server running.
- `.describe()` gains a consumer. So does `omkit ls`.
- Generation executes no user workflow.

## Non-goals

- One skill per om. A single file, per C2.
- Replacing `list_oms`. At runtime the registry is authoritative; the skill is
  orientation that can drift.
- Documenting oms and actions that are not exposed. Same opt-in rule as Spec B.
- Authoring or editing workflows through the skill.

## Constraints

From the existing code:

1. **Summaries and schemas exist only after import.** `.describe()` and `.args()`
   values are held on the builder at module-evaluation time; the AST scan in
   `client/discovery.ts` cannot see them. This is what forces the dependency on Spec
   B's registration fork.

2. **Generated skill files are never hand-edited.**
   `docs/src/tskb/constraints/constraint-skill-generation.tskb.tsx` governs this for
   tskb's own skills; the same rule binds ours. The file carries a generated-by
   header and regeneration is the only supported edit.

3. **`ExecutionTree.require()` throws outside a run** (action.ts:59, action.ts:97),
   so an action-backed entry is only callable through a host om — the same sharp edge
   Spec B documents. The skill must not present such actions as independently
   runnable without that caveat.

4. **Run identity is a contract.** `run-folder-identity.tskb.tsx`. The skill's "where
   output lands" section describes `logs/<name>-<hash8>/<date>/<time>/` and must not
   imply any other addressing scheme.

## Dependency

C needs **only** `discoverRegistrations()` — Spec B's fork that imports candidate
files with `OMKIT_DISCOVER=1`, collects registrations, and exits. It does not need
the MCP server, its tools, its resources, or the SDK.

That has a sequencing consequence worth stating: the fork could land on its own, and
**C could ship before the MCP server**. Three consumers then share one mechanism —
`list_oms`, this skill, and `omkit ls`.

## Decisions

| #   | Decision                                                                   | Rationale                                                                                                   |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| C1  | `omkit skill` — an explicit command                                        | Generation is a deliberate act, not a side effect of `ls`. Mirrors `build:docs` owning tskb's skills        |
| C2  | One file, not one per workflow                                             | Skill sprawl costs more than file length. `tskb-toc` is one file for a whole monorepo                       |
| C3  | Committed, not gitignored                                                  | An agent cloning the repo gets the map with no build step, exactly as `.claude/skills/tskb-toc/` does today |
| C4  | Document the shell path **and** the MCP path                               | The shell path always works; MCP is an optimisation. A skill documenting only MCP is dead weight without it |
| C5  | Oms and actions both listed, each gated on `.mcp()`                        | "Callable" is the criterion, not "is an om". Same opt-in as Spec B; actions carry the host-om caveat inline |
| C6  | Each entry carries path, authored summary, and an outline of what it calls | Summary says intent; the outline says what actually happens, without opening the file                       |
| C7  | Arg shapes reuse `shapeHint`                                               | Already built, already degrades to raw JSON Schema for shapes it cannot sketch                              |
| C8  | A content hash marks staleness                                             | A committed generated file drifts silently; the hash makes drift detectable by a hook or a reader           |
| C9  | `omkit ls` renders summaries from the same registry                        | Closes Spec A's open follow-up at near-zero marginal cost                                                   |

## The generated artifact

Written to `.claude/skills/omkit-runs/SKILL.md`, relative to the project root that
owns the tsconfig — overridable with `--out` for consumers whose layout differs.

````markdown
---
name: omkit-runs
description: Runnable workflows in this repo (oms and actions) — what each does, its
  arguments, and how to run it. Load before running or debugging any project
  workflow.
---

# omkit — runnable workflows

<!-- GENERATED by `omkit skill`. Do not edit. registry-hash: a1b2c3d4 -->

## How to run

**Shell — always available:**

```bash
OMKIT_ARGS='{"verbose":false}' npx omkit run tskb:build
```

**MCP — if configured:** `run_om("tskb:build", { verbose: false })` for settling
workflows, `start_om(...)` for long-lived ones.

To wire up MCP: `claude mcp add omkit -- npx omkit mcp`

## Workflows

### `tskb:build` — settling

Rebuild the tskb knowledge graph from this repo's .tskb.tsx docs.

- **Defined in:** `om/oms/tskb-build.ts`
- **Args:** `{ verbose?: boolean, projectName?: string }`
- **Calls:** `watchDir` [watch:build:daemon] → `buildDocs` [build]

### `tskb:dev` — long-lived · `start_om` only

Bring up the tskb dev stack: watchers, explorer server, and a browser.

- **Defined in:** `om/oms/tskb-dev.ts`
- **Args:** `{ runTests?: boolean, headless?: boolean, port?: number }`
- **Calls:** `prompt` → `command` [tskb:tests] → `command` [watch:docs:daemon] →
  `command` [watch:tskb:lib:daemon] → `command` [server:explorer:daemon] →
  `healthcheck` [explorer:ready:gate] → `browser` [browser:chrome] →
  `chromePage` [browser:explorer] → `inspectPage` [explorer:inspect]

## Where output lands

`logs/<name>-<hash8>/<date>/<time>/` — `main.log`, `result.json`, `artifacts.log`,
`events.log`, `asserts.log`, `raw.jsonl`. A run's identity is its name plus its
defining file, so "the latest run of X" is always resolvable without parsing
scrollback.
````

### Entry shape

Per C6, each entry carries four things:

| Field       | Source                                | Notes                                                              |
| ----------- | ------------------------------------- | ------------------------------------------------------------------ |
| **Path**    | `DiscoveredOm.file`, project-relative | Lets an agent open the real thing when the summary is not enough   |
| **Summary** | `.describe({ summary })`, authored    | Absent → the entry says so rather than inventing prose             |
| **Args**    | `shapeHint(toJsonSchema(schema))`     | Absent `.args()` → omitted. Unsketchable → raw JSON Schema, per C7 |
| **Calls**   | AST outline of the body (below)       | Explicitly an approximation                                        |

### The "calls" outline

Derived statically by walking the `.run(body)` callback: collect called identifiers
that resolve to an omkit action import or a local action module, paired with any
`.tag("…")` string literal on the same chain.

Tags are the right signal because they are already an authored outline — this repo's
oms tag nearly every step (`watch:build:daemon`, `explorer:ready:gate`,
`browser:chrome`), so the tag names read as a description of the run written by the
person who wrote it.

**This is an outline, not a contract, and must be labelled as one.** A conditional
call appears unconditionally; a loop appears once; an action chosen dynamically does
not appear at all. It answers "roughly what happens in here" and nothing stronger.
Where the walk finds nothing recognisable, the field is omitted rather than shown
empty.

### Frontmatter

`description` is the skill-loading trigger, so its wording decides whether an agent
loads the file at the right moment — a generated summary of _contents_ ("lists 2
oms…") is the wrong shape, because the field needs to say _when to use this_.

So it is **authored, with a generated fallback**: `omkit skill` preserves an existing
`description` across regeneration and only writes the fallback when creating the file
fresh. The fallback:

> Runnable workflows in this repo (oms and actions) — what each does, its arguments,
> and how to run it. Load before running or debugging any project workflow.

### Actions

Listed under a separate `## Actions` heading, only when `.mcp()`-marked, each
carrying the host-om caveat from constraint 3. An action declared with `.ref<H>()`
publishes a capability to downstream actions and, run standalone, hands it to nobody
— those carry an explicit warning, matching Spec B's "poor tools" note.

## `omkit ls`

`formatRegistry` (`cli/commands/ls.ts`) currently prints `name  basename:line`. It
gains the summary when present, and an `[mcp]` marker alongside the existing
`[ref, events]` suffix:

```
oms (2)
  tskb:build  tskb-build.ts:28  [mcp]
    Rebuild the tskb knowledge graph from this repo's .tskb.tsx docs.
  tskb:dev  tskb-dev.ts:45  [mcp, long-lived]
    Bring up the tskb dev stack: watchers, explorer server, and a browser.
```

**`ls` stays AST-only by default.** Summaries require the fork, so plain `omkit ls`
prints what it always did, and `omkit ls --describe` opts into the fork. Making the
default path slower to add prose would trade a documented property — "`discover()`
stays AST-only and instant" — for cosmetics.

## Staleness

The generated header carries `registry-hash: <8 hex>`, a hash over the registration
set (names, summaries, arg schemas, modes, paths) — deliberately **not** over the
rendered markdown, so a formatting change does not read as drift.

`omkit skill --check` exits non-zero when the file's hash does not match a fresh
registry. That makes it usable in a pre-commit hook or CI without prescribing either.

Regeneration must be deterministic: stable ordering (oms then actions, each
alphabetical), no timestamps, no absolute paths. A generated file that is committed
and churns on every run is a file people stop reading.

## Testing

Per `constraint-test-coverage.tskb.tsx`; unit tests colocated in
`packages/omkit/tests/unit/`.

- **Generation** — an om with `.describe()` and `.args()` renders summary and arg
  shape; one without `.describe()` renders the absent-summary form rather than
  fabricating prose; an unexposed om is omitted entirely.
- **Determinism** — generating twice over an unchanged registry is byte-identical.
  Ordering is stable when discovery order changes.
- **Unsketchable args** — a schema `shapeHint` cannot sketch falls back to raw JSON
  Schema, and one that `toJsonSchema` cannot convert at all (`z.date()`) degrades
  that entry rather than failing generation — the same per-entry isolation Spec B
  requires of `list_oms`.
- **Calls outline** — a body calling two tagged actions lists both with tags; a body
  with nothing recognisable omits the field; a conditional call is present (proving
  the documented approximation, so the limitation is pinned rather than assumed).
- **Frontmatter** — an authored `description` survives regeneration; a fresh file
  gets the fallback.
- **Staleness** — `--check` passes on a fresh file, fails after a summary changes,
  and **passes after a whitespace-only edit to the rendered body**, proving the hash
  covers the registry rather than the markdown.
- **`ls`** — `--describe` shows summaries; plain `ls` neither shows them nor forks.

## Risks

| Risk                                                                                 | Mitigation                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| A committed generated file churns diffs on every om edit                             | Deterministic ordering, no timestamps; hash covers the registry, not the rendering                              |
| The outline misleads, being a static approximation                                   | Labelled as an outline in the file itself; a test pins the conditional-call limitation                          |
| The skill drifts from the code and is trusted anyway                                 | `registry-hash` + `--check`; the file states that `list_oms` is authoritative at runtime                        |
| Generation imports user code                                                         | Inherited from Spec B's fork: a throwaway child, failures soft-degrade to warnings                              |
| A skill that lists executable workflows widens what an agent will attempt unprompted | Exposure stays opt-in via `.mcp()`; the file documents invocation, and wiring MCP stays a deliberate human step |

## Deferred

- **Per-workflow reference files.** tskb's skills emit `references/*.md` alongside
  `SKILL.md` for topics too large to inline. If a project's workflow list outgrows
  one file, that pattern is the precedent — but a repo with three oms does not need
  it, and building it now guesses at a shape nobody has hit.
- **Regeneration on watch.** A natural fit with the existing watch mode, but v1
  generates on demand and detects drift with `--check`.
- **Emitting Copilot instructions** (`.github/instructions/`) alongside the skill,
  as `build:docs` does for tskb. Same generator, different target; deferred until
  someone wants it.
- **Recipes / worked examples in the skill.** Tempting, but they are authored
  content that a generator would either fabricate or force into `.describe()`.
