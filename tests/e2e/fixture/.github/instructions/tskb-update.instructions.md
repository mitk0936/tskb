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
- Two parts of the codebase are connected in a way the folder tree and imports don't show — capture it as a `<Relation>`, not a sentence buried in a doc.
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

- **Prefer structure over prose.** Before you write a paragraph, ask what it actually says. If it says "X depends on / owns / feeds / guards Y", declare that as a `<Relation from={X} to={Y} label="..." />` — one edge the graph can hold and query — instead of spelling it out in sentences a reader has to parse back into structure. Keep prose for the one question the doc answers and the "why" behind it.
- A few sentences plus references is usually enough — a doc is not an essay.
- Use `{NodeRef}` to link to other things instead of restating them.
- For a single link between two nodes, reach for `<Relation>`; for a multi-step process, reach for `<Flow>`. Both beat prose that hides the structure.
- For code examples, use `<Snippet>` — they're type-checked. Always include a short comment or sentence (above the snippet or as a leading code comment) explaining what the snippet demonstrates, so the example isn't left to speak for itself.

For full syntax (registry primitives, JSX components, snippets), load the **`tskb-update-syntax`** skill.

### 6. Rebuild

Run `npm run build:docs`. The build fails if any import path, export name, or folder path doesn't resolve. Fix errors before committing.

## Key Rules

- **Map the structure, don't explain the code.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Describe relations, don't narrate them.** A link between two nodes is a `<Relation>`; a process is a `<Flow>`. Prose that restates a connection the graph could hold as an edge is text bloat — cut it. Save sentences for the question the doc answers and the reasoning a reader can't get from the edges.
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

For naming registry keys, when to split a file, and the top-level layout under `docs/`, load the **Folder layout & naming** section below.

## Folder layout & naming

### Top-level files in `docs/`

- `architecture.tskb.tsx` — overview of the whole repo: main areas and how they fit.
- `vocabulary.tskb.tsx` — only for `Terms` and `Externals` shared across many areas (e.g., a domain concept used by both client and server). Area-specific Terms belong in that area's `main.tskb.tsx`.
- `adr/` — Architecture Decision Records, one file per decision.
- `constraints/` — docs with `priority="constraint"`, one rule per file.

### Naming registry keys

Keys should hint at where the thing lives, but stay short. The goal: a reader sees the key and knows what it refers to.

Both styles are fine — pick what reads better:
- Dot-separated lowercase: `auth.service.login`
- PascalCase: `AuthService`, `LoginEndpoint`

Keep keys meaningful, not exhaustive:

```
GOOD: ServerUtils
BAD:  MicroservicesServerUtils    // too much path baked in
```

Class methods follow the parent: `pkg.MyClass.mount`.

**Keys are global.** The same key can't appear twice across all files.

### When to split a file

Split when:
- The registry block has more than ~15–20 declarations.
- The file mixes unrelated areas (e.g., auth and payments).
- One `<Doc>` is growing into a wall of prose — turn it into several smaller question-shaped docs, possibly in separate files.

## Removing or moving an area

Deleting a Folder, Module, or Export breaks every `<Doc>`, `<Flow>`, or `<Relation>` that references it — the build fails on the missing key.

Recovery:

1. `npx --no -- tskb search "<oldKey>" --plain` and `tskb context "<oldKey>" --plain` — find every dependent.
2. Update or delete the referencing docs **as part of the same change**. Don't leave stale references; don't comment out — delete.
3. Rebuild to confirm the graph still resolves.

## tskb setup & troubleshooting

If the build fails with a TypeScript error, check:
- `docs/tsconfig.json` has `"jsxImportSource": "tskb"`
- `baseUrl` and `rootDir` point to the repo root (e.g., `"../"`)
- Import paths in `.tskb.tsx` files end with `.js` (NodeNext module resolution)

### Monorepo tips

- Place `docs/` at the workspace root.
- Set `baseUrl` and `rootDir` to `"../"` from the docs folder (or adjust for your layout).
- Add `paths` entries for workspace packages if needed.


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
| `Folder<{ desc; path; boundary? }>` | A logical area of the codebase. Add `boundary` only on the top-level folder of a distinct runtime — see the **Boundary prop reference** section below. |
| `Module<{ desc; type: typeof import("...") }>` | A source file — import path validates it exists. |
| `Export<{ desc; type: typeof import("...").Name }>` | A named export — compiler validates it exists. For class methods, see the **Documenting class methods** section below. |
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

## Inlining Type-Driven Values

When prose names a value the type system already knows — a `package.json` key, a string-enum member, a string-union member — bind it with `val` and reference it inline. The extractor resolves the asserted type through the TypeScript checker at build time and emits the literal string. Same shape as `ref`, different intent: `ref` points at a registered node, `val` inlines a string the compiler can prove.

