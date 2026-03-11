---
name: tskb-update
description: "Use when you discover undocumented architecture, make structural changes, or the developer wants to record an important decision. Guides writing .tskb.tsx documentation files."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob
---

# TSKB — Documentation Authoring Guide

This project uses **TSKB**, a semantic knowledge graph of the codebase.
This guide explains how to write and update `.tskb.tsx` documentation files.

## Key Rules — READ THIS FIRST

- **Structural maps, not implementation manuals.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Terse like code comments.** One or two sentences per `<Doc>`. References *are* the documentation; prose just connects them.
- **Import, don't hardcode.** If a type/class/value exists in the codebase, import it. Imports create physical binds the compiler validates.
- **Rebuild after editing.** Check the root `package.json` for the project's tskb build script and run it. The build throws if any path or reference doesn't resolve.

## When to Update Docs

**Do** document when:
- A folder, module, or export plays a structural role but isn't in the graph
- A new feature area warrants its own declarations
- An architectural decision should be recorded as a constraint
- The developer explicitly asks

**Don't** document: routine bug fixes, internal function changes, temporary code.

## File Structure

Docs live in `docs/` as `.tskb.tsx` files. Each has two parts:

**1. Registry block** — declares structural elements:

```tsx
declare global {
  namespace tskb {
    interface Folders {
      "my-feature": Folder<{ desc: "User authentication and sessions"; path: "src/auth" }>;
    }
    interface Modules {
      "auth.service": Module<{ desc: "Core auth service"; type: typeof import("src/auth/service.js") }>;
    }
    interface Exports {
      "auth.service.login": Export<{ desc: "Authenticates user, returns session token"; type: typeof import("src/auth/service.js").login }>;
    }
    interface Terms {
      sessionToken: Term<"JWT issued on login for authenticating API requests">;
    }
  }
}
```

**2. JSX content** — references nodes and explains relationships:

```tsx
const AuthFolder = ref as tskb.Folders["my-feature"];
const AuthService = ref as tskb.Modules["auth.service"];

export default (
  <Doc explains="Authentication: service, token flow, session management">
    <P>Located in {AuthFolder}. Core logic in {AuthService}.</P>
  </Doc>
);
```

## Registry Primitives

- `Folder<{ desc: "..."; path: "..." }>` — Logical grouping. Path relative to project root.
- `Module<{ desc: "..."; type: typeof import("...") }>` — Source file. Import path must resolve.
- `Export<{ desc: "..."; type: typeof import("...").Name }>` — Named export. Compiler validates existence.
- `Term<"...">` — Domain concept. Not tied to a file.

Reference nodes in JSX via type assertions: `const X = ref as tskb.Modules["id"]`, then use `{X}` in JSX.

## JSX Components

- <Doc explains="..." priority?="essential"|"constraint"|"supplementary"> — Root component. Every file exports one.
- <Snippet code={() => { ... }} /> — Code example using real imports. Creates physical binds.
- <Relation from={...} to={...} label?="..." /> — Declares a semantic relation between two nodes. from and to must be node constants (from the registry). label is optional and describes the relationship (e.g., "depends on"). Produces a related-to edge in the graph, visible in CLI output.
- <Adr id="..." title="..." status="accepted"|"proposed"|"deprecated"|"superseded"> — Architecture Decision Record.
- <H1>, <H2>, <H3>, <P>, <List>/<Li> — Content components.

## Priorities

- essential — Orientation docs shown in ls. Use sparingly.
- constraint — Architectural rules. Must be followed.
- supplementary (default) — Additional context.

## Good vs Bad

```tsx
// GOOD — short, structural, bound to nodes
<Doc explains="Task scheduling: queue, workers, retry logic">
  <P>{TaskQueue} dispatches jobs to {WorkerPool}. Retry policy in {RetryConfig}.</P>
</Doc>

// BAD — verbose, narrates implementation
<Doc explains="Task scheduling system">
  <P>The system works by accepting tasks into a queue, prioritized by creation time.
  The worker pool picks up tasks using round-robin. Each worker processes and reports back...</P>
</Doc>
```

Never describe algorithms, control flow, or internal logic. Never duplicate what type signatures already communicate.
