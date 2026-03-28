---
name: tskb
description: "Codebase map — check it whenever you enter unfamiliar territory. Shows where things live, how they connect, what constraints apply. Use before grepping or reading files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Map

A curated map of the codebase. Not every file — the parts that matter architecturally: folders, modules, exports, flows, constraints, and how they connect.

Consult the map whenever you step into unfamiliar territory — not just the first question, but every time the conversation moves to a new area. A quick `search` or `pick` is cheaper than guessing from file names.

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
npx --no -- tskb flows [<query>] --plain                       # List flows sorted by priority
```

Drop `--plain` for JSON output. Use `--optimized` for compact JSON (no whitespace).

## What's on the Map

- **Folder** — a logical area (feature, layer, package). Has a path and description.
- **Module** — a source file. Shows imports, exports, and code stubs with line numbers.
- **Export** — a function, class, type, or constant from a module.
- **File** — a non-JS/TS file (README, config, etc.).
- **External** — something outside the repo (npm package, API, cloud service, database). Has free-form key-value metadata.
- **Term** — a domain concept, not tied to a file.
- **Flow** — a named, ordered sequence of steps through the system. Has priority like docs.
- **Doc** — a `.tskb.tsx` documentation file. Has priority: essential, constraint, or supplementary.

All paths are relative to project root and can be used directly to read files.

## What Each Command Returns

- **search** — ranked results by relevance. Use `pick` on any `nodeId` for details.
- **pick** — full detail for one node. Modules/exports show code stubs with line ranges (`// :42-68`). Modules show imports, importedBy, and exports list. Folders show children. Externals show metadata key-value pairs. Constraint docs in results **MUST** be read.
- **context** — a node and its neighbors (BFS traversal). Shows what connects to what.
- **ls** — folder tree with essential docs.
- **docs** — search or list all docs. Use `pick` on a doc ID for full content.
- **flows** — list or search flows, sorted by priority. Use `pick` on a flow ID for steps.

## Folder Structure

- **__TSKB.ROOT__** (`.`) — The root directory (automatically added by tskb)
  - **docs** (`docs`) — A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration. [1 folder, 1 file]
    - **examples.taskflow-app** (`examples/taskflow-app`) — Example application, not meant to be run, but used as reference for example docs [3 folders, 7 files]
  - **packages** (`packages`) — A folder that contains independent packages in the repo (npm worskspace) [1 folder]
    - **TSKB.Package.Root** (`packages/tskb`) — The root folder of the package, with its package.json and main npm README.md [2 folders, 4 files]
  - **references** (`references`) — A folder that contains git tracked references used for documentation illustration purposes, referenced on npm [2 files]
  - **tests** (`tests`) — End-to-end test suite for the tskb CLI, using Vitest [1 folder]
    - **tests.e2e** (`tests/e2e`) — E2E tests that exercise the full tskb pipeline: init scaffolding, build, and every query command [1 folder, 7 files]

## Externals

- **pg** — PostgreSQL client for Node.js (url: https://node-postgres.com, kind: npm-package)

## Flows

- **e2e-test-execution** [essential] — Full E2E run: global setup builds fixture graph, test files exercise every CLI command, teardown cleans output
  vitest.config → tests.global-setup → tests.helpers → tests.global-setup
- **build-pipeline** [essential] — The tskb build process: source files through extraction to knowledge graph outputs
  cli.build → extractRegistry → extractDocs → buildGraph → generateDot
- **static-analysis** [essential] — TypeScript Program creation through extraction to graph
  ts.createProgram → extraction.registry → extraction.documentation → graph.builder
- **module-morphology-extraction** [essential] — How a Module declaration becomes a fully enriched graph node with exports, imports, and type stubs
  extractRegistry → extractModuleMorphology → extractModuleImports → graph.builder

_Plus 3 supplementary flows available via `npx --no -- tskb flows --plain`._

## Documentation

- `docs/src/tskb/cli/logging.tskb.tsx` — CLI logging: stderr-only output, --verbose flag, timing support
- `docs/src/tskb/main.tskb.tsx` — Architecture, API surface, and usage flow of the TSKB library
- `docs/src/tskb/runtime/runtime.tskb.tsx` — Runtime module structure: JSX primitives and registry type definitions
- `docs/src/tskb/typescript/typescript.tskb.tsx` — TypeScript Program creation for static analysis without compilation

_Plus 15 supplementary docs available via `npx --no -- tskb docs --plain`._

Constraint docs define architectural rules that **MUST** be followed when working on related code.
