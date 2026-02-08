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
- Native IDE support (autocomplete, refactoring, go-to-definition)
- Zero runtime impact (pure build-time tooling)
- **CLI for querying** (`ls`, `describe`, `select` commands)
- JSON knowledge graph output
- Graphviz visualization
- Monorepo-friendly by design
- Optimized for AI assistants & programmatic consumption

---

## Quick start (recommended setup)

### 0) Install and setup

**Install tskb:**

```bash
npm install --save-dev tskb
```

**Create docs folder with config:**

```bash
mkdir docs
```

**Repo structure:**

```
your-repo/
├── src/              # Your source code
├── docs/             # Architecture documentation
│   ├── tsconfig.json # TypeScript config for docs
│   └── *.tskb.tsx    # Documentation files
└── package.json      # Add tskb script here
```

> For monorepos: create `docs/` at workspace root, and ensure `tsconfig.json` can resolve all packages you want to document.

---

### 1) Configure TypeScript for docs

Create `docs/tsconfig.json` that can type-check your real code:

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

    "baseUrl": "../",
    "rootDir": "../",

    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["**/*.tskb.tsx"]
}
```

**Key settings:**

- `baseUrl: "../"` - Points to repo root so docs can import from `src/`
- `jsxImportSource: "tskb"` - Enables TSX syntax for documentation
- `moduleResolution: "NodeNext"` - Use ESM-style imports with explicit extensions (`.js`)

---

### 2) Add a build script

Add to your root `package.json`:

```json
{
  "scripts": {
    "docs": "tskb \"./docs/**/*.tskb.tsx\" --tsconfig ./docs/tsconfig.json"
  }
}
```

> **Note:** `tskb <pattern>` is shorthand for `tskb build <pattern>`

Run it from repo root:

```bash
npm run docs
```

This creates a `.tskb/` directory in your repo root containing:

- `graph.json` - the knowledge graph (queryable via CLI)
- `graph.dot` - Graphviz visualization
- `AGENTS.md` - auto-generated guidance for AI assistants

**Pointing AI assistants to TSKB:**

Create `CLAUDE.md` (for Claude) or `.github/copilot-instructions.md` (for GitHub Copilot):

```markdown
**MANDATORY FIRST STEP: Read `.tskb/AGENTS.md` immediately when starting ANY work in this repository**

This repo uses TSKB for semantic architecture mapping. AGENTS.md contains the complete workflow you MUST follow before reading source files or making changes.

**Do not skip this. AGENTS.md prevents reading wrong files and missing architectural constraints.**
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

Found 19 documentation files
Creating TypeScript program...
Extracting registry (Folders, Modules, Terms)...
   Base directory: /home/user/project
   ├─ 27 folders
   │  └─ Paths: 27 valid, 0 missing
   ├─ 18 modules
   │  └─ Imports: 18 valid, 0 missing
   └─ 30 terms
Extracting documentation...
└─ 11 docs
Building knowledge graph...
   ├─ 28 folder nodes
   ├─ 18 module nodes
   ├─ 48 export nodes
   ├─ 30 term nodes
   ├─ 11 doc nodes
   └─ 201 edges
Creating output directory: /home/user/project/.tskb
Writing graph to /home/user/project/.tskb/graph.json...
Generating visualization: /home/user/project/.tskb/graph.dot...
Writing agent guide: /home/user/project/.tskb/AGENTS.md...

✓ Done!

Output directory: .tskb/
   ├─ graph.json     Knowledge graph data
   ├─ graph.dot      Graphviz visualization
   └─ AGENTS.md      Agent guidance

Visualize with: dot -Tpng .tskb/graph.dot -o .tskb/graph.png
```

---

## Querying the graph

Once built, query the knowledge graph using the CLI:

### List folder structure

```bash
npx tskb ls              # List top-level folders (depth=1)
npx tskb ls --depth 4    # List folders up to depth 4
npx tskb ls --depth -1   # List all folders (unlimited depth)
```

Output is ordered by depth (root → children), making it easy to understand hierarchy.

### Describe a folder

```bash
npx tskb describe "ServiceLayer"
```

Returns:

- The folder's context (description, path)
- Parent folder
- Child folders and modules
- Exports belonging to this folder
- Documentation referencing this folder

### Search for items

```bash
npx tskb select "auth" "ServiceLayer"              # Search within ServiceLayer
npx tskb select "auth" "__TSKB.REPO.ROOT__" --verbose  # Search entire repo
```

Returns the best match with:

- Confidence score
- Parent/child relationships
- Related documentation
- Relevant file paths

All commands output JSON, making them ideal for programmatic consumption and AI assistants.

---

## Visualize

The `build` command automatically generates a Graphviz DOT file in `.tskb/graph.dot`.

To render it as an image:

```bash
dot -Tpng .tskb/graph.dot -o .tskb/graph.png
```

Or view it interactively:

```bash
xdot .tskb/graph.dot
```

---

## Workflow integration

### Pre-commit hook

Validate docs on every commit:

```bash
npm install --save-dev husky
npx husky init
echo "npm run docs" > .husky/pre-commit
```

### CI/CD (GitHub Actions)

```yaml
- name: Validate architecture docs
  run: npm run docs

- name: Upload graph artifact
  uses: actions/upload-artifact@v3
  with:
    name: architecture-graph
    path: .tskb/
```

This ensures documentation stays synchronized with code changes.

---

## AI assistant integration

TSKB is designed to help AI assistants understand codebases efficiently:

- **Structured queries**: AI can use `ls`, `describe`, and `select` to navigate architecture
- **JSON output**: Machine-readable format optimized for programmatic consumption
- **AGENTS.md**: Auto-generated guidance file explaining how to use TSKB commands
- **Semantic graph**: Relationships between folders, modules, and exports are explicit
- **Type-safe references**: AI can trust that referenced paths and imports are valid

Instead of blindly exploring files, AI assistants can:

1. Use `ls --depth 4` to understand high-level structure
2. Use `describe` to dive into specific areas
3. Use `select` to find relevant code for a task
4. Read only the files that matter

This dramatically reduces tokens spent on exploration and increases accuracy.

---

## How is this different?

**vs ADRs / Markdown docs:** Type-checked and validated against real code, not just text files that drift.

**vs Structurizr / C4 / PlantUML:** Native TypeScript (not a custom DSL), produces a queryable knowledge graph (not just static diagrams).

**vs TypeDoc:** Documents _architecture and intent_ (why components exist, how they relate), not just API surfaces (what methods exist).

**Unique to tskb:**

- Type-checks architecture docs at compile time
- Validates against actual code via `typeof import()`
- CLI for querying the graph (no file scanning needed)
- Documents whole systems (multiple packages, monorepos)
- Type-checked code snippets (not string literals)
- Optimized for AI assistants with structured queries

---

## Roadmap

- Enhanced graph querying & filtering
- Architectural constraints validation
- Interactive visualization (beyond Graphviz)
- Plugin system for custom node types
- Integration helpers (pre-commit hooks, CI templates)

---

## License

MIT © Dimitar Mihaylov
