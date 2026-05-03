---
name: tskb-toc
description: "Table of contents for this repo's codebase map: boundaries, externals, flows, and the essential-docs index. Load when orienting in unfamiliar territory — 'where is X', 'what areas exist', 'what flows are defined' — or before exploring a new part of the codebase. Skip when you already know the node ID or path."
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Table of Contents

Curated index of the repo's structural elements. Load this when you need to orient — what areas exist, which boundaries separate runtimes, what external services are used, what flows are documented. For the CLI itself (commands, response shapes), see the `tskb` skill.

## Boundaries

- **E2E tests** — `tests` — End-to-end tests for the tskb CLI.
- **test-fixtures** — `tests/e2e/fixture` — A small sample project used as the test subject — like a real repo that adopted tskb.
- **TSKB Explorer server** — `packages/tskb/src/core/explorer` — Server side of the explorer: turns the graph into chunks and serves them.
- **TSKB Explorer SPA** — `packages/tskb/explorer-app` — The browser app shown by the explorer.
- **TSKB main package** — `packages/tskb` — The root folder of the package, with its package.json and main npm README.md

## Externals

- **d3** — Data-visualisation library used for layout, zoom, and SVG drawing. (url: https://d3js.org, kind: npm-package)
- **npm** — npm package registry where tskb is published. The package includes the CLI binary, library entry point, JSX runtime, and pre-built explorer SPA assets. (url: https://www.npmjs.com/package/tskb, kind: package-registry)
- **typescript** — TypeScript compiler API (the 'typescript' npm package). Provides the AST, type checker, and symbol resolution used throughout registry extraction and documentation parsing. (url: https://www.typescriptlang.org, kind: npm-package)
- **vite** — Build tool that bundles the explorer SPA. (url: https://vitejs.dev, kind: npm-package)
- **vitest** — The test runner. (url: https://vitest.dev, kind: npm-package)

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

_Plus 7 supplementary flows available via `npx --no -- tskb flows --plain`._

## Documentation

- `docs/src/tskb/cli/logging.tskb.tsx` — How does the CLI route log output and what controls verbosity?
- `docs/src/tskb/explorer/explorer.tskb.tsx` — What is the tskb explorer and how does its data flow from CLI to browser?
- `docs/src/tskb/main.tskb.tsx` — What is tskb and what does this package contain?
- `docs/src/tskb/primitives.tskb.tsx` — What primitives does tskb provide for writing documentation?
- `docs/src/tskb/runtime/runtime.tskb.tsx` — What does the runtime module provide and what does it not do?
- `docs/src/tskb/typescript/typescript.tskb.tsx` — How does tskb create a TypeScript Program for static analysis without compiling?
- `docs/src/tskb/usage.tskb.tsx` — What's the typical workflow for setting up tskb in a repo?

_Plus 12 supplementary docs available via `npx --no -- tskb docs --plain`._

_Snapshot from last `npm run build:docs` build._
