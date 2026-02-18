---
name: tskb
description: "IMPORTANT: Always invoke this skill BEFORE planning, exploring, or making code changes. Uses the tskb knowledge graph to understand codebase structure, locate concepts, and find relevant files."
argument-hint: [query]
allowed-tools: Bash(npx tskb *)
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
npx tskb ls --depth=4
```

Get detailed info on any node (by ID or path):
```bash
npx tskb pick "<identifier>"
```

Search for concepts, modules, or folders:
```bash
npx tskb search "<query>"
```

Get full context for an area (node + neighborhood + docs):
```bash
npx tskb context "<identifier>" --depth=2
```

## Command Response Shapes

All paths in responses are relative to where `tskb build` was run. They can be used directly to read files or navigate the filesystem.

**search** returns ranked results across all node types:
```json
{ "query": "...",
  "results": [{ "type": "folder|module|export|term|doc", "id": "...", "desc": "...", "score": 0.85 }] }
```
Use `pick` on any result ID to get full details.

**pick** returns type-specific context for any node:
```json
{ "type": "folder", "node": { "id": "...", "desc": "...", "path": "..." },
  "parent": { ... }, "childFolders": [...], "modules": [...],
  "exports": [...], "referencingDocs": [{ "id": "...", "explains": "...", "priority": "..." }] }
```
Follow `referencingDocs` to find related documentation. Constraint docs in this list MUST be read.

**context** returns a node's full neighborhood with inline doc content:
```json
{ "root": { "id": "...", "type": "folder", "desc": "...", "resolvedVia": "id" },
  "nodes": [{ "id": "...", "type": "module", "desc": "...", "depth": 1 }],
  "docs": [{ "id": "...", "explains": "...", "priority": "...", "content": "...", "filePath": "..." }],
  "constraints": ["constraint-doc-id"] }
```
Use `context` to get everything about an area in one call. Constraints are surfaced at the top level.

**ls** returns the folder hierarchy and essential docs:
```json
{ "root": "...", "folders": [{ "id": "...", "desc": "...", "path": "..." }],
  "docs": [{ "id": "...", "explains": "...", "filePath": "..." }] }
```

## Folder Structure

- **__TSKB.ROOT__** (`.`) — The root directory (automatically added by tskb)
  - **docs** (`docs`) — A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration.
    - **examples.taskflow-app** (`examples/taskflow-app`) — Example application, not meant to be run, but used as reference for example docs
  - **packages** (`packages`) — A folder that contains independent packages in the repo (npm worskspace)
    - **TSKB.Package.Root** (`packages/tskb`) — The root folder of the package, with its package.json and main npm README.md
  - **references** (`references`) — A folder that contains git tracked references used for documentation illustration purposes, referenced on npm

## Documentation

Each doc has an `explains` field describing its purpose. Use this to decide which docs to read.

- `docs/src/tskb/main.tskb.tsx` — Architecture, API surface, and usage flow of the TSKB library
- `docs/src/tskb/runtime/runtime.tskb.tsx` — Runtime module structure: JSX primitives and registry type definitions
- `docs/src/tskb/typescript/typescript.tskb.tsx` — TypeScript Program creation for static analysis without compilation

_Plus 12 supplementary docs available via `npx tskb search`._

## Constraints

Some docs are marked as **constraints** (`priority="constraint"`). These define architectural rules and invariants that **MUST** be followed when working on related modules or folders. When `pick` or `ls` shows a constraint doc referencing the area you're working on, **read it before making changes**.

## Workflow

1. **Orient** — Scan the folder structure above to find the relevant area
2. **Search** — Run `npx tskb search "<query>"` to find specific nodes
3. **Pick** — Run `npx tskb pick "<id>"` for full context on a node. Check for constraint docs.
4. **Explore** — Only then use file reading tools for implementation details not covered by the graph
5. **Act** — Make architecturally coherent changes based on what you learned

## Updating Documentation

Documentation lives in `docs/` as `.tskb.tsx` files. When you notice structural elements (new folders, modules, services, important exports) that aren't captured in the graph, suggest adding them to the relevant doc file.

**When to update docs:**

- You discover a folder, module, or export that plays a structural role but isn't in the graph
- A new feature area is added that warrants its own folder/module declarations
- An architectural decision is made that should be recorded as an ADR or constraint

**How to update docs:**

- Declare new items in the `declare global { namespace tskb { ... } }` block using the type-safe primitives: `Folder<{ desc: "..."; path: "..." }>`, `Module<{ desc: "..."; type: typeof import("...") }>`, `Export<{ desc: "..."; type: typeof import("...").Name }>`, `Term<"...">`
- Import code elements directly and bind them to typed variables — use `typeof` to reference actual code rather than describing it in prose
- Reference graph nodes in JSX via type assertions: `{ref as tskb.Modules['Name']}` or `{ref as tskb.Folders['Name']}`
- Avoid free-text prose — let the type-safe bindings and structural primitives describe the architecture
- After editing, rebuild with `npx tskb build` — the build will throw if any path or reference doesn't resolve

**Best Practices:**

- **Keep it minimal** — Document structure and relationships, not implementation details. Let the code speak for itself.
- **Bind via primitives** — Use `Folder<>`, `Module<>`, and `Export<>` to declare structural elements. Reference them in JSX with `{ref as tskb.X['Name']}`. This keeps docs anchored to the codebase and resistant to decay.
- **Avoid implementation details** — Don't describe how functions work internally. Instead, explain what role they play in the architecture and how they relate to other components.
- **Focus on "why" and "what"** — Explain architectural decisions, responsibilities, and relationships. Code diffs show the "how."
- **Mark constraints** — Use `priority="constraint"` for rules that must be followed. Use `priority="essential"` for orientation docs that provide architectural overview.
