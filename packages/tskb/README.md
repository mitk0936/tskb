# tskb

Let your **AI assistant document your codebase** as it works. Architecture knowledge accumulates in a **compiler-verified artifact** — query it, ask questions about your system, navigate it with your AI.

> **Your AI writes the docs. You navigate them.**

[![npm version](https://badge.fury.io/js/tskb.svg)](https://www.npmjs.com/package/tskb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## See it work

```bash
npm install --save-dev tskb
npx tskb init
npm run docs
npx tskb explore
```

That's the setup — an empty graph, an interactive D3 explorer in the browser, and AI skills wired into Claude Code and GitHub Copilot. The actual codebase map fills in as you (and your AI) write `.tskb.tsx` docs over time; the skills walk the assistant through what to capture and how.

<!-- TODO: explorer demo gif -->

---

## Status

**Beta** — `0.6.x`. The surface below is stable enough to build on:

- **Stable:** CLI commands (`init`, `build`, `ls`, `pick`, `search`, `docs`, `flows`, `context`, `explore`), JSX components, registry primitives, graph schema, generated skill/instruction files.
- **May still evolve:** internal extraction APIs, explorer chunk format, additional node types.

Production-grade for documentation use. Pin a minor version if you script against the JSON output.

---

## What is tskb?

A TypeScript-native DSL for expressing **architectural intent** as code.

Your AI assistant writes and maintains documentation in `.tskb.tsx` files that:

- are **type-checked by the TypeScript compiler**
- reference **real folders, files, and exports** via `typeof import()`
- fail the build when documentation and code drift apart

The result is a **structured knowledge graph** you can query with the CLI, browse in the explorer, or feed to your AI assistant — all derived from the same source of truth.

> Refactor your code → stale docs break at compile time. The AI fixes them.

---

## Why it exists

Large TypeScript codebases drift in predictable ways:

- **Tribal knowledge** — architecture lives in senior engineers' heads
- **Documentation decay** — Markdown and diagrams silently fall out of sync
- **Compound complexity** — onboarding cost grows faster than the codebase

tskb makes architecture documentation **typed, validated, and enforced at build time** — so it can't quietly rot.

---

## Core concepts

### Vocabulary

Declare structural elements once, in the global `tskb` namespace. Everything else references them. Six primitives cover the surface:

| Primitive  | What it represents                                | Validation                  |
| ---------- | ------------------------------------------------- | --------------------------- |
| `Folder`   | A logical area (feature, layer, package)          | `path` must exist on disk   |
| `Module`   | A source file, with type-safe access to its shape | `typeof import("…")`        |
| `Export`   | A named export from a module (class, fn, const)   | `typeof import("…").Symbol` |
| `File`     | A non-TS/JS file (README, config, spec)           | `path` must exist on disk   |
| `Term`     | A domain concept not tied to a specific file      | string literal type         |
| `External` | A third-party service or package (with metadata)  | free-form key-value props   |

```tsx
// docs/vocabulary.tskb.tsx
import type { Folder, Module, Export, File, Term, External } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      ServiceLayer: Folder<{ desc: "Business logic"; path: "src/services" }>;
    }
    interface Modules {
      AuthServiceModule: Module<{
        desc: "Authentication service";
        type: typeof import("../src/services/auth.service.js");
      }>;
    }
    interface Exports {
      AuthService: Export<{
        desc: "Authentication and authorization";
        type: typeof import("../src/services/auth.service.js").AuthService;
      }>;
    }
    interface Files {
      "openapi-spec": File<{ desc: "REST API spec"; path: "docs/openapi.yml" }>;
    }
    interface Terms {
      jwt: Term<"JSON Web Tokens for stateless authentication">;
    }
    interface Externals {
      postgres: External<{
        desc: "Primary relational database";
        kind: "database";
        url: "https://www.postgresql.org";
      }>;
    }
  }
}
```

`typeof import()` means the compiler validates every reference. Rename `AuthService` → the doc build breaks.

### Documents

`.tskb.tsx` files reference the vocabulary and add prose, snippets, flows, relations, and architectural decisions.

JSX components available: `<Doc>`, `<H1>` / `<H2>` / `<H3>`, `<P>`, `<List>` / `<Li>`, `<Snippet>`, `<Flow>` / `<Step>`, `<Relation>`, `<Adr>`.

```tsx
// docs/authentication.tskb.tsx
import { Doc, H1, P, Snippet, ref } from "tskb";
import type { AuthService } from "../src/services/auth.service.js";

const Service = ref as tskb.Exports["AuthService"];
const Jwt = ref as tskb.Terms["jwt"];

export default (
  <Doc explains="Login flow and JWT issuance" priority="essential">
    <H1>Authentication</H1>
    <P>
      {Service} issues {Jwt} after validating credentials.
    </P>

    <Snippet
      code={async () => {
        const auth: AuthService = new AuthService();
        return auth.login({ email, password });
      }}
    />
  </Doc>
);
```

`<Snippet>` is **not** a string literal — its body is fully type-checked. If `login()` changes signature, the doc build fails.

### Flows

Named, ordered sequences through the system — login pipelines, build steps, request paths. They become first-class graph nodes.

```tsx
<Flow name="login" desc="HTTP request to session token" priority="essential">
  <Step node={AuthMiddleware} label="Validates request" />
  <Step node={AuthService} label="Issues JWT" />
  <Step node={UserRepository} label="Loads user" />
</Flow>
```

### Relations and ADRs

Express explicit semantic edges between any two nodes, and capture the _why_ behind decisions:

```tsx
<Relation from={AuthService} to={Postgres} label="reads user records from" />

<Adr
  title="Use JWT instead of session cookies"
  status="accepted"
  date="2025-09-12"
>
  <P>Stateless tokens let us scale the auth tier horizontally without sticky sessions.</P>
</Adr>
```

`<Relation>` adds a `related-to` edge to the graph; `<Adr>` records an architectural decision as a queryable node so the rationale travels with the code.

### Priority

Three levels control what the AI sees first:

- `essential` — surfaced in generated AI skills and `ls` output
- `constraint` — architectural rules; surface in `pick`/`search` so they can't be missed before changes
- `supplementary` — graph-only, queryable on demand

---

## How the graph is built

Edges come from two sources:

**Authored intent** — every JSX reference creates a typed edge. `<P>{AuthService} uses {UserRepository}</P>` records `Doc → AuthService` and `Doc → UserRepository`. `<Relation from={A} to={B} label="depends on" />` adds explicit `related-to` edges.

**Inferred structure** — folder hierarchy, module imports, export ownership, and file containment are read directly from the filesystem and TypeScript AST.

The result combines what you _meant_ with what's _actually there_.

---

## CLI

The build command runs the pipeline; the others query the graph. All commands accept `--plain` (~30% fewer tokens for AI consumption) and `--optimized` (compact JSON).

```bash
npx tskb init                            # Interactive scaffolder
npm run docs                             # Build the graph (added by init)

npx tskb ls --depth 4                    # Folder tree + essential docs
npx tskb pick "AuthService"              # Full detail for one node
npx tskb search "auth"                   # Fuzzy search across the graph
npx tskb context "ServiceLayer"          # Node + neighborhood + docs (one call)
npx tskb docs "auth"                     # Search documentation
npx tskb flows                           # List flows by priority

npx tskb explore                         # Open the interactive explorer
npx tskb explore --export ./public       # Bake static site
```

`context` is the single most efficient call — it returns the target node, its neighborhood, and all referencing docs (deduplicated, sorted by priority, with constraint docs surfaced) in one shot.

---

## Explorer

`tskb explore` serves a D3-powered SPA that renders the graph as an interactive diagram — folders nest, modules expand, edges trace references and imports. The SPA ships pre-built; no extra install. `--export` writes a self-contained static folder you can drop on any host.

---

## AI assistant integration

The build emits skills/instructions for two assistants. Content is regenerated from the graph on every build — never edit the files manually. Claude Code gets four split skills (load only what's needed); Copilot gets two consolidated instruction files.

| Skill                  | Purpose                                                                                        | Generated files                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **tskb**               | Codebase map and CLI orientation. Always-on entry point.                                       | `.claude/skills/tskb/SKILL.md`<br>`.github/instructions/tskb.instructions.md`               |
| **tskb-toc**           | Repo table of contents: boundaries, externals, flows, essential-docs index. Loaded on demand.  | `.claude/skills/tskb-toc/SKILL.md`                                                          |
| **tskb-update**        | When and where to write `.tskb.tsx` docs — workflow, folder structure, authoring rules.        | `.claude/skills/tskb-update/SKILL.md`<br>`.github/instructions/tskb-update.instructions.md` |
| **tskb-update-syntax** | Full authoring syntax reference: registry primitives, JSX components, snippets, class methods. | `.claude/skills/tskb-update-syntax/SKILL.md`                                                |

Enable them during `npx tskb init` or create `.claude/skills/` and `.github/` before the next build.

The loop: at the start of a session the assistant already has the folder tree and essential docs; for anything deeper it runs `search`, `context`, or `pick` itself. Less exploration, more accuracy.

### Building docs iteratively

The skills are designed to compound — each session adds to the graph, and the next session sees what's already there. A typical loop:

> **You:** "I'm adding JWT auth in `src/services/auth.service.ts`. Document it."
>
> **AI** (via `tskb-update`):
>
> 1. Runs `tskb search "auth"` and `tskb context "src/services"` — checks what's already mapped, avoids duplicating.
> 2. Reads the new code and proposes the questions worth answering: _"How does login issue a JWT?"_, _"What guarantees token expiry?"_, _"Why is `bcrypt.compare` constant-time-required here?"_
> 3. You pick which questions are real. The AI declares any new vocabulary (`AuthService`, `jwt`) in the registry, then writes one `.tskb.tsx` per question.
> 4. Runs `npm run docs`. The TypeScript compiler validates every `typeof import()` reference and every `<Snippet>`.
>
> **Next session, in a different feature:** the AI runs `tskb search` first, finds the auth doc, and references `AuthService` directly — no re-reading the code, no contradictory descriptions.

Each iteration adds nodes, flows, and constraints. The graph gets denser over time, and the AI's answers get sharper because it's reading curated map fragments instead of grep results.

---

## Output schema

```ts
{
  nodes: {
    folders, modules, exports, files, terms, flows, docs   // typed records
  },
  edges: Array<{
    from: string;
    to: string;
    type: "references" | "contains" | "belongs-to" | "imports" | "related-to" | "flow-step";
    label?: string;
  }>,
  metadata: { generatedAt, version, stats }
}
```

The graph is the primary output. The explorer, Graphviz DOT (`.tskb/graph.dot`), and AI skill files are all derived from it.

---

## CI / pre-commit

Treat the doc build like a type check — if it fails, code and docs have drifted.

```bash
# .husky/pre-commit
npm run docs
```

```yaml
# GitHub Actions
- run: npm run docs
- uses: actions/upload-artifact@v3
  with: { name: architecture-graph, path: .tskb/ }
```

---

## How it differs

**vs Markdown / ADRs** — type-checked against real code, not free text that drifts.

**vs Structurizr / C4 / PlantUML** — native TypeScript instead of a custom DSL; produces a queryable graph, not just static diagrams.

**vs TypeDoc** — documents _architecture and intent_ (why things exist, how they relate), not API surfaces.

Unique to tskb: compiler-validated references via `typeof import()`, type-checked code snippets, first-class flows, doc priority, an interactive explorer, and AI skills generated from the graph.

---

## Roadmap

- Architectural constraint validation (beyond `priority="constraint"` surfacing)
- **First-class JSX for common architecture patterns** — purpose-built components for `<Layered>` (with typed `<Layer>` children and one-way dependency rules), `<Hexagonal>` (`<Domain>`, `<Port>`, `<Adapter>` with direction enforcement), `<EventDriven>` (`<Producer>`, `<Consumer>`, `<Topic>`, `<EventSchema>`), `<Cqrs>` (`<Command>`, `<Query>`, `<Aggregate>`, `<Projection>`), `<StateMachine>` (`<State>`, `<Transition>`), `<DDD>` (`<BoundedContext>`, `<Aggregate>`, `<ValueObject>`), and pipeline / saga / pub-sub variants. Each emits typed graph nodes and edges, surfaces violations at build time, and renders distinctly in the explorer.
- More AI assistant integrations

---

## License

MIT © Dimitar Mihaylov
