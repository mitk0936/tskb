---
name: tskb
description: "Uses the tskb knowledge graph to understand codebase structure, locate concepts, and find relevant files. Use when exploring unfamiliar areas or before structural changes."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Architecture Explorer

This project uses **TSKB**, a semantic knowledge graph of the codebase. It captures architectural intent, constraints, and structural relationships that filesystem exploration alone will miss.

## When to Use TSKB

Query TSKB when entering an **unfamiliar area** of the codebase or when the task could have **architectural implications**. The graph captures developer intent, constraints, and structural relationships that file reading alone will miss.

- **Orientation** — Use `search`, `ls`, or `context` to understand where things are and how they connect.
- **Before structural changes** — Check for constraint docs that define rules you must follow.
- **Skip for focused tasks** — If you already know which file to edit and the change is localized, go straight to the code.

## Commands

```bash
npx --no -- tskb search "<query>" --plain                    # Fuzzy search across the entire graph
npx --no -- tskb pick "<identifier>" --plain                  # Detailed info on any node (by ID or path)
npx --no -- tskb context "<identifier>" --depth=2 --plain     # Node + neighborhood + docs (BFS traversal)
npx --no -- tskb ls --depth=4 --plain                         # Folder hierarchy
npx --no -- tskb docs "<query>" --plain                       # Search docs
```

Drop `--plain` for JSON output. Use `--optimized` for compact JSON (no whitespace).

## Response Shapes

All paths are relative to where `tskb build` was run and can be used directly to read files.

- **search**: Ranked results with graph-aware scoring. Results are boosted when they are graph neighbors of higher-ranked results. Scores are relative to the top result (1.0 = best match). Folders include `structureSummary`, modules and exports include `morphologySummary`, modules include `importsSummary`. Use `pick` on any `nodeId` for full details.
- **pick**: Type-specific detail. Modules and exports include `morphology` (code stubs with source line ranges, e.g. `// :42-68`) and `morphologySummary`. At module level, interfaces are collapsed to `{ ... }` — pick the specific export for full details. Modules show only library and tskb-referenced imports (local imports without refs are summarized as a count), plus `importsSummary` and `importedBy`. Exports include `parent` with `morphologySummary` when the parent is a module (shows what else the module exports). Folders include `children`, `structureSummary`, and `packageName` (if the folder is an npm package root). Docs include `content`. All types include `referencingDocs` — constraint docs in this list **MUST** be read.
- **context**: Graph neighborhood traversal via BFS across all edge types (contains, belongs-to, imports, related-to). Returns connected nodes up to the specified depth, with all referencing docs and constraints surfaced at top level. Use for understanding what connects to a node — not just its structural children.
- **ls**: Essential docs first, then folder hierarchy with `structureSummary`.
- **docs**: Lists or searches all docs. Use `pick` on a doc `nodeId` to get full content.

## Graph Concepts

- **Folder**: Logical grouping (feature, layer, package). Has ID, description, filesystem path.
- **Module**: A source file. Linked to parent folder via belongs-to edges and to other modules via imports edges.
- **Export**: A specific function, class, type, or constant from a module. Type-checked via `typeof import()`.
- **File**: A non-JS/TS file (README.md, yml configs, etc.). Has ID, description, filesystem path.
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
