---
name: tskb
description: "IMPORTANT: Always invoke this skill BEFORE planning, exploring, or making code changes. Uses the tskb knowledge graph to understand codebase structure, locate concepts, and find relevant files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Architecture Explorer

This project uses **TSKB**, a semantic knowledge graph of the codebase.

**You MUST use this skill before:**
- Planning any implementation or refactoring
- Exploring unfamiliar parts of the codebase
- Making code changes (to understand what you're touching)
- Answering architecture questions

Use the commands below to query the graph — do NOT skip this and jump straight to reading files.

## Graph Concepts

The knowledge graph consists of these node types:

- **Folder**: Logical grouping in the codebase (feature, layer, package). Has an ID, description, and filesystem path.
- **Module**: A source file or unit of code. Linked to its parent folder via belongs-to edges.
- **Export**: A specific function, class, type, or constant exported from a module. Type-checked via `typeof import()`.
- **Term**: A domain concept, pattern, or piece of terminology. Not tied to a file — used to name ideas.
- **Doc**: A `.tskb.tsx` documentation file. References other nodes to create edges. Has an `explains` field and a `priority` (essential, constraint, or supplementary).

## Commands


List folder hierarchy:
```bash
npx --no -- tskb ls --depth=4
```

Get detailed info on any node (by ID or path):
```bash
npx --no -- tskb pick "<identifier>"
```

Search for concepts, modules, or folders:
```bash
npx --no -- tskb search "<query>"
```

List or search docs:
```bash
npx --no -- tskb docs
npx --no -- tskb docs "<query>"
```

Get full context for an area (node + neighborhood + docs):
```bash
npx --no -- tskb context "<identifier>" --depth=2
```

## Command Response Shapes

All paths in responses are relative to where `tskb build` was run. They can be used directly to read files or navigate the filesystem.

**search** returns ranked results. Folders include `structureSummary`, modules include `morphologySummary`. Use `pick` on any `nodeId` for full details.

**pick** returns type-specific detail:
- **Folder**: `node.children` lists filesystem contents — each child has `name` and, if registered, `nodeId` + `desc`. `node.structureSummary` gives counts.
- **Module**: `node.morphology` is a `string[]` of code stubs (function signatures, class/interface shapes with methods and fields). `node.morphologySummary` gives counts.
- **Doc**: `node.content` has full text inline.
- All types include `referencingDocs`. Constraint docs in this list **MUST** be read.

**context** returns a node's neighborhood (BFS traversal) with all referencing docs and constraints surfaced at top level.

**ls** returns essential docs first, then folder hierarchy with `structureSummary` on each folder.

**docs** lists or searches all docs. Use `pick` on a doc `nodeId` to get full content.
```

## Folder Structure

- **__TSKB.ROOT__** (`.`) — The root directory (automatically added by tskb)
  - **docs** (`docs`) — A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration. [1 folder, 1 file]
    - **examples.taskflow-app** (`examples/taskflow-app`) — Example application, not meant to be run, but used as reference for example docs [3 folders, 7 files]
  - **packages** (`packages`) — A folder that contains independent packages in the repo (npm worskspace) [1 folder]
    - **TSKB.Package.Root** (`packages/tskb`) — The root folder of the package, with its package.json and main npm README.md [2 folders, 4 files]
  - **references** (`references`) — A folder that contains git tracked references used for documentation illustration purposes, referenced on npm [2 files]

## Documentation

Each doc has an `explains` field describing its purpose. Use this to decide which docs to read.

- `docs/src/tskb/cli/logging.tskb.tsx` — CLI logging: stderr-only output, --verbose flag, timing support
- `docs/src/tskb/main.tskb.tsx` — Architecture, API surface, and usage flow of the TSKB library
- `docs/src/tskb/runtime/runtime.tskb.tsx` — Runtime module structure: JSX primitives and registry type definitions
- `docs/src/tskb/typescript/typescript.tskb.tsx` — TypeScript Program creation for static analysis without compilation

_Plus 12 supplementary docs available via `npx --no -- tskb search`._

## Constraints

Some docs are marked as **constraints** (`priority="constraint"`). These define architectural rules and invariants that **MUST** be followed when working on related modules or folders. When `pick` or `ls` shows a constraint doc referencing the area you're working on, **read it before making changes**.

## Workflow

1. **Orient** — Scan the folder structure above to find the relevant area
2. **Search** — Run `npx --no -- tskb search "<query>"` to find specific nodes
3. **Pick** — Run `npx --no -- tskb pick "<id>"` for full context on a node. Check for constraint docs.
4. **Explore** — Only then use file reading tools for implementation details not covered by the graph
5. **Act** — Make architecturally coherent changes based on what you learned