```tsx
import { val } from "tskb";
import { TaskPhase, type TaskStatus } from "../src/models/task.js";

type Pkg = typeof import("../package.json");

// package.json keys — cite a bin, script, or dep by name
const BinName       = val as keyof Pkg["bin"];                                  // → "tskb"
const BuildScript   = val as Extract<keyof Pkg["scripts"], "build">;            // → "build"
const TypeScriptDep = val as Extract<keyof Pkg["dependencies"], "typescript">;  // → "typescript"

// string-union member
const TodoStatus = val as Extract<TaskStatus, "todo">;                          // → "todo"

// string-enum member
const DraftPhase = val as typeof TaskPhase.Draft;                               // → "draft"

// in JSX:
<P>The <code>{BinName}</code> bin runs after <code>npm run {BuildScript}</code>.</P>
<P>Depends on <code>{TypeScriptDep}</code>.</P>
<P>New tasks start in <code>{DraftPhase}</code> phase as <code>{TodoStatus}</code>.</P>
```

**Rules:**

- **One var = one literal.** The asserted type must resolve to a *single* string-literal type. Unions, plain `string`, `never`, and non-string types are silently skipped — narrow a union with `Extract<U, "member">`.
- **Use `as`, not generics.** Same shape as `ref` — keeps the DSL uniform across all type-driven bindings.
- **Type changes flow through.** Rename a script, drop a dep, remove a union member — the doc either auto-updates or fails to type-check. No stale prose.

**Why `Extract`?** `val as keyof Pkg["scripts"]` resolves to the *union* of all script names, not one literal, and gets silently skipped. `Extract<keyof Pkg["scripts"], "build">` narrows to the one name and validates at compile time that the script actually exists. Rename or delete it and TypeScript reports `Type '"build"' is not assignable to type 'never'` at the assertion site.

**Limitation — nested JSON values widen.** TypeScript keeps literal types for top-level JSON properties and object keys, but widens nested *string values*. So `Pkg["scripts"]["build"]` resolves to plain `string`, not the literal command body — and `val` skips it. Cite **names** via `keyof` / `Extract`, not value bodies. Same constraint applies to dep version strings.

### Citing deep key paths with `DotPath`

For "this lives at `a.b.c` in some config" prose, use `DotPath<T, P>`. Each segment in the tuple `P` is validated against `keyof` at its level; restructure the type and the binding stops type-checking.

```tsx
import { val, type DotPath } from "tskb";
import { taskDefaults } from "../src/models/task.js";

type Pkg = typeof import("../package.json");

const ServerHostPath = val as DotPath<AppConfig, ["system", "server", "host"]>;
// → "system.server.host"

const PageLimitPath = val as DotPath<typeof taskDefaults, ["pagination", "defaultLimit"]>;
// → "pagination.defaultLimit"

const BuildScriptPath = val as DotPath<Pkg, ["scripts", "build:lib"]>;
// → "scripts.build:lib"

<P>Override the listener with <code>{ServerHostPath}</code> in <code>config.json</code>.</P>
```

Works on any TS shape — JSON imports, `interface` declarations, `as const` objects, `typeof someValue`. `DotPath` only walks `keyof`, so it sidesteps the nested-string-value widening that blocks the direct `val as Pkg["scripts"]["build:lib"]` form. Returns `never` when a segment isn't a key — the assertion fails to type-check at the call site rather than silently emitting nothing.

## JSX Components

- **`<Doc explains="..." priority?>`** — Root component. Every file exports one default Doc. The `explains` string must be a real question.
  - `priority="essential"` — shown in `tskb ls`. Use sparingly for orientation docs.
  - `priority="constraint"` — architectural rules. Must be followed. Shown in `pick` results.
  - `priority="supplementary"` (default) — additional context.
- **`<P>`**, **`<H1>`**, **`<H2>`**, **`<H3>`**, **`<List>`/`<Li>`** — Content structure.
- **`<Snippet code={() => { ... }} />`** — Type-checked code example. See Snippets below.
- **`<Relation from={NodeA} to={NodeB} label?="..." />`** — Explicit semantic edge between two nodes. See the **Relations — when, what, and which direction** section below for label and direction guidance.
- **`<Adr id="..." title="..." status="accepted|proposed|deprecated|superseded">`** — Architecture Decision Record.
- **`<Flow name="..." desc="..." priority?>`** — Named, ordered sequence of steps through the system. Becomes a first-class graph node. Only `<Step>` children allowed. See Flows below.
- **`<Step node={NodeRef} label?="..." />`** — A single participant in a Flow. References any registered node.

## Snippets

The `code` prop is a real arrow function — TypeScript reads it at build time, so renames break the build. The body must be valid JS/TS (no raw JSON, shell, or SQL strings). Snippets are never executed.

**Always explain what the snippet shows.** Either a short sentence in the surrounding prose (e.g. *"Looking up a user by email:"*) or a leading code comment inside the arrow body. A snippet without context forces the reader to reverse-engineer the point.

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

If `findByEmail` is renamed, the build fails — the doc can't drift. For wrapping JSON, shell commands, or SQL inside a snippet, see the **Snippets — non-JS content and tsconfig tweaks** section below.

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

## Boundary prop reference

`boundary` marks a folder as the root of a distinct runtime or deployment unit — a process, app, or package that runs or deploys on its own. Add it only to the **top-level folder** that IS that boundary; never repeat it on sub-folders inside.

