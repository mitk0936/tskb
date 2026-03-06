---
name: tskb
description: "IMPORTANT: Always invoke this skill BEFORE planning, exploring, or making code changes. Uses the tskb knowledge graph to understand codebase structure, locate concepts, and find relevant files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Architecture Explorer

This project uses **TSKB**, a semantic knowledge graph of the codebase.

**You MUST query TSKB before touching any area of the codebase** — not just once per task, but each time your work moves to a different folder, module, or concept. Re-query when you shift focus mid-task. The graph captures developer intent and constraints that file reading alone will miss.

## Workflow — READ THIS FIRST

**Query TSKB every time you touch a new area** — not just at the start of a task. When your work moves to a different folder, module, or concept, query TSKB again before reading files. The graph captures developer intent, constraints, and structural relationships that filesystem exploration alone will miss.

1. **Query before touching** — Run `search`, `pick`, or `context` for the area you're about to touch. Do this each time you move to a new part of the codebase, even mid-task.
2. **Read docs and constraints** — Check `referencingDocs` in results. Constraint docs **MUST** be read and followed.
3. **Fall back to files only if TSKB has no coverage** — If no registered nodes or docs reference the area, use filesystem exploration. Consider suggesting doc updates.
4. **Act** — Make architecturally coherent changes based on what you learned.

Do NOT skip step 1 and jump straight to reading files — you risk missing documented intent and constraints.

## Commands

```bash
npx --no -- tskb search "<query>" --optimized                    # Fuzzy search across the entire graph
npx --no -- tskb pick "<identifier>" --optimized                  # Detailed info on any node (by ID or path)
npx --no -- tskb context "<identifier>" --depth=2 --optimized     # Node + neighborhood + docs (BFS traversal)
npx --no -- tskb ls --depth=4 --optimized                         # Folder hierarchy
npx --no -- tskb docs "<query>" --optimized                       # Search docs
```

Drop `--optimized` for human-readable output.

## Response Shapes

All paths are relative to where `tskb build` was run and can be used directly to read files.

- **search**: Ranked results. Folders include `structureSummary`, modules and exports include `morphologySummary`, modules include `importsSummary`. Use `pick` on any `nodeId` for full details.
- **pick**: Type-specific detail. Modules and exports include `morphology` (code stubs) and `morphologySummary`. Modules include `imports` (with `moduleId` when the target is a registered module) and `importsSummary`. Folders include `children` and `structureSummary`. Docs include `content`. All types include `referencingDocs` — constraint docs in this list **MUST** be read.
- **context**: Node neighborhood with all referencing docs and constraints surfaced at top level.
- **ls**: Essential docs first, then folder hierarchy with `structureSummary`.
- **docs**: Lists or searches all docs. Use `pick` on a doc `nodeId` to get full content.

## Graph Concepts

- **Folder**: Logical grouping (feature, layer, package). Has ID, description, filesystem path.
- **Module**: A source file. Linked to parent folder via belongs-to edges and to other modules via imports edges.
- **Export**: A specific function, class, type, or constant from a module. Type-checked via `typeof import()`.
- **Term**: A domain concept or pattern. Not tied to a file.
- **Doc**: A `.tskb.tsx` documentation file. Has `explains`, `priority` (essential, constraint, supplementary), and references to other nodes.

## Folder Structure

- **__TSKB.ROOT__** (`.`) — The root directory (automatically added by tskb)
  - **docs** (`docs`) — A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration. [1 folder, 1 file]
    - **examples.taskflow-app** (`examples/taskflow-app`) — Example application, not meant to be run, but used as reference for example docs [3 folders, 7 files]
  - **packages** (`packages`) — A folder that contains independent packages in the repo (npm worskspace) [1 folder]
    - **TSKB.Package.Root** (`packages/tskb`) — The root folder of the package, with its package.json and main npm README.md [2 folders, 4 files]
  - **references** (`references`) — A folder that contains git tracked references used for documentation illustration purposes, referenced on npm [2 files]

## Documentation

- `docs/src/tskb/cli/logging.tskb.tsx` — CLI logging: stderr-only output, --verbose flag, timing support
- `docs/src/tskb/main.tskb.tsx` — Architecture, API surface, and usage flow of the TSKB library
- `docs/src/tskb/runtime/runtime.tskb.tsx` — Runtime module structure: JSX primitives and registry type definitions
- `docs/src/tskb/typescript/typescript.tskb.tsx` — TypeScript Program creation for static analysis without compilation

_Plus 12 supplementary docs available via `npx --no -- tskb docs --optimized`._

Constraint docs define architectural rules that **MUST** be followed when working on related code.
