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

### 2. Find the questions

A good doc answers ONE question about the system. Your job is to find the right questions.

**Try the dev first.** Ask:
- What's hard about this area for someone new?
- What rules must always hold?
- What would surprise someone reading the code?
- What bug would happen if someone got this wrong?

**If the dev doesn't know yet** (often true — the area may be new to them too), do this instead:
- Read the code yourself.
- Look for tricky logic, error handling, "why" comments, recent bug fixes.
- Write down the questions the code answers.
- Bring the list back to the dev: "Here are the questions I think this area answers. Which are real? Which are wrong? What did I miss?"
- **Pause here** unless the dev has explicitly told you to just write it. Don't write docs cold off your own list.

It's much easier for a dev to react to a list than to think one up cold.

If you can't get an answer from the dev or the code, stop. Missing docs are better than wrong docs.

### 3. Ask if anything is unclear

If a question survives Step 2 but the answer is ambiguous, ask the dev before writing. Don't guess.

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

### 5. Place it

Each architectural area has a `main.tskb.tsx`. Declare any new modules, exports, and terms there. If the new doc is small or specialized, you can also put it in its own file next to `main.tskb.tsx`. See "Folder Structure" below.

### 6. Write

- A few sentences plus references is usually enough.
- Use `{NodeRef}` to link to other things instead of restating them.
- For multi-step processes, use `<Flow>` instead of prose.
- For code examples, use `<Snippet>` — they're type-checked.

For full syntax (registry primitives, JSX components, snippets, class methods), load the **`tskb-update-syntax`** skill.

### 7. Rebuild

Run the project's tskb build script (`npm run build:docs`). Fix any errors before committing.

## Key Rules

- **Map the structure, don't explain the code.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Use types, not strings.** Prefer `Module<{ type: typeof import("...") }>` and `Export<{ type: typeof import("...").Name }>` over plain descriptions. The compiler catches drift. Only use `Term` and `File` (string-only primitives) for things that have no importable type.
- **Import, don't hardcode.** If a type or class exists in the codebase, import it. Imports are validated by the compiler.
- **Rebuild after editing.** The build throws if any path or reference doesn't resolve.
- **Write in plain English.** Docs are read by people from many backgrounds, including non-native English speakers. Use short sentences, common words, and skip jargon. If a fancy word and a plain word mean the same thing, use the plain one. Examples: "uses" not "leverages", "starts" not "initiates", "make" not "facilitate", "call" not "invoke", "needs" not "requires".
- **Primitive `name` and `desc` are durable.** A registry key (the `name`) and its `desc` say what the thing is and why it matters — no implementation details that change as the code evolves. Skip algorithm names ("uses Fuse.js"), internal mechanics ("renders as ellipses"), tool calls ("via execSync"), and step-by-step lists. If the implementation is rewritten next month, the `desc` should still be true. Implementation details belong inside `<Doc>` prose, not in registry metadata. Examples: "Searches the graph and returns ranked matches" beats "Fuzzy searches the graph using Fuse.js across IDs, descriptions, and paths"; "DOT generator for the graph" beats "DOT file generator - renders folders as nested subgraphs, modules as ellipses, terms as diamonds".

## Folder Structure & Naming

### One main.tskb.tsx per area

Every important area has a file called `main.tskb.tsx`. An "area" is:
- a repo (tskb can document several at once)
- a package in a monorepo
- a subsystem inside a package
- a major sub-area inside a subsystem

The `main.tskb.tsx` file holds:
1. The area's main registry — folders, modules, exports, **and Terms** for the things that matter.
2. Reference aliases (`const X = ref as tskb.Modules["..."]`).
3. A short `<Doc>` that gives a quick overview of the area.

**Terms belong in the area's `main.tskb.tsx`.** A Term is the area's vocabulary — names like `SessionToken`, `Repository`, or `DispatchQueue` that several Docs in the area refer to. Declaring them with the area registry keeps the vocabulary in one place. Use simple, plain-English names; the Term's body is the short definition, so write it the way you would explain it to a teammate seeing the code for the first time.

Don't mirror every nested folder. Only create a `main.tskb.tsx` for areas that are themselves architectural — places a new dev would need to understand on their own.

### Other files next to main.tskb.tsx

You can put other `.tskb.tsx` files alongside `main.tskb.tsx` in the same folder. Use them for specific docs that don't belong in the overview — one question per file is fine.

The main registry still lives in `main.tskb.tsx`. **Registry declarations across all `.tskb.tsx` files merge into one global registry**, so a sibling file can reference anything declared anywhere else.

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

## Removing or Moving an Area

Deleting a Folder, Module, or Export breaks every `<Doc>`, `<Flow>`, or `<Relation>` that references it — the build fails on the missing key. Recovery:

1. `npx --no -- tskb search "<oldKey>" --plain` and `tskb context "<oldKey>" --plain` — find every dependent.
2. Update or delete the referencing docs **as part of the same change**. Don't leave stale references; don't comment out — delete.
3. Rebuild to confirm the graph still resolves.

## After Editing

Always rebuild to validate references and update the graph:

```bash
npm run build:docs
```

The build fails if any import path, export name, or folder path doesn't resolve. Fix the error before committing.

## Troubleshooting

If the build fails with a TypeScript error, check:
- `docs/tsconfig.json` has `"jsxImportSource": "tskb"`
- `baseUrl` and `rootDir` point to the repo root (e.g., `"../"`)
- Import paths in `.tskb.tsx` files end with `.js` (NodeNext module resolution)

**Monorepo tips:**
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
| `Folder<{ desc; path; boundary? }>` | A logical area of the codebase. Add `boundary` only on the top-level folder of a distinct runtime — see below. |
| `Module<{ desc; type: typeof import("...") }>` | A source file — import path validates it exists. |
| `Export<{ desc; type: typeof import("...").Name }>` | A named export — compiler validates it exists. |
| `File<{ desc; path }>` | Non-TS/JS files: configs, READMEs, specs. |
| `External<{ desc; [key]: string }>` | npm packages, APIs, services outside the repo. |
| `Term<"...">` | A name from the area's vocabulary (e.g., `SessionToken`, `DispatchQueue`). Declared in the area's `main.tskb.tsx` and used across that area's docs. |

**Import paths must resolve.** Use `.js` extensions with NodeNext module resolution.

**Import source files, not build output.** Always point `typeof import()` at `src/`, never at `dist/` or `build/`. The compiler resolves source — built files may not exist at doc-build time and their types can differ.

> The "keep `name` and `desc` durable" rule (with examples) lives in the **`tskb-update`** skill's Key Rules. Implementation details belong in `<Doc>` prose, not registry metadata.

### The boundary prop

`boundary` marks a folder as the root of a distinct runtime or deployment unit — a process, app, or package that runs or deploys on its own. Add it only to the **top-level folder** that IS that boundary; never repeat it on sub-folders inside.

Prefer one of these. Add a new value only if your runtime genuinely doesn't fit:

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

### Documenting class methods

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

- **`<Doc explains="..." priority?>`** — Root component. Every file exports one default Doc. The `explains` string must be a real question (see below).
  - `priority="essential"` — shown in `tskb ls`. Use sparingly for orientation docs.
  - `priority="constraint"` — architectural rules. Must be followed. Shown in `pick` results.
  - `priority="supplementary"` (default) — additional context.
- **`<P>`**, **`<H1>`**, **`<H2>`**, **`<H3>`**, **`<List>`/`<Li>`** — Content structure.
- **`<Snippet code={() => { ... }} />`** — Type-checked code example. Real imports, not strings.
- **`<Relation from={NodeA} to={NodeB} label?="..." />`** — Explicit semantic edge between two nodes.
- **`<Adr id="..." title="..." status="accepted|proposed|deprecated|superseded">`** — Architecture Decision Record.
- **`<Flow name="..." desc="..." priority?>`** — Named, ordered sequence of steps through the system. Becomes a first-class graph node. Only `<Step>` children allowed.
  - `priority="essential"` — included in generated skills and `tskb flows` output.
  - `priority="supplementary"` (default) — graph-only, queryable via `tskb flows`.
- **`<Step node={NodeRef} label?="..." />`** — A single participant in a Flow. References any registered node.

## Type-Checked Snippets

Snippets show **TypeScript or JavaScript code** — usually a small example of how a class or function from the codebase is used. They are **not string literals**. The `code` prop is a real arrow function that the TypeScript compiler reads at build time.

### What snippets are for

- Showing how a class, function, or API is called.
- Giving a runnable-looking example for someone reading a doc.
- Pinning the example to the real types — if the API changes, the build fails.

### Rules

1. **JS/TS only.** The body of `code={() => { ... }}` must be valid JavaScript or TypeScript. No raw JSON, no shell, no SQL, no YAML.
2. **Import the real modules.** Pull the types and values you reference from the actual source files — same rules as the registry (use `.js` extensions, point at `src/` not `dist/`).
3. **The compiler validates the body.** If a method is renamed or removed, the snippet fails to compile and the doc build fails. That's the point.
4. **Snippets are never executed.** They're parsed, type-checked, and stringified at build time. Side-effects, network calls, and `process.exit()` in the body don't matter — nothing runs.

### Basic example

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

If `findByEmail` is renamed, the build fails — the doc can't drift.

### Showing non-JS content

Sometimes the example you want to show is JSON, a shell command, a SQL query, or a config blob. The body still has to be valid JS, so wrap the content in a JS expression:

**JSON output** — use `JSON.stringify`:

```tsx
import { buildConfig } from "../src/config.js";

<Snippet
  code={() => {
    const config = buildConfig({ env: "prod" });
    return JSON.stringify(config, null, 2);
  }}
/>
```

**Shell command** — use `execSync` (the call is type-checked, the command isn't run at doc-build time):

```tsx
import { execSync } from "node:child_process";

<Snippet
  code={() => execSync("npx --no -- tskb search 'auth' --plain")}
/>
```

**SQL or other strings** — use a tagged template or plain string literal:

```tsx
<Snippet
  code={() => `
    SELECT id, email FROM users WHERE active = true;
  `}
/>
```

The point of the wrapper is the same: the body stays valid JS, and TypeScript still validates any imports or function calls inside it.

### What goes in tsconfig

To support the types your snippets need, extend the docs `tsconfig.json`:
- Add `lib` entries (`"DOM"`, `"ES2022"`) for browser or modern-runtime APIs.
- Add `paths` aliases if your project uses them.
- Add `types` for ambient declarations.

The docs `tsconfig.json` is independent from the project's build config — tailor it for documentation without affecting production builds.

## Relations

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

## Flows

A `<Flow>` describes a multi-step process through the system — how several parts work together to do one thing. Reach for a Flow when a `<Relation>` is too thin (more than two participants, or order matters) and when describing the path in prose would hide the structure.

### What goes in a flow

- **Lean on registered nodes.** Steps should reference real anchors from the registry — usually modules and exports, with externals, terms, and folders pulled in where they help tell the story.
- **Cover the whole path.** Include every meaningful node a request touches, not just the endpoints.
- **The first `<Step>` is the orchestrator.** Make the thing that kicks off the flow the actual first step, not just a mention in `desc`. If the trigger is a CLI command, a test file, an HTTP route, or a cron handler, that node belongs at the top of the flow. This way the flow stays anchored to a real entry point: when that file or export is renamed, moved, or removed, the build catches it. Use the `desc` to add the real-world context around the trigger ("user submits login form", "cron tick fires", "developer runs `npm test`").

### Step labels

- Short, plain wording. Describe what *this node does in this flow*, not what the node is in general.
- Keep them in the actual execution order.
- **Avoid drift-prone details.** Don't bake hardcoded paths, filenames, default values, CLI flag spellings, or environment variables into labels or `desc`. None of that is validated — when the code changes, the flow silently lies. Stick to roles ("reads the graph file from disk", "writes chunks to the output directory") and let the registered node anchors carry the implementation. If an exact path or value is essential, put it in a `<Snippet>` where the type checker can see it.

### Don't branch

A flow is one path. If two branches both matter, write two flows. If only one really matters, document that one and mention the alternative in prose.

### Naming

Kebab-case, area-prefixed: `auth-login`, `task-dispatch`, `dashboard-load`. The prefix groups related flows in `tskb flows` output.

### `priority="essential"`

Reserve for flows the system can't run without — the core paths a new dev needs to see on day one. Essential flows are bundled into generated skills; supplementary flows stay queryable via `tskb flows` but don't get auto-loaded.

### Example

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

## Writing Style

> Plain-English and durable-`desc` rules live in the **`tskb-update`** skill's Key Rules. The points below are syntax-shaped guidance only.

**Do:**
- Make every `<Doc explains="...">` a real question, ending with "?".
- One question per doc. Many small docs beat one big doc.
- Keep prose short — a few sentences plus references.
- Let `{NodeRef}` carry meaning. Links beat repeating.
- Use `<Flow>` for multi-step processes — anchor the trigger in a real use case, lean on registered nodes for steps, and don't branch.
- Use `<Relation>` to surface non-obvious links — labels describe the functional role one node plays for the other, not the function name being called.
- Use `priority="constraint"` for rules that must not be broken.

**Don't:**
- Write a doc on a topic you can't explain yet — ask the dev first.
- Use vague `explains` strings like `"Authentication"` or `"Data layer"`.
- Use feature-list `explains` strings like `"X: A, B, C"` — name the question instead.
- Cram multiple unrelated topics into one Doc.
- Narrate code line by line. The code is right there.
- Repeat what type signatures already say.

```tsx
// GOOD — Flow for a multi-step process
<Flow name="task-dispatch" desc="Task scheduling through queue and workers" priority="essential">
  <Step node={TaskQueue} />
  <Step node={WorkerPool} label="picks and executes" />
  <Step node={ResultCollector} label="reports back" />
</Flow>

// GOOD — short doc framed as a question
<Doc explains="How does the dispatch queue route tasks to workers?">
  <P>{TaskQueue} hands jobs to {WorkerPool}.</P>
</Doc>

// BAD — process described in prose instead of a Flow
<Doc explains="Task scheduling system">
  <P>The system works by accepting tasks into a prioritized queue. Workers pick
  tasks using round-robin, process them, and report results back to the coordinator...</P>
</Doc>
```
