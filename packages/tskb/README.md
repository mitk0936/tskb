# tskb

Build **living architecture documentation as code**. Declaratively define architectural intent in large TypeScript codebases and monorepos, and turn that intent into a **compiler-verified artifact**.

> **Documentation physically bound to your code, so you can trust it.**

[![npm version](https://badge.fury.io/js/tskb.svg)](https://www.npmjs.com/package/tskb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## ⚠️ Status

**Experimental / early concept**.

- APIs and output may evolve
- Not production-ready
- Best viewed as a proof-of-concept and research tool

---

## What is tskb?

**tskb** is a TypeScript-native DSL for expressing **architectural intent** as code.

You write documentation in `.tskb.tsx` files that:

- are **type-checked by the TypeScript compiler**
- reference **real folders, files, and exports**
- fail the build when documentation and code drift apart

The result is a **structured knowledge graph** that can be:

- visualized (Graphviz, diagrams)
- queried programmatically
- consumed efficiently by AI assistants

> Refactor your code → stale documentation breaks at compile time.

---

## Why tskb exists

Large TypeScript codebases eventually suffer from:

- **Tribal knowledge** - architecture lives in senior developers’ heads
- **Compound complexity** - the mental model becomes fragile and expensive to communicate
- **Documentation decay** - Markdown and diagrams drift silently

tskb addresses this by making architecture documentation:

- **typed**
- **validated**
- **enforced at build time**

---

## Core features

- Architecture as code using TSX
- Compiler-verified references via `typeof import()`
- **Type-checked code snippets** (not copied text)
- Native IDE support (autocomplete, refactors)
- Zero runtime impact (pure build-time tooling)
- JSON knowledge graph output
- Graphviz visualization
- Monorepo-friendly by design
- Optimized for AI context & RAG pipelines

---

## Quick start (recommended setup)

### 0) Create a dedicated docs package

Keep docs isolated from production dependencies while still “seeing” your source code.

**Repo structure:**

```
your-repo/
├── src/              # Your source code
├── docs/             # tskb docs package (created below)
│   ├── package.json
│   ├── tsconfig.json
│   └── *.tskb.tsx
└── package.json
```

**Create it:**

```bash
mkdir docs
cd docs
npm init -y
npm install --save-dev tskb
```

> For monorepos: put `docs/` at workspace root (or as a workspace), and ensure `rootDir` / `baseUrl` point to the workspace root that contains all packages you want to document.

---

### 1) Configure TypeScript for docs

`docs/tsconfig.json` should be able to type-check your real code.

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "esModuleInterop": true,

    "jsx": "react-jsx",
    "jsxImportSource": "tskb",

    "rootDir": "../",
    "baseUrl": "../",

    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["**/*.tskb.tsx"]
}
```

Notes:

- `moduleResolution: "NodeNext"` means ESM-style imports with **explicit extensions** (often `.js`).
- `rootDir` / `baseUrl` typically point to repo root so the docs program can resolve your code.

---

### 2) Add a build script

`docs/package.json`:

```json
{
  "scripts": {
    "generate": "tskb \"**/*.tskb.tsx\" --out dist/graph.json --tsconfig tsconfig.json"
  }
}
```

Run it:

```bash
cd docs
npm run generate
```

---

## Define your vocabulary

Declare architecture primitives using TypeScript declaration merging.

```tsx
// docs/vocabulary.tskb.tsx
import type { Folder, Export, Term } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      DataLayer: Folder<{
        desc: "Data access layer with repositories and database logic";
        path: "src/server/database";
      }>;
      ServiceLayer: Folder<{
        desc: "Business logic and application services";
        path: "src/server/services";
      }>;
      APILayer: Folder<{
        desc: "HTTP controllers and route handlers";
        path: "src/server/controllers";
      }>;
    }

    interface Modules {
      AuthServiceModule: Module<{
        desc: "Authentication service module";
        path: typeof import("../src/server/services/auth.service.js");
      }>;
    }

    interface Exports {
      UserRepository: Export<{
        desc: "User data access using repository pattern";
        type: typeof import("../src/server/database/repositories/user.repository.js").UserRepository;
      }>;
      AuthService: Export<{
        desc: "Authentication and authorization business logic";
        type: typeof import("../src/server/services/auth.service.js").AuthService;
      }>;
    }

    interface Terms {
      "repository-pattern": Term<"Repository Pattern for data access abstraction">;
      jwt: Term<"JSON Web Tokens for stateless authentication">;
      "layered-architecture": Term<"Layered architecture pattern (API → Service → Data)">;
    }
  }
}
```

---

## Write documentation

Reference your global vocabulary to document architecture. Multiple teams can author docs that all use the same shared architectural terms.

```tsx
// docs/authentication.tskb.tsx
import { Doc, H1, H2, P, Snippet, ref } from "tskb";
import type { AuthService } from "../src/server/services/auth.service.js";
import type { UserRepository } from "../src/server/database/repositories/user.repository.js";
import type { LoginCredentials, AuthResponse } from "../src/shared/types/auth.types.js";

