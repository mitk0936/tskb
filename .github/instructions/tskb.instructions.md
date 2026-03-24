---
applyTo: "**"
---

# TSKB — Codebase Architecture

This project uses **TSKB**, a semantic knowledge graph of the codebase. It captures architectural intent, constraints, and structural relationships that filesystem exploration alone will miss.

## When to Use

Use tskb **first** — before grepping or reading files. It tells you where things are and how they relate, so you don't waste time exploring blind. Think of it as asking a teammate "where does X live?" instead of searching every folder yourself.

- **Find things** — `search` or `ls` to locate modules, exports, folders by name or concept.
- **Understand connections** — `pick` or `context` to see what a module imports, exports, and what docs reference it.
- **Check rules** — Constraint docs define rules you must follow. They show up in `pick` results automatically.
- **Skip it** — If you already know exactly which file to edit and the change is self-contained.

## Commands

```bash
npx --no -- tskb search "<query>" --plain                    # Fuzzy search across the entire graph
npx --no -- tskb pick "<identifier>" --plain                  # Detailed info on any node (by ID or path)
npx --no -- tskb context "<identifier>" --depth=2 --plain     # Node + neighborhood + docs (BFS traversal)
npx --no -- tskb ls --depth=4 --plain                         # Folder hierarchy
npx --no -- tskb docs "<query>" --plain                       # Search docs
```

Drop `--plain` for JSON output. Use `--optimized` for compact JSON (no whitespace).

## What's on the Map

- **Folder** — a logical area (feature, layer, package). Has a path and description.
- **Module** — a source file. Shows imports, exports, and code stubs with line numbers.
- **Export** — a function, class, type, or constant from a module.
- **File** — a non-JS/TS file (README, config, etc.).
- **External** — something outside the repo (npm package, API, cloud service, database). Has free-form key-value metadata.
- **Term** — a domain concept, not tied to a file.
- **Doc** — a `.tskb.tsx` documentation file. Has priority: essential, constraint, or supplementary.

All paths are relative to project root and can be used directly to read files.

## What Each Command Returns

- **search** — ranked results by relevance. Use `pick` on any `nodeId` for details.
- **pick** — full detail for one node. Modules/exports show code stubs with line ranges (`// :42-68`). Modules show imports, importedBy, and exports list. Folders show children. Externals show metadata key-value pairs. Constraint docs in results **MUST** be read.
- **context** — a node and its neighbors (BFS traversal). Shows what connects to what.
- **ls** — folder tree with essential docs.
- **docs** — search or list all docs. Use `pick` on a doc ID for full content.

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
