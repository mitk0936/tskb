---
applyTo: "**/*.tskb.tsx"
---

# TSKB — Documentation Authoring Guide

This project uses **TSKB**, a semantic knowledge graph of the codebase.
This guide explains how to write and update `.tskb.tsx` documentation files.

## Philosophy

TSKB docs are **structural maps**, not implementation manuals. They describe *what* exists, *where* it lives, and *why* it matters — never *how* it works internally. Implementation details drift with every commit; structural relationships are stable.

The type-safe primitives (`Folder`, `Module`, `Export`) anchor docs to real code via `typeof import()`. The TypeScript compiler validates that referenced files and exports actually exist — if code moves or is deleted, the build breaks, so docs can't silently go stale.

## Doc Content: Think Code Comments, Not Prose

**`<Doc>` blocks must be terse — like code comments, not essays.** Each `<Doc>` should:

- **State what this is and its main purpose** — one or two sentences, no more.
- **Bind to actual nodes** — reference `Folder`, `Module`, `Export`, and `Term` refs. The references *are* the documentation; prose just connects them.
- **Never narrate implementation** — don't describe control flow, algorithms, function internals, or step-by-step logic. That belongs in the code itself.

A good `<Doc>` reads like a label on a map: "This folder handles X. Key module is Y, which provides Z." A bad `<Doc>` reads like a tutorial with paragraphs explaining how things work internally.

```tsx
// GOOD — short, structural, bound to nodes
export default (
  <Doc explains="Task scheduling: queue, workers, retry logic">
    <P>{TaskQueue} dispatches jobs to {WorkerPool}. Retry policy in {RetryConfig}.</P>
  </Doc>
);

// BAD — verbose, implementation-heavy
export default (
  <Doc explains="Task scheduling system">
    <H1>Task Scheduling</H1>
    <P>The task scheduling system works by first accepting tasks into a queue,
    where they are prioritized by creation time. The worker pool then picks up
    tasks using a round-robin strategy. Each worker processes the task and
    reports back. If a task fails, the retry module checks the retry count
    against the max retries configuration...</P>
  </Doc>
);
```

## When to Update Docs

Suggest documenting when:

- You discover a folder, module, or export that plays a structural role but isn't in the knowledge graph
- A new feature area is added that warrants its own folder/module declarations
- An architectural decision is made that should be recorded as a constraint
- The developer explicitly asks to record something

Do **not** update docs for:

- Routine bug fixes or small implementation changes
- Internal function changes that don't affect structure
- Temporary or experimental code

## Documentation Files

Documentation lives in `docs/` as `.tskb.tsx` files. Each file has two parts:

### 1. Registry Block

Declares structural elements in a `declare global` block:

```tsx
declare global {
  namespace tskb {
    interface Folders {
      "my-feature": Folder<{
        desc: "Handles user authentication and session management";
        path: "src/auth";
      }>;
    }

    interface Modules {
      "auth.service": Module<{
        desc: "Core authentication service — login, logout, token refresh";
        type: typeof import("src/auth/service.js");
      }>;
    }

    interface Exports {
      "auth.service.login": Export<{
        desc: "Authenticates a user with credentials, returns a session token";
        type: typeof import("src/auth/service.js").login;
      }>;
    }

    interface Terms {
      sessionToken: Term<"A JWT issued on login, used to authenticate subsequent API requests">;
    }
  }
}
```

### 2. JSX Documentation Content

References declared nodes and explains relationships:

```tsx
const AuthFolder = ref as tskb.Folders["my-feature"];
const AuthService = ref as tskb.Modules["auth.service"];

export default (
  <Doc explains="Authentication architecture: service, token flow, and session management">
    <H1>Authentication</H1>
    <P>Located in {AuthFolder}. Core logic in {AuthService}.</P>
  </Doc>
);
```

## Importing Code for Physical Binding

Import real code from the codebase into `.tskb.tsx` files. This creates a **physical bind** — if the imported file moves, is renamed, or is deleted, the TypeScript compiler will fail, signaling that the doc needs updating. This prevents docs from silently going stale.

```tsx
// Import types and values from the actual codebase
import { TaskRepository } from "src/server/database/repositories/task.repository.js";
import { Task } from "src/shared/types/task.types.js";
import { Database } from "src/server/database/connection.js";
```

Use these imports in JSX instead of hardcoding names as strings:

```tsx
// GOOD — physically bound, compiler catches changes
<Snippet code={() => {
  class Service {
    constructor(private repo: TaskRepository, private db: Database) {}
    async find(id: string): Promise<Task | null> {
      return this.repo.findById(id);
    }
  }
}} />

// BAD — hardcoded strings, silently goes stale
<P>The TaskRepository class in src/server/database uses the Database connection...</P>
```

