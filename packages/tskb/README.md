# tskb

Let your AI assistant document your codebase while you work.

tskb turns architecture knowledge into a **typed, queryable, compiler-validated graph** that evolves alongside your system.

> **Your AI writes the docs. You navigate them.**

[![npm version](https://badge.fury.io/js/tskb.svg)](https://www.npmjs.com/package/tskb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

[Repository](https://github.com/mitk0936/tskb) · [Issues](https://github.com/mitk0936/tskb/issues) · [npm](https://www.npmjs.com/package/tskb)

---

## Why I built it

While working across large TypeScript codebases, I kept running into the same problems:

- Architecture knowledge lives in people’s heads
- AI assistants repeatedly rediscover the same context
- Markdown docs silently drift after refactors
- Cross-repo understanding becomes expensive over time

I wanted a system where:

- AI could accumulate implementation knowledge continuously
- Documentation stayed connected to real code
- Stale docs became detectable
- Architectural context persisted across sessions
- Knowledge could be visually explored and queried

tskb is an experiment around that idea.

---

## Preview

![tskb explorer](https://raw.githubusercontent.com/mitk0936/tskb/main/references/explorer.png)

---

## Live explorer

You can explore the documentation and graph for tskb itself here:

https://tskb-static-b3hqdl4xbq-ew.a.run.app/

---

## What it does

tskb lets your AI assistant write and maintain `.tskb.tsx` documentation files while you work.

Those docs are:

- validated by the TypeScript compiler
- connected to real files and exports via `typeof import()`
- transformed into a structured graph
- queryable through a CLI
- explorable through a visual UI
- reusable by AI assistants in future sessions

When your code changes, stale references break during the docs build.

> Refactor your code → stale docs fail compilation.

---

## Quick start

```bash
npm install --save-dev tskb

npx tskb init
npm run docs
npx tskb explore
```

This gives you:

- a typed architecture graph
- AI assistant skills/instructions
- CLI querying tools
- an interactive explorer UI

The graph starts empty and grows incrementally as you and your AI document the system over time.

---

## Example workflow

During normal engineering work:

```text
You:
"I'm updating authentication flow. Document the changes."
```

Your AI assistant:

1. Searches existing architecture knowledge
2. Explores related flows/modules
3. Writes or updates `.tskb.tsx` docs
4. Rebuilds the graph
5. Fixes stale references if compilation fails

Future sessions reuse that accumulated context instead of rediscovering the system from scratch.

---

## Core ideas

### AI-first authoring

The AI accumulates observations while you work.

Humans stay responsible for:

- navigation
- validation
- architectural intent
- deciding what matters

---

### Compiler-validated docs

Documentation references real code:

```ts
typeof import("../src/auth.service.ts").AuthService;
```

Rename or remove something → the docs build breaks.

---

### Continuous verifiability

Traditional docs silently decay.

tskb experiments with making architecture knowledge:

- continuously checkable
- refactor-aware
- invalidatable when stale

---

### Persistent architectural memory

Instead of repeatedly reconstructing intent every session, the AI works against an accumulated graph of:

- modules
- flows
- architectural boundaries
- decisions
- relationships
- implementation observations

---

### Workspace-scale exploration

tskb is designed to operate above individual repos.

The graph can connect:

- applications
- packages
- infra
- tooling
- testing frameworks
- docs
- flows between systems

---

## Explorer

`tskb explore` launches a visual graph explorer for navigating architecture knowledge.

Features include:

- folder nesting
- module expansion
- flow visualization
- relationship tracing
- cross-repo navigation
- interactive graph exploration

The explorer ships prebuilt and can also be exported as a static site.

```bash
npx tskb explore
npx tskb explore --export ./public
```

---

## CLI

```bash
npx tskb init
npx tskb build
npx tskb ls
npx tskb search "auth"
npx tskb context "AuthService"
npx tskb pick "AuthService"
npx tskb flows
npx tskb explore
```

Especially useful for AI assistants:

- `search` → fuzzy graph search
- `context` → fetch node + neighborhood + docs in one call
- `pick` → detailed node inspection

All commands support:

- `--plain` for lower token usage
- `--optimized` for compact JSON output

---

## AI assistant integration

tskb generates assistant skills/instructions automatically from the graph.

Current integrations:

- Claude Code
- GitHub Copilot

Generated skills include:

- repo map / orientation
- architecture TOC
- documentation workflows
- authoring syntax
- querying guidance

The AI can then:

- navigate existing knowledge
- avoid rereading the same code repeatedly
- build on prior sessions
- update stale documentation

---

## What makes it different

### vs Markdown docs

- connected to real code
- compiler validated
- queryable
- refactor-aware

### vs diagrams

- generated from typed references
- continuously maintainable
- navigable
- integrated with AI workflows

### vs TypeDoc

TypeDoc documents APIs.

tskb focuses on:

- architecture
- flows
- intent
- relationships
- implementation knowledge

### vs generic AI/RAG tooling

Most systems focus on retrieval.

tskb focuses on:

- continuously accumulated knowledge
- verification
- architectural continuity
- persistent engineering context

---

## Status

Current version: `0.7.x`

Still evolving, especially around:

- graph evolution
- stale invalidation
- architectural constraints
- explorer capabilities
- AI workflows

The core workflow and CLI are already stable enough for daily use.

---

## Roadmap

- richer architecture validation
- stale knowledge detection
- additional assistant integrations
- architecture pattern primitives
- improved graph analysis
- larger workspace support

---

## License

MIT © Dimitar Mihaylov
