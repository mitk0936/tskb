---
applyTo: "**/*.tskb.tsx"
---

# TSKB — Write & Update Documentation

This project uses **TSKB**, a semantic knowledge graph of the codebase.
This guide covers how to write, update, and maintain `.tskb.tsx` documentation files — workflow, folder structure, registry primitives, JSX components, and best practices.

## When to Update

Update the docs when:
- A new feature area is being built — declare it before or alongside the code.
- You spot a folder, module, or export that matters but isn't in the graph.
- An architectural decision needs to be recorded (use `<Adr>`).
- A rule must be followed for the system to keep working (use `priority="constraint"`).
- A multi-step process spans several modules — capture it as a `<Flow>`, not prose.
- The dev asks for it.

Don't update for fixes that don't change structure (renames inside a function, off-by-one fixes, log tweaks), purely internal refactors, or temporary code. **Do** update if a fix reveals a missing constraint or surfaces an undocumented invariant — that's not "routine".

## Documentation Workflow

When asked to document something, follow these steps. Don't skip ahead to writing.

### 1. Look first

See what's already there:

```bash
npx --no -- tskb context "<nodeId|path>" --plain   # docs and modules in this area
npx --no -- tskb ls --plain                        # which folders are mapped
npx --no -- tskb search "<keywords>" --plain       # is this already written?
```

If a doc already covers the topic, update it. Don't write a second one.

### 2. Discover what's already declared

Before declaring new Terms, Externals, or Modules, see what already exists — reuse beats redeclare:

```bash
npx --no -- tskb registry --plain                          # overview: counts + samples per kind
npx --no -- tskb registry "<concept>" --plain              # fuzzy across all registry kinds
npx --no -- tskb registry --type=term --plain              # all Terms (the area vocabularies)
npx --no -- tskb registry --type=external --plain          # all Externals (npm packages, services)
```

If a Term already names the concept you were about to introduce, reference it (`{ExistingTerm}`) instead of declaring a new one. Same for Externals — one declaration per external dependency, shared across all docs that touch it.

### 3. Find the questions

A good doc answers ONE question about the system. Your job is to find the right questions.

**Try the dev first.** Ask:
- What's hard about this area for someone new?
- What rules must always hold?
- What would surprise someone reading the code?
- What bug would happen if someone got this wrong?

**If the dev doesn't know yet** (often true — the area may be new to them too):
- Read the code yourself.
- Look for tricky logic, error handling, "why" comments, recent bug fixes.
- Write down the questions the code answers.
- Bring the list back to the dev: "Here are the questions I think this area answers. Which are real? Which are wrong? What did I miss?"
- **Pause here** unless the dev has explicitly told you to just write it.

If a question survives the conversation but its answer is ambiguous, ask before writing. Missing docs are better than wrong docs.

### 4. Frame each doc as a question

Every `<Doc explains="...">` answers one question. Write the question in plain language and end it with a question mark.

```tsx
// GOOD — one specific question
<Doc explains="How does login issue JWTs?">
<Doc explains="Why does the worker pool re-queue on partial failure?">
<Doc explains="What ordering does the dispatch queue guarantee?" priority="constraint">

// BAD — topic, not a question
<Doc explains="Authentication">

// BAD — feature list, not a question
<Doc explains="CLI logging: stderr-only output, --verbose flag">

// BAD — two questions in one
<Doc explains="How does login work and how do sessions expire?">
// → split into two docs
```

This rule applies to **new docs**. Older statement-form docs are fine where they are — only update them if you're already touching the file for another reason.

### 5. Place it & write

Declare any new modules, exports, and Terms in the **closest** area's `main.tskb.tsx` — the one that owns the related code. The registry merges across files so any placement compiles, but locality keeps each area's entry point honest. See "Where things go" below for the rule. Small or specialized docs can live in their own file alongside `main.tskb.tsx`.

- A few sentences plus references is usually enough.
- Use `{NodeRef}` to link to other things instead of restating them.
- For multi-step processes, use `<Flow>` instead of prose.
- For code examples, use `<Snippet>` — they're type-checked.

For full syntax (registry primitives, JSX components, snippets), load the **`tskb-update-syntax`** skill.

### 6. Rebuild

Run `npm run build:docs`. The build fails if any import path, export name, or folder path doesn't resolve. Fix errors before committing.

## Key Rules

- **Map the structure, don't explain the code.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Use types, not strings.** Prefer `Module<{ type: typeof import("...") }>` and `Export<{ type: typeof import("...").Name }>` over plain descriptions. The compiler catches drift. Only use `Term` and `File` (string-only primitives) for things that have no importable type.
- **Import, don't hardcode.** If a type or class exists in the codebase, import it. Imports are validated by the compiler.
- **Rebuild after editing.** The build throws if any path or reference doesn't resolve.
- **Write in plain English.** Docs are read by people from many backgrounds, including non-native English speakers. Use short sentences, common words, and skip jargon. If a fancy word and a plain word mean the same thing, use the plain one. Examples: "uses" not "leverages", "starts" not "initiates", "make" not "facilitate", "call" not "invoke", "needs" not "requires".
- **Primitive `name` and `desc` are durable.** A registry key (the `name`) and its `desc` say what the thing is and why it matters — no implementation details that change as the code evolves. Skip algorithm names ("uses Fuse.js"), internal mechanics ("renders as ellipses"), tool calls ("via execSync"), and step-by-step lists. If the implementation is rewritten next month, the `desc` should still be true. Implementation details belong inside `<Doc>` prose, not in registry metadata. Examples: "Searches the graph and returns ranked matches" beats "Fuzzy searches the graph using Fuse.js across IDs, descriptions, and paths"; "DOT generator for the graph" beats "DOT file generator - renders folders as nested subgraphs, modules as ellipses, terms as diamonds".

## Where things go

**Locality: register a node next to its closest neighbors.** A Module belongs in the area that owns its source file. An Export goes wherever its Module is declared. A Term lives in the area whose Docs use it (only promote to `vocabulary.tskb.tsx` when multiple distant areas share it). The compiler accepts any placement because the registry merges across files — but a node declared far from its kin makes its area's entry point misleading and forces the next reader to chase declarations across the repo.

Every important area has a `main.tskb.tsx` — that's the area's entry point and registry root. An "area" is a repo, a package in a monorepo, a subsystem inside a package, or a major sub-area inside a subsystem. Don't mirror every nested folder; only create a `main.tskb.tsx` for areas a new dev would need to understand on their own.

The `main.tskb.tsx` file holds:
1. The area's main registry — folders, modules, exports, **and Terms** for the things that matter.
2. Reference aliases (`const X = ref as tskb.Modules["..."]`).
3. A short `<Doc>` that gives a quick overview of the area.

You can put other `.tskb.tsx` files alongside `main.tskb.tsx` for specific docs — one question per file is fine. **Registry declarations across all `.tskb.tsx` files merge into one global registry**, so a sibling file can reference anything declared anywhere else.

For naming registry keys, when to split a file, and the top-level layout under `docs/`, load `references/folder-layout.md`.

## References (load only when needed)

- `references/folder-layout.md` — top-level `docs/` files, naming registry keys, and when to split a file. Load when creating a new area or splitting up a doc.
- `references/removing-areas.md` — recovery procedure when deleting or moving a Folder, Module, or Export breaks references. Load when the build fails after a deletion or rename.
- `references/setup.md` — tsconfig requirements, monorepo tips, common build errors. Load when tskb is being set up in a new repo or the build is failing on config.


---

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

