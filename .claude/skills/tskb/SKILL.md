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

- **Know a node ID or path** — `context` gets the full picture in one call: children, modules, exports, all referencing docs and constraints. Pass a node ID or a repo path.
- **Don't know where to start** — `search` for keywords to find relevant node IDs, then use `context` or `pick`.
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

- **context** — the most efficient single call: returns a node's full neighborhood (children, modules, exports) plus all referencing docs, deduplicated and sorted by priority. Takes a node ID or repo path. Constraint doc IDs are surfaced at the top level.
- **search** — free-text keyword search across the entire graph. Returns ranked results. Use `pick` or `context` on any `nodeId` for details.
- **pick** — full detail for one node. Modules/exports show code stubs with line ranges (`// :42-68`). Modules show imports, importedBy, and exports list. Folders show children. Externals show metadata key-value pairs. Constraint docs in results **MUST** be read.
- **ls** — folder tree with essential docs.
- **docs** — search or list all docs. Use `pick` on a doc ID for full content.
- **flows** — list or search flows, sorted by priority. Use `pick` on a flow ID for steps.

## Folder Structure

- **__TSKB.ROOT__** (`.`) — The root directory (automatically added by tskb)
  - **docs** (`docs`) — A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration. [1 folder, 2 files]
    - **examples.taskflow-app** (`examples/taskflow-app`) — Example application, not meant to be run, but used as reference for example docs [3 folders, 7 files]
  - **packages** (`packages`) — A folder that contains independent packages in the repo (npm worskspace) [1 folder]
    - **TSKB.Package.Root** (`packages/tskb`) — The root folder of the package, with its package.json and main npm README.md [4 folders, 5 files]
  - **references** (`references`) — A folder that contains git tracked references used for documentation illustration purposes, referenced on npm [2 files]
  - **tests** (`tests`) — End-to-end test suite for the tskb CLI, using Vitest [2 folders]
    - **tests.e2e** (`tests/e2e`) — E2E tests that exercise the full tskb pipeline: init scaffolding, build, and every query command [1 folder, 7 files]

_Snapshot from last `npm run docs` build._

## Boundaries

- **E2E tests** — `tests` — End-to-end test suite for the tskb CLI, using Vitest
- **Sample Client** — `examples/taskflow-app/src/client` — React frontend application with components, pages, and state management
- **Sample Server** — `examples/taskflow-app/src/server` — Node.js backend API with services, controllers, and middleware
- **test-fixtures** — `tests/e2e/fixture` — A small task-management TypeScript app used as the test subject. Has its own src/, docs/, and package.json, simulating a real user project adopting tskb
- **TSKB Explorer server** — `packages/tskb/src/core/explorer` — CLI-side explorer layer: graph→chunk transform, HTTP server, and static export
- **TSKB Explorer SPA** — `packages/tskb/explorer-app` — Vite SPA source for the interactive explorer UI. Built separately from the library (npm run build:explorer) and shipped in dist/explorer/
- **TSKB main package** — `packages/tskb` — The root folder of the package, with its package.json and main npm README.md

## Externals

- **d3** — D3 data-visualisation library. Used for tree layout (d3.hierarchy, d3.tree), zoom/pan (d3.zoom), SVG path curves (curveBasisClosed), and polygon hull computation (d3.polygonHull). (url: https://d3js.org, kind: npm-package)
- **npm** — npm package registry where tskb is published. The package includes the CLI binary, library entry point, JSX runtime, and pre-built explorer SPA assets. (url: https://www.npmjs.com/package/tskb, kind: package-registry)
- **pg** — PostgreSQL client for Node.js (url: https://node-postgres.com, kind: npm-package)
- **typescript** — TypeScript compiler API (the 'typescript' npm package). Provides the AST, type checker, and symbol resolution used throughout registry extraction and documentation parsing. (url: https://www.typescriptlang.org, kind: npm-package)
- **vite** — Frontend build tool that bundles the explorer SPA. Configured in packages/tskb/explorer-app/vite.config.ts; outputs to dist/explorer/. (url: https://vitejs.dev, kind: npm-package)
- **vitest** — Test runner used for both E2E and unit tests. Global setup builds the fixture graph once; individual test files run CLI subprocesses via execFileSync and assert against graph.json output. (url: https://vitest.dev, kind: npm-package)

## Flows

- **e2e-test-execution** [essential] — Full E2E run: global setup builds fixture graph, test files exercise every CLI command, teardown cleans output
  vitest.config → tests.global-setup → tests.helpers → tests.global-setup
- **build-pipeline** [essential] — The tskb build process: source files through extraction to knowledge graph outputs
  cli.build → extractRegistry → extractDocs → buildGraph → generateDot
- **static-analysis** [essential] — TypeScript Program creation through extraction to graph
  ts.createProgram → extraction.registry → extraction.documentation → graph.builder
- **explorer-serve-flow** [essential] — tskb explore: CLI finds graph, transforms chunks, starts HTTP server, browser loads SPA and fetches chunks on demand
  explorer.explore → explorer.transformGraph → explorer.serveExplorer → explorer.spa.main → explorer.spa.lane-engine → explorer.spa.node-base
- **explorer-export-flow** [essential] — tskb explore --export: reads graph.json, transforms chunks in memory, copies pre-built SPA from dist/explorer/ and writes chunk JSON files into the output directory (default: .tskb/explorer/)
  explorer.explore → explorer.transformGraph → explorer.exportExplorer → explorer.exportExplorer
- **module-morphology-extraction** [essential] — How a Module declaration becomes a fully enriched graph node with exports, imports, and type stubs
  extractRegistry → extractModuleMorphology → extractModuleImports → graph.builder

_Plus 9 supplementary flows available via `npx --no -- tskb flows --plain`._

## Documentation

- `docs/src/tskb/cli/logging.tskb.tsx` — CLI logging: stderr-only output, --verbose flag, timing support
- `docs/src/tskb/explorer/explorer.tskb.tsx` — tskb Explorer: interactive visual graph browser opened via `tskb explore`. Architecture, data flow, SPA layout, and extension points.
- `docs/src/tskb/main.tskb.tsx` — Architecture, API surface, and usage flow of the TSKB library
- `docs/src/tskb/runtime/runtime.tskb.tsx` — Runtime module structure: JSX primitives and registry type definitions
- `docs/src/tskb/typescript/typescript.tskb.tsx` — TypeScript Program creation for static analysis without compilation

_Plus 21 supplementary docs available via `npx --no -- tskb docs --plain`._

Constraint docs define architectural rules that **MUST** be followed when working on related code.