**Rule of thumb:** if something can be imported, import it. If you're writing a name that exists in the codebase as a string literal, it should probably be an import or a registry reference instead.

## Registry Primitives

- `Folder<{ desc: "..."; path: "..." }>` — A logical grouping. Path is relative to project root.
- `Module<{ desc: "..."; type: typeof import("...") }>` — A source file. Import path must resolve.
- `Export<{ desc: "..."; type: typeof import("...").Name }>` — A specific named export. Compiler validates existence.
- `Term<"...">` — A domain concept or pattern. Not tied to a file.

Use `typeof import("path/to/file.js")` for type references — the compiler validates the path exists.

## Referencing Nodes in JSX

Bind nodes to variables via type assertions, then use them in JSX:

```tsx
const MyModule = ref as tskb.Modules["module-id"];
// In JSX: {MyModule} renders as a reference link
```

Available namespaces: `tskb.Folders`, `tskb.Modules`, `tskb.Exports`, `tskb.Terms`.

## JSX Components

### `<Doc>`

The root component. Every `.tskb.tsx` file exports a default `<Doc>` element.

- `explains` (required) — Short description of what the doc covers.
- `priority` (optional) — `"essential"`, `"constraint"`, or `"supplementary"` (default).

### `<Snippet>`

Embeds a code example that uses real imported types and values. The function body is captured as a string in the graph.

```tsx
import { TaskRepository } from "src/server/repositories/task.repository.js";
import { Database } from "src/server/database/connection.js";

<Snippet code={() => {
  // This code references real imports — compiler validates they exist
  class TaskRepo {
    constructor(private db: Database) {}
    async findById(id: string) {
      return this.db.query("SELECT * FROM tasks WHERE id = ?", [id]);
    }
  }
}} />
```

Use `<Snippet>` to show architectural patterns and how components interact. The imported types inside the snippet create physical binds to the codebase.

### `<Adr>`

Architecture Decision Record — documents a significant architectural choice.

```tsx
<Adr
  id="001"
  title="Use repository pattern for data access"
  status="accepted"
  date="2024-01-15"
  deciders="Team Lead, Senior Dev"
>
  <H2>Context</H2>
  <P>We needed to decide how services interact with the database...</P>

  <H2>Decision</H2>
  <P>Implement the repository pattern with one repository per domain entity.</P>

  <H2>Consequences</H2>
  <P>Better testability, more boilerplate...</P>
</Adr>
```

Properties: `id` (required), `title` (required), `status` (`"proposed"` | `"accepted"` | `"deprecated"` | `"superseded"`), `date` (optional), `deciders` (optional).

### Content Components

`<H1>`, `<H2>`, `<H3>` — Headings. `<P>` — Paragraph. `<List>`/`<Li>` — Bulleted lists.

## Doc Priorities

Set via the `priority` attribute on `<Doc>`:

- **`essential`** — Orientation docs. Shown in `ls` output. Read these first to understand an area.
- **`constraint`** — Architectural rules and invariants. **Must** be followed when working on related code.
- **`supplementary`** — Additional context (default). Available via `search` and `pick`.

## What to Avoid

- **Implementation details** — Don't describe algorithms, control flow, or internal logic. These change constantly.
- **Prose about how functions work** — The code is the source of truth for "how."
- **Duplicating information available in code** — If a type signature or function name already communicates the intent, don't repeat it.
- **Anything that drifts with code changes** — If it would need updating after a refactor, it probably shouldn't be in the doc.

## Best Practices

- **Import, don't hardcode** — If a type, class, or value exists in the codebase, import it. Never write codebase names as string literals. Imports create physical binds that the compiler validates.
- **Keep it minimal** — Document structure and relationships, not implementation. Let the code speak for itself.
- **Anchor to code via primitives** — Use `Folder<>`, `Module<>`, and `Export<>` to declare elements. The compiler catches drift.
- **Use `<Snippet>` with real imports** — Snippets should reference imported types to stay bound to the codebase, not use made-up placeholder types.
- **Focus on "what" and "where"** — Explain what role things play and how they relate. Code diffs show the "how."
- **Use `<Adr>` for architectural decisions** — Record significant choices with context, decision, and consequences. These are long-lived and valuable.
- **Mark constraints** — Use `priority="constraint"` for rules that must be followed.
- **Use `essential` sparingly** — Only for top-level orientation docs.
- **Rebuild after editing** — Run `npx --no -- tskb build` to validate. The build will throw if any path or reference doesn't resolve.
