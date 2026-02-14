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

## Commands

Search for concepts, modules, or folders:
```bash
npx tskb search "$ARGUMENTS"
```

Get detailed info on any node (by ID or path):
```bash
npx tskb pick "<identifier>"
```

List folder hierarchy:
```bash
npx tskb ls --depth=4
```

## Folder Structure

- **__TSKB.REPO.ROOT__** (`.`) — The root directory of the repository (automatically added by tskb)
  - **docs** (`docs`) — A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration.
    - **examples.taskflow-app** (`examples/taskflow-app`) — Example application, not meant to be run, but used as reference for example docs
        - **Client** (`examples/taskflow-app/src/client`) — React frontend application with components, pages, and state management
          - **Components** (`examples/taskflow-app/src/client/components`) — Reusable React components organized by feature
          - **Contexts** (`examples/taskflow-app/src/client/contexts`) — React Context providers for global state management
          - **Hooks** (`examples/taskflow-app/src/client/hooks`) — Custom React hooks for shared logic
          - **Pages** (`examples/taskflow-app/src/client/pages`) — Top-level page components mapped to routes
          - **ClientServices** (`examples/taskflow-app/src/client/services`) — API client services for backend communication
        - **Server** (`examples/taskflow-app/src/server`) — Node.js backend API with services, controllers, and middleware
          - **Controllers** (`examples/taskflow-app/src/server/controllers`) — HTTP request handlers that coordinate between routes and services
          - **Database** (`examples/taskflow-app/src/server/database`) — Database connection and repository layer for data persistence
            - **Repositories** (`examples/taskflow-app/src/server/database/repositories`) — Data access layer abstracting database operations
          - **Middleware** (`examples/taskflow-app/src/server/middleware`) — Express middleware for authentication, validation, and error handling
          - **Services** (`examples/taskflow-app/src/server/services`) — Business logic layer handling core application operations
        - **Shared** (`examples/taskflow-app/src/shared`) — Shared TypeScript types and utilities used by both client and server
          - **Config** (`examples/taskflow-app/src/shared/config`) — Configuration constants and environment variables
          - **Types** (`examples/taskflow-app/src/shared/types`) — TypeScript type definitions shared across the application
          - **Utils** (`examples/taskflow-app/src/shared/utils`) — Utility functions for validation, formatting, and common operations
  - **packages** (`packages`) — A folder that contains independent packages in the repo (npm worskspace)
    - **TSKB.Package.Root** (`packages/tskb`) — The root folder of the package, with its package.json and main npm README.md
        - **tskb.cli** (`packages/tskb/src/cli`) — Source code for the cli
          - **tskb.cli.commands** (`packages/tskb/src/cli/commands`) — Command implementations for build, search, pick, and ls operations
        - **tskb.core** (`packages/tskb/src/core`) — Source code for the core - extraction logic for registry (TS interfaces used as a registry) and 'doc' processing <Doc>...</Doc>
          - **core.extraction** (`packages/tskb/src/core/extraction`) — Contains the logic for extracting registry and documentation from TypeScript AST
          - **core.extraction.graph** (`packages/tskb/src/core/graph`) — Part of the core of the library responsible for building the graph structure, mapping nodes and relations between them into nodes - edges
        - **tskb.runtime** (`packages/tskb/src/runtime`) — Source code for the runtime, the lib does not have an actual runtime, but this folder contains the base registry interfaces and jsx primitives
        - **tskb.typescript** (`packages/tskb/src/typescript`) — Creates a TypeScript compiler Program from source files and tsconfig settings that enables static analysis of code structure, types, and symbols without emitting JavaScript output
  - **references** (`references`) — A folder that contains git tracked references used for documentation illustration purposes, referenced on npm

## Documentation

Each doc has an `explains` field describing its purpose. Use this to decide which docs to read.

- `docs/src/taskflow-app/adr/adr-context-over-redux.tskb.tsx` — ADR: choosing React Context API over Redux for state management
- `docs/src/taskflow-app/adr/adr-repository-pattern.tskb.tsx` — ADR: choosing repository pattern over direct database access or full ORM
- `docs/src/taskflow-app/architecture-overview.tskb.tsx` — Full architectural overview of TaskFlow: layers, data flow, and type safety
- `docs/src/taskflow-app/authentication-system.tskb.tsx` — Authentication system: login, registration, JWT tokens, and session management
- `docs/src/taskflow-app/constraints/constraint-api-responses.tskb.tsx` — Constraint: all API endpoints must follow the ApiResponse type structure
- `docs/src/taskflow-app/constraints/constraint-service-isolation.tskb.tsx` — Constraint: services must access data only through repositories, never directly
- `docs/src/taskflow-app/data-layer.tskb.tsx` — Data layer architecture using the repository pattern for database abstraction
- `docs/src/taskflow-app/main.tskb.tsx` — TaskFlow application overview: architecture layers, patterns, and tech stack
- `docs/src/tskb/main.tskb.tsx` — Architecture, API surface, and usage flow of the TSKB library
- `docs/src/tskb/runtime/runtime.tskb.tsx` — Runtime module structure: JSX primitives and registry type definitions
- `docs/src/tskb/typescript/typescript.tskb.tsx` — TypeScript Program creation for static analysis without compilation

## Workflow

Always follow this order — do not skip to step 4 or 5 without completing earlier steps:

1. **Orient** — Scan the folder structure above to find the relevant area
2. **Search** — Run `npx tskb search "<query>"` to find specific nodes
3. **Pick** — Run `npx tskb pick "<id>"` for full context on a node
4. **Explore** — Only then use Read/Grep for implementation details not covered by the graph
5. **Act** — Make architecturally coherent changes based on what you learned