// Reference the global vocabulary
const ServiceLayer = ref as tskb.Folders["ServiceLayer"];
const DataLayer = ref as tskb.Folders["DataLayer"];
const AuthServiceExport = ref as tskb.Exports["AuthService"];
const UserRepositoryExport = ref as tskb.Exports["UserRepository"];
const Jwt = ref as tskb.Terms["jwt"];
const RepositoryPattern = ref as tskb.Terms["repository-pattern"];

export default (
  <Doc>
    <H1>Authentication Architecture</H1>

    <P>
      The {AuthServiceExport} in the {ServiceLayer} handles authentication using {Jwt}. It depends
      on {UserRepositoryExport} in the {DataLayer} following the {RepositoryPattern}.
    </P>

    <H2>Example: Login Flow</H2>

    <Snippet
      code={async () => {
        const authService: AuthService = new AuthService();
        const credentials: LoginCredentials = {
          email: "user@example.com",
          password: "hashedPassword",
        };
        const response: AuthResponse = await authService.login(credentials);
        return response.tokens.accessToken;
      }}
    />
  </Doc>
);
```

---

## Snippet type checking

`<Snippet>` is **not** a string literal.

- Snippet bodies are fully type-checked
- Real types and APIs can be imported
- Broken examples fail the documentation build

```tsx
// docs/repository-pattern.tskb.tsx
import { Doc, H1, P, Snippet } from "tskb";
import type { UserRepository } from "../src/server/database/repositories/user.repository.js";
import type { User } from "../src/shared/types/user.types.js";
import type { Database } from "../src/server/database/connection.js";

