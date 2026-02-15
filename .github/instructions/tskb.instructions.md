---
applyTo: "**"
---

# TSKB — Codebase Architecture

This project uses **TSKB**, a semantic knowledge graph of the codebase.
Before making code changes, use TSKB to understand the architecture.

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

## Command Response Shapes

**search** returns ranked results across all node types:
```json
[{ "type": "folder|module|export|term|doc", "id": "...", "desc": "...", "score": 0.85 }]
```
Use `pick` on any result ID to get full details.

**pick** returns type-specific context for any node:
```json
{ "type": "folder", "node": { "id": "...", "desc": "...", "path": "..." },
  "parent": { ... }, "childFolders": [...], "modules": [...],
  "exports": [...], "referencingDocs": [{ "id": "...", "explains": "...", "priority": "..." }] }
```
Follow `referencingDocs` to find related documentation. Constraint docs in this list MUST be read.

**ls** returns the folder hierarchy and essential docs:
```json
{ "root": "...", "folders": [{ "id": "...", "desc": "...", "path": "..." }],
  "docs": [{ "id": "...", "explains": "...", "filePath": "..." }] }
```

## Folder Structure

- **__TSKB.REPO.ROOT__** (`.`) — The root directory of the repository (automatically added by tskb)
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

Documentation lives in `docs/` as `.tskb.tsx` files. When adding new structural areas or significant functionality, update the relevant doc file — declare new folders or modules in the `declare global { namespace tskb { ... } }` block and rebuild with `npx tskb build`.
