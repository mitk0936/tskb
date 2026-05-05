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