export default (
  <Doc>
    <H1>Repository Pattern Example</H1>

    <P>The UserRepository demonstrates the repository pattern for data access abstraction.</P>

    <Snippet
      code={async () => {
        const db: Database = new Database(config);
        const userRepository: UserRepository = new UserRepository(db);
        const user: User | null = await userRepository.findByEmail("test@example.com");
        return user?.id;
      }}
    />
  </Doc>
);
```

If the API changes:

```text
❌ Property 'findByEmail' does not exist on type 'UserRepository'.
```

The snippet is never executed - it is parsed, validated, and stringified.

---

## What tskb produces: a semantic architecture graph

tskb builds a **typed, semantic knowledge graph** describing your system.

The graph captures:

- **Nodes** - folders, modules, exports, terms, docs
- **Edges** - explicit and inferred relationships
- **Hierarchy** - nested architectural contexts
- **Semantics** - intent expressed through JSX

This graph is the primary output. Everything else (diagrams, markdown, AI context) is derived from it.

---

## Output schema (high level)

```ts
{
  nodes: {
    folders: Record<string, FolderNode>;
    modules: Record<string, ModuleNode>;
    exports: Record<string, ExportNode>;
    terms: Record<string, TermNode>;
    docs: Record<string, DocNode>;
  },
  edges: Array<{
    from: string;
    to: string;
    type: "references" | "contains" | "belongs-to";
  }>,
  metadata: {
    generatedAt: string;
    version: string;
    stats: {
      folders: number;
      modules: number;
      exports: number;
      terms: number;
      docs: number;
      edges: number;
    };
  }
}
```

The schema is intentionally **graph-first** and machine-oriented.

---

## Nested contexts

Folders define **architectural contexts**, not just paths.

From folder paths, tskb infers:

- hierarchical containment (`contains`)
- ownership of modules and exports (`belongs-to`)
- the most specific enclosing context

Your architecture becomes a **tree of nested contexts**, not a flat list.

---

## Relations

Relations in the graph come from two sources:

### Explicit intent

When you reference entities in JSX:

```tsx
<P>Authentication is handled by {AuthService}.</P>
```

tskb records a semantic edge:

```
Doc → AuthService (references)
```

### Inferred structure

From filesystem paths and imports:

- Folder → Folder (`contains`)
- Module → Folder (`belongs-to`)
- Export → Module (`belongs-to`)

The graph combines **authored intent** with **structural truth**.

---

## Why JSX: semantics, not rendering

JSX in tskb is **not about UI**.

It is a **semantic DSL** that allows you to declare meaning in a structured, type-safe way.
Each JSX element becomes semantic data - not HTML.

JSX provides composability, static analysis, and extensibility without inventing a new syntax.

---

## Defining semantics with JSX

Because JSX is just TypeScript, it can evolve into richer semantics:

```tsx
<Relation from={AuthService} to={UserRepository} type="depends-on" />

<Constraint kind="layering">
  <Layer name="ui" cannotImport="data" />
</Constraint>

<Flow>
  <Step component={LoginForm} />
  <Step component={AuthService} />
  <Step component={UserRepository} />
</Flow>
```

These are **semantic primitives** that compile into graph structure - not UI components.

---

## Example real output

This is the **actual CLI output** users will see:

```text
tskb build
   Pattern: **/*.tskb.tsx
   Tsconfig: tsconfig.json

Found 7 documentation files
Creating TypeScript program...
Extracting registry (Folders, Modules, Terms)...
   Base directory: D:\tskb
   ├─ 7 folders
   │  └─ Paths: 7 valid, 0 missing
   ├─ 14 modules
   │  └─ Imports: 14 valid, 0 missing
   └─ 19 terms
Extracting documentation...
└─ 4 docs
Building knowledge graph...
   ├─ 7 folder nodes
   ├─ 14 module nodes
   ├─ 24 export nodes
   ├─ 19 term nodes
   ├─ 4 doc nodes
   └─ 90 edges
Writing graph to ./dist/graph.json...
```

---

## Visualize

```bash
npx tskb visualize ./dist/graph.json --out ./dist/architecture.dot
dot -Tpng ./dist/architecture.dot -o ./dist/architecture.png
```

---

## How is this different?

**vs ADRs / Markdown docs:** Type-checked and validated against real code, not just text files that drift.

**vs Structurizr / C4 / PlantUML:** Native TypeScript (not a custom DSL), produces a queryable knowledge graph (not just static diagrams).

**vs TypeDoc:** Documents _architecture and intent_ (why components exist, how they relate), not just API surfaces (what methods exist).

**Unique to tskb:**

- Type-checks architecture docs at compile time
- Validates against actual code via `typeof import()`
- Documents whole systems (multiple packages, monorepos, microservices)
- Type-checked code snippets (not string literals)
- Semantic knowledge graph optimized for AI/RAG

---

## Roadmap

- Graph querying & optimization
- AI context layer (MCP)
- Architectural constraints
- Plugin system

---

## License

MIT © Dimitar Mihaylov
