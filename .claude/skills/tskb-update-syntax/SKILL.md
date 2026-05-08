---
name: tskb-update-syntax
description: "Syntax reference for writing .tskb.tsx files: file anatomy, registry primitives, JSX components, type-checked snippets, the boundary prop, and class-method patterns. Load when actually editing or creating a .tskb.tsx file. For the workflow (when to update, where to put things, how to find questions to answer), see the tskb-update skill."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob, Grep
---

# TSKB — Authoring Syntax

Reference for the syntax used inside `.tskb.tsx` files. Load this when your hands are on the keyboard. For when/where/how-to-think, see the `tskb-update` skill.

## File Anatomy

A `.tskb.tsx` file has two parts.

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

**2. JSX content** — the default-exported `<Doc>` plus its references:

```tsx
import { Doc, H1, P, ref } from "tskb";

const AuthFolder = ref as tskb.Folders["auth"];
const AuthService = ref as tskb.Modules["auth.service"];
const SessionToken = ref as tskb.Terms["session-token"];

export default (
  <Doc explains="How does login issue and validate JWTs?" priority="essential">
    <H1>Login</H1>
    <P>{AuthService} lives in {AuthFolder} and issues {SessionToken} on login.</P>
  </Doc>
);
```

## Registry Primitives

| Primitive | When to use |
|-----------|-------------|
| `Folder<{ desc; path; boundary? }>` | A logical area of the codebase. Add `boundary` only on the top-level folder of a distinct runtime — see `references/boundaries.md`. |
| `Module<{ desc; type: typeof import("...") }>` | A source file — import path validates it exists. |
| `Export<{ desc; type: typeof import("...").Name }>` | A named export — compiler validates it exists. For class methods, see `references/class-methods.md`. |
| `File<{ desc; path }>` | Non-TS/JS files: configs, READMEs, specs. |
| `External<{ desc; [key]: string }>` | npm packages, APIs, services outside the repo. |
| `Term<"...">` | A name from the area's vocabulary (e.g., `SessionToken`, `DispatchQueue`). Declared in the area's `main.tskb.tsx` and used across that area's docs. |

**Import paths must resolve.** Use `.js` extensions with NodeNext module resolution.

**Import source files, not build output.** Always point `typeof import()` at `src/`, never at `dist/` or `build/`. The compiler resolves source — built files may not exist at doc-build time and their types can differ.

> The "keep `name` and `desc` durable" rule (with examples) lives in the **`tskb-update`** skill's Key Rules. Implementation details belong in `<Doc>` prose, not registry metadata.

## Referencing Nodes

Declare a constant with a type assertion, then use it inline:

```tsx
const MyModule = ref as tskb.Modules["my.module"];   // reference a module
const MyTerm   = ref as tskb.Terms["my-concept"];    // reference a term
// then in JSX:
<P>{MyModule} uses {MyTerm}.</P>
```

The `ref` value is a placeholder — only the type matters. The compiler validates that the key exists in the registry.

## JSX Components

- **`<Doc explains="..." priority?>`** — Root component. Every file exports one default Doc. The `explains` string must be a real question.
  - `priority="essential"` — shown in `tskb ls`. Use sparingly for orientation docs.
  - `priority="constraint"` — architectural rules. Must be followed. Shown in `pick` results.
  - `priority="supplementary"` (default) — additional context.
- **`<P>`**, **`<H1>`**, **`<H2>`**, **`<H3>`**, **`<List>`/`<Li>`** — Content structure.
- **`<Snippet code={() => { ... }} />`** — Type-checked code example. See Snippets below.
- **`<Relation from={NodeA} to={NodeB} label?="..." />`** — Explicit semantic edge between two nodes. See `references/relations.md` for label and direction guidance.
- **`<Adr id="..." title="..." status="accepted|proposed|deprecated|superseded">`** — Architecture Decision Record.
- **`<Flow name="..." desc="..." priority?>`** — Named, ordered sequence of steps through the system. Becomes a first-class graph node. Only `<Step>` children allowed. See Flows below.
- **`<Step node={NodeRef} label?="..." />`** — A single participant in a Flow. References any registered node.

## Snippets

The `code` prop is a real arrow function — TypeScript reads it at build time, so renames break the build. The body must be valid JS/TS (no raw JSON, shell, or SQL strings). Snippets are never executed.

```tsx
import { UserRepository } from "../src/db/user.repository.js";

<Snippet
  code={async () => {
    const repo = new UserRepository();
    const user = await repo.findByEmail("test@example.com");
    return user?.id;
  }}
/>
```

If `findByEmail` is renamed, the build fails — the doc can't drift. For wrapping JSON, shell commands, or SQL inside a snippet, see `references/snippets-advanced.md`.

## Flows

A `<Flow>` describes a multi-step process — how several parts work together to do one thing. Reach for it when a `<Relation>` is too thin (more than two participants, or order matters) and prose would hide the structure.

**Core rules:**
- **Lean on registered nodes** — steps reference real anchors (modules, exports, externals, terms, folders). Never raw strings.
- **The first `<Step>` is the orchestrator** — the CLI command, HTTP route, test file, or cron handler that kicks the flow off. Use `desc` for the real-world context ("user submits login form").
- **Cover the whole path** — every meaningful node a request touches.
- **Don't branch** — a flow is one path. Two branches that both matter → two flows.
- **Avoid drift-prone details** — no hardcoded paths, filenames, default values, or CLI flag spellings in labels or `desc`. None of that is validated. Stick to roles ("reads the graph file from disk"); let the registered nodes carry the implementation.
- **Naming** — kebab-case, area-prefixed (`auth-login`, `task-dispatch`). The prefix groups related flows in `tskb flows` output.
- **`priority="essential"`** — reserve for flows the system can't run without; essential flows get bundled into generated skills.

```tsx
<Flow
  name="auth-login"
  desc="User submits login form; API route validates credentials and issues a JWT"
  priority="essential"
>
  <Step node={ApiRoutes} label="receives login request" />
  <Step node={AuthServiceExport} label="validates credentials" />
  <Step node={Postgres} label="queries user record" />
  <Step node={AuthServiceExport} label="signs and returns JWT" />
</Flow>
```

## References (load only when needed)

- `references/boundaries.md` — full table of `boundary` values + when to use each. Load when adding `boundary` to a top-level folder.
- `references/class-methods.md` — declare one Export per method (public or private) using `InstanceType<...>`. Load when documenting a class with notable methods.
- `references/snippets-advanced.md` — wrapping JSON, shell commands, SQL or other non-JS content inside a snippet body, plus tsconfig tweaks. Load when a basic snippet won't fit.
- `references/relations.md` — what to put in a `<Relation>` label, when an edge is worth declaring, and which direction to pick. Load when adding a `<Relation>`.

