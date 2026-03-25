---
name: tskb-update
description: "Write, update, and maintain .tskb.tsx documentation files — covers JSX syntax, registry primitives, session triggers, and best practices. Use when the developer asks to document or when you encounter something structurally important that's missing from the map."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob
---

# TSKB — Write & Update Documentation

How to write and maintain the codebase map. The map lives in `.tskb.tsx` files — they declare what exists and how it connects.

## When to Update — Session Triggers

**Trigger an update during a session when:**
- You discover a folder, module, or export that plays a structural role but isn't in the graph
- A new feature area is being built (declare it before or alongside implementation)
- An architectural decision is being made that should be recorded (use `<Adr>`)
- A constraint is identified that future changes must respect (use `priority="constraint"`)
- The developer explicitly asks to update the map

**Don't update for:** routine bug fixes, refactoring internals, temporary code, or anything that doesn't change the architecture.

**How to check what's missing:**

```bash
npx --no -- tskb ls --plain              # See what folders are mapped
npx --no -- tskb search "<area>" --plain # Check if something already exists
```

## Key Rules

- **Structural maps, not implementation manuals.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Verify through types, not strings.** Prefer `Module<{ type: typeof import("...") }>` and `Export<{ type: typeof import("...").Name }>` over plain descriptions. Infer types from actual project imports — the compiler catches drift. Only use `Term` and `File` (string-only primitives) for things that genuinely have no importable type.
- **Import, don't hardcode.** If a type/class/value exists in the codebase, import it. Imports create physical binds the compiler validates.
- **Rebuild after editing.** Check the root `package.json` for the project's tskb build script and run it. The build throws if any path or reference doesn't resolve.

## File Structure

Docs live in `docs/` as `.tskb.tsx` files. Each has two parts:

**1. Registry block** — declares structural elements:

```tsx
import type { Folder, Module, Export, File, External, Term } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "auth": Folder<{ desc: "Authentication and session management"; path: "src/auth" }>;
    }
    interface Modules {
      "auth.service": Module<{ desc: "Core auth logic"; type: typeof import("../src/auth/service.js") }>;
    }
    interface Exports {
      "auth.service.login": Export<{
        desc: "Authenticates user, returns session token";
        type: typeof import("../src/auth/service.js").login;
      }>;
    }
    interface Files {
      "auth.config": File<{ desc: "Auth provider config"; path: "src/auth/config.yml" }>;
    }
    interface Externals {
      "redis": External<{ desc: "Session cache and pub/sub"; url: "https://redis.io" }>;
    }
    interface Terms {
      "session-token": Term<"JWT issued on login, used to authenticate API requests">;
    }
  }
}
```

**2. JSX content** — references nodes and explains relationships:

```tsx
import { Doc, H1, P, ref } from "tskb";

const AuthFolder = ref as tskb.Folders["auth"];
const AuthService = ref as tskb.Modules["auth.service"];
const SessionToken = ref as tskb.Terms["session-token"];

export default (
  <Doc explains="Authentication: login flow, JWT tokens, session management" priority="essential">
    <H1>Authentication</H1>
    <P>{AuthService} lives in {AuthFolder} and issues {SessionToken} on login.</P>
  </Doc>
);
```

## Registry Primitives

| Primitive | When to use |
|-----------|-------------|
| `Folder<{ desc; path }>` | A logical area of the codebase |
| `Module<{ desc; type: typeof import("...") }>` | A source file — import path validates it exists |
| `Export<{ desc; type: typeof import("...").Name }>` | A named export — compiler validates it exists |
| `File<{ desc; path }>` | Non-TS files: configs, READMEs, specs |
| `External<{ desc; [key]: string }>` | npm packages, APIs, services outside the repo |
| `Term<"...">` | Domain concepts not tied to a specific file |

**Import paths must resolve.** Use `.js` extensions with NodeNext module resolution.

## Referencing Nodes

Declare a constant with a type assertion, then use inline:

```tsx
const MyModule = ref as tskb.Modules["my.module"];   // reference a module
const MyTerm   = ref as tskb.Terms["my-concept"];    // reference a term
// then in JSX:
<P>{MyModule} uses {MyTerm}.</P>
```

The `ref` value is a placeholder — only the type matters. The compiler validates the key exists in the registry.

## JSX Components

- **`<Doc explains="..." priority?>`** — Root component. Every file exports one default Doc.
  - `priority="essential"` — shown in `tskb ls`. Use sparingly for orientation docs.
  - `priority="constraint"` — architectural rules. Must be followed. Shown in `pick` results.
  - `priority="supplementary"` (default) — additional context.
- **`<P>`**, **`<H1>`**, **`<H2>`**, **`<H3>`**, **`<List>`/`<Li>`** — Content structure.
- **`<Snippet code={() => { ... }} />`** — Type-checked code example. Real imports, not strings.
- **`<Relation from={NodeA} to={NodeB} label?="..." />`** — Explicit semantic relationship edge.
- **`<Adr id="..." title="..." status="accepted|proposed|deprecated|superseded">`** — Architecture Decision Record.

## Type-Checked Snippets

Snippets are **not string literals** — they are real TypeScript checked at build time:

```tsx
import type { UserRepository } from "../src/db/user.repository.js";

<Snippet
  code={async () => {
    const repo = new UserRepository();
    const user = await repo.findByEmail("test@example.com");
    return user?.id;
  }}
/>
```

If the API changes and `findByEmail` is removed, the build fails. That's the point.

## Writing Style

**Do:**
- Write a few sentences per `<Doc>` — enough to orient someone unfamiliar with the area. Use `<H2>` sections to organize within a doc.
- Let node references (`{AuthService}`, `{DataLayer}`) carry meaning — they link to full details in the graph.
- Describe *what* exists, *where* it lives, *why* it matters.
- Use `priority="constraint"` for rules that must not be violated.

**Don't:**
- Narrate algorithms or control flow — that's what code is for.
- Duplicate what type signatures already say.
- Write implementation-level prose — focus on structural relationships and intent.

```tsx
// GOOD
<Doc explains="Task scheduling: queue, workers, retry policy">
  <P>{TaskQueue} dispatches jobs to {WorkerPool}.</P>
</Doc>

// BAD
<Doc explains="Task scheduling system">
  <P>The system works by accepting tasks into a prioritized queue. Workers pick
  tasks using round-robin, process them, and report results back to the coordinator...</P>
</Doc>
```

## File Organization

- **Keep files focused.** One `.tskb.tsx` file per feature area or architectural concern. If a file grows beyond ~15-20 registry declarations, split it.
- **Mirror the project filesystem** in `docs/` for top-level structure.
- **Split the registry across files.** Don't put all Folders, Modules, and Terms in one giant file:
  - `architecture.tskb.tsx` — top-level overview: main Folders, high-level relationships (`essential`)
  - `externals.tskb.tsx` — all External declarations (databases, APIs, npm packages) in one place
  - `vocabulary.tskb.tsx` — shared Terms used across multiple docs
  - `auth/auth.tskb.tsx` — Modules, Exports, and doc for the auth area
- ADRs belong in their own files under an `adr/` subfolder.
- Constraints belong in `constraints/` with `priority="constraint"`.

## After Editing

Always rebuild to validate references and update the graph:

```bash
npm run docs
```

The build fails if any import path, export name, or folder path doesn't resolve. Fix the error before committing.