Prefer one of these values. Add a new value only if your runtime genuinely doesn't fit:

| Value | When to use |
|-------|-------------|
| `"[NAME] repository"` | A distinct git repo |
| `"[NAME] package"` | An npm package root with its own `package.json`, published or consumed as a library |
| `"[NAME] SPA"` | A browser single-page application (Vite, CRA, Next.js client bundle) |
| `"[NAME] client"` | Frontend app in a project that also has a server. Pair with `"server"`. |
| `"[NAME] server"` | Node.js (or similar) backend process. Pair with `"client"` when both exist. |
| `"[NAME] CLI"` | A command-line binary published or invoked as its own process |
| `"[NAME] worker"` | Background or queue worker — long-running process, distinct from request handlers |
| `"[NAME] function"` | Serverless function / Lambda / Cloud Function — each deployable unit is its own boundary |
| `"[NAME] mobile app"` | iOS or Android app target |
| `"[NAME] extension"` | Browser or IDE extension package with its own runtime host |
| `"[NAME] daemon"` | OS-level daemon or background service |
| `"[TYPE] tests"` | Test suite root — the test runner is a distinct process from production code |

**Don't** add boundary to architectural layers (core, cli, utils, shared types), sub-folders already inside a bounded area, or organizational groupings with no independent runtime. If in doubt, leave it off.

## Documenting class methods

For classes with important methods (public or private), declare one `Export` per method using a local type alias and `InstanceType`:

```tsx
// 1. Hoist the class constructor type once at the top of the file
type MyClass = typeof import("src/my-class.js").MyClass;

// 2. One Export per method — works for private methods too
interface Exports {
  "pkg.MyClass": Export<{
    desc: "Top-level controller. Call mount() once on startup.";
    type: MyClass;
  }>;

  "pkg.MyClass.mount": Export<{
    desc: "Public entry point. Wires dependencies and loads initial data.";
    type: InstanceType<MyClass>["mount"];
  }>;

  "pkg.MyClass.render": Export<{
    desc: "Re-runs the full D3 enter/update/exit cycle.";
    type: InstanceType<MyClass>["render"]; // works even if render is private
  }>;
}
```

`InstanceType<MyClass>["methodName"]` resolves to the actual method signature. The compiler validates the name exists and catches renames. Works for **both public and private** TypeScript members.

## Snippets — non-JS content and tsconfig tweaks

The snippet body must be valid JavaScript or TypeScript. When the content you want to show isn't JS — JSON, a shell command, a SQL query, a config blob — wrap it in a JS expression so the body stays valid and the imports keep getting type-checked.

### JSON output — use `JSON.stringify`

```tsx
import { buildConfig } from "../src/config.js";

<Snippet
  code={() => {
    const config = buildConfig({ env: "prod" });
    return JSON.stringify(config, null, 2);
  }}
/>
```

### Shell command — use `execSync`

The call is type-checked; the command isn't run at doc-build time.

```tsx
import { execSync } from "node:child_process";

<Snippet
  code={() => execSync("npx --no -- tskb search 'auth' --plain")}
/>
```

### SQL or other strings — tagged template or plain string

```tsx
<Snippet
  code={() => `
    SELECT id, email FROM users WHERE active = true;
  `}
/>
```

The point of the wrapper is the same: the body stays valid JS, and TypeScript still validates any imports or function calls inside it.

### tsconfig tweaks for snippets

To support the types your snippets need, extend the docs `tsconfig.json`:
- Add `lib` entries (`"DOM"`, `"ES2022"`) for browser or modern-runtime APIs.
- Add `paths` aliases if your project uses them.
- Add `types` for ambient declarations.

The docs `tsconfig.json` is independent from the project's build config — tailor it for documentation without affecting production builds.

## Relations — when, what, and which direction

A `<Relation from={A} to={B} label="..." />` is a single semantic edge between two registered nodes. Use it for one-line "X relates to Y" facts. For anything with order or multiple participants, use a `<Flow>` instead.

### What Relations are for

**Pointing out non-obvious links between parts of the codebase** — connections a reader wouldn't see by following the folder tree, the imports, or the module morphology. Two distant modules that share a hidden coupling. A module that depends on an external boundary the import graph doesn't make obvious. A folder that owns a domain term defined elsewhere. If the link is already visible from the structural edges (`belongs-to`, `contains`) or the import graph, you don't need a Relation.

### What labels should say

Describe the **functional or architectural relationship** — the role one part plays for the other. Not how it's wired in code.

- **Good:** "owns user identity", "is the source of truth for tasks", "wraps the compiler API", "depends on for auth", "renders into".
- **Bad:** "calls login()", "imports `validateToken`", "instantiates new AuthService()". These are implementation details — the imports edge and morphology already capture them, and they break the moment a method is renamed.

If the only thing you can say about the edge is the name of a function call, you don't need a Relation.

### Direction matters

Read the label as a verb phrase from `from` to `to`. Pick `from`/`to` so the sentence scans naturally: `<Relation from={AuthService} to={Postgres} label="persists sessions to" />` reads "AuthService persists sessions to Postgres".

