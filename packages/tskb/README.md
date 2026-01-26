# \<tskb\>

Build living documentation as code. Declaratively define architecture in large TypeScript codebases and monorepos - turning architecture into a compiler-verified artifact.

[![npm version](https://badge.fury.io/js/tskb.svg)](https://www.npmjs.com/package/tskb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Note

This is an `experimental concept` in early development. APIs and behavior may change.

## Overview

A TypeScript-native DSL for expressing architectural intent as typed declarations. Produces renderable docs/diagrams and a queryable knowledge graph, supporting type-checked snippet references, semantic relations, and constraints.

Write architecture documentation in `.tskb.tsx` files that get type-checked alongside your codebase. References to code modules, files, and exports are validated by TypeScript - `refactored code automatically invalidates stale documentation at compile-time.`

The output is a JSON knowledge graph optimized for AI assistants, visualization tools, and programmatic analysis.

## Why tskb?

Large TypeScript codebases face common challenges:

- **Tribal knowledge** - Architecture understanding locked in senior developers' heads, not accessible to new team members or AI assistants
- **Compound complexity** - As systems grow, the mental model of how everything connects becomes harder to maintain and communicate
- **Low documentation coverage** - Traditional docs fall out of sync with code, so teams stop writing them and stop trusting them

tskb solves this by making architecture documentation a first-class, compiler-verified artifact that evolves with your codebase.

## Features

- Architecture as code - write docs in TSX files with type-checked references
- Documentation validated by TypeScript compiler alongside your codebase
- Out-of-the-box IDE support - autocomplete, refactoring, go-to-definition (native TypeScript)
- Zero runtime impact - purely build-time tooling, no production dependencies
- Generate JSON knowledge graphs optimized for `AI assistant integration` and programmatic analysis
- Visualize architecture as Graphviz diagrams
- Works with monorepos and complex project structures

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  Write Architecture Docs                                        │
│  *.tskb.tsx files with type-safe references to your code        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  TypeScript Validation                                          │
│  Compiler checks all imports, types, and references             │
│  ✓ Code exists  ✓ Types match  ✓ Paths correct                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Build Knowledge Graph                                          │
│  npx tskb build → generates structured JSON                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ├──────────────────────┬──────────────────────┐
                  ▼                      ▼                      ▼
         ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
         │  AI Assistants  │   │  Visualization  │   │  CI/CD Checks   │
         │  Optimized      │   │  Graphviz       │   │  Architecture   │
         │  Context        │   │  Diagrams       │   │  Validation     │
         └─────────────────┘   └─────────────────┘   └─────────────────┘
```

## Quick Start

### 0. Set up documentation folder

Create a separate folder for your architecture docs with its own TypeScript configuration:

```bash
# In your repo root
mkdir docs
cd docs
npm init -y
```

Your docs need a separate `tsconfig.json` that can import your source files:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "jsxImportSource": "tskb",
    "rootDir": "../", // Point to repo root
    "baseUrl": "../", // Enable imports from root
    "paths": {
      "@/*": ["src/*"] // Your path aliases
    }
  },
  "include": ["**/*.tskb.tsx"]
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "generate": "tskb \"**/*.tskb.tsx\" --out dist/graph.json --tsconfig tsconfig.json"
  },
  "devDependencies": {
    "tskb": "latest"
  }
}
```

### 1. Define your vocabulary

Create `.tskb.tsx` files declaring your architecture:

```tsx
// docs/vocabulary.tskb.tsx
import type { Export, Folder, Term } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      Server: Folder<{
        desc: "Node.js backend API with services, controllers, and middleware";
        path: "src/server";
      }>;
      Client: Folder<{
        desc: "React frontend with components and state management";
        path: "src/client";
      }>;
      Repositories: Folder<{
        desc: "Data access layer abstracting database operations";
        path: "src/server/database/repositories";
      }>;
    }

    interface Exports {
      AuthService: Export<{
        desc: "Handles user authentication, registration, and token management";
        type: typeof import("../src/server/services/auth.service.js").AuthService;
      }>;
      TaskRepository: Export<{
        desc: "Data access layer for task persistence with pagination";
        type: typeof import("../src/server/database/repositories/task.repository.js").TaskRepository;
      }>;
    }

    interface Terms {
      jwt: Term<"JSON Web Token - stateless authentication using signed tokens">;
      repositoryPattern: Term<"Data access pattern isolating database logic from business logic">;
    }
  }
}

export {};
```

### 2. Write documentation

Create documentation files that reference your vocabulary.

- Reference terms/exports defined in ANY .tskb.tsx file in your project
- TypeScript declaration merging makes all vocabulary globally available
- No need for a central registry - enables `distributed authorship` in large projects

```tsx
// docs/authentication-system.tskb.tsx
import { Doc, H1, H2, H3, P, Snippet, ref } from "tskb";
import { UserRepository } from "../src/server/database/repositories/user.repository.js";
import { LoginCredentials, AuthResponse } from "../src/shared/types/auth.types.js";

const JwtTerm = ref as tskb.Terms["jwt"];
const AuthServiceExport = ref as tskb.Exports["AuthService"];
const ServerFolder = ref as tskb.Folders["Server"];

export default (
  <Doc>
    <H1>Authentication System</H1>

    <P>
      The authentication system in {ServerFolder} provides secure user login and session management
      using {JwtTerm} tokens.
    </P>

    <H2>Server-Side Authentication</H2>

    <P>
      The {AuthServiceExport} handles core authentication logic including password validation, token
      generation, and user verification.
    </P>

    <Snippet
      code={() => {
        const jwt = require("jsonwebtoken");

        class AuthService {
          constructor(private userRepository: UserRepository) {}

          async login(credentials: LoginCredentials): Promise<AuthResponse> {
            const user = await this.userRepository.findByEmail(credentials.email);
            if (!user) throw new Error("User not found");

            const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
            return { token, user };
          }
        }
      }}
    />
  </Doc>
);
```

If `UserRepository.findByEmail()` signature changes or gets removed, this doc won't compile.

Example of validation failure:

```
tskb build
   Pattern: **/*.tskb.tsx
   Tsconfig: tsconfig.json

Found 11 documentation files
Creating TypeScript program...
❌ Error: TypeScript compilation errors:
D:/tskb/docs/taskflow-app/src/architecture-overview.tskb.tsx (155,43): Cannot find name 'useAuthentication'.
```

The build fails immediately when documentation references code that doesn't exist.

### 3. Generate the knowledge graph

```bash
cd docs
npm run generate
```

Or manually:

```bash
# Build the knowledge graph
npx tskb "docs/**/*.tskb.tsx" --out graph.json --tsconfig tsconfig.json
```

Example output:

```
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
Writing graph to ./dist/taskflow-graph.json...

Done!
```

Visualize the graph:

```bash
# Generate visualization
npx tskb visualize graph.json --out architecture.dot
```

### 4. View the results

```bash
# Render as PNG (requires Graphviz)
dot -Tpng architecture.dot -o architecture.png

# Or view interactively
xdot architecture.dot
```

Output is a JSON graph you can query programmatically or feed to AI tools.

## Installation

```bash
npm install --save-dev tskb
```

## Core Concepts

### Folders

Represent logical groupings in your codebase (features, layers, packages):

```typescript
import type { Folder } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      FeatureName: Folder<{
        desc: "Description of what this folder contains";
        path: "relative/path/from/repo/root";
      }>;
    }
  }
}
```

### Modules

Modules represent the files in your codebase that contain exported functionality. Use the `Module<>` primitive to reference entire module files:

```typescript
import type { Module } from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      "task.service": Module<{
        desc: "Task management service with CRUD operations";
        path: typeof import("@/server/services/task.service");
      }>;
      "auth.middleware": Module<{
        desc: "Authentication middleware for protected routes";
        path: typeof import("@/server/middleware/auth.middleware");
      }>;
    }
  }
}
```

### Exports

Exports represent specific named exports from your modules (classes, functions, constants). Use the `Export<>` primitive to reference individual exports with precise type safety:

```typescript
import type { Export } from "tskb";

declare global {
  namespace tskb {
    interface Exports {
      TaskRepository: Export<{
        desc: "Data access layer for task persistence with pagination";
        type: typeof import("@/server/database/repositories/task.repository").TaskRepository;
      }>;
      AuthService: Export<{
        desc: "Authentication service handling login and session management";
        type: typeof import("@/server/services/auth.service").AuthService;
      }>;
      authenticate: Export<{
        desc: "Middleware function to verify JWT tokens";
        type: typeof import("@/server/middleware/auth.middleware").authenticate;
      }>;
    }
  }
}
```

The `Export<>` primitive uses TypeScript's `typeof import()` syntax to create type-safe references to actual code exports. This ensures documentation stays in sync with your codebase.

### Terms

Represent domain concepts, patterns, or terminology:

```typescript
import type { Term } from "tskb";

declare global {
  namespace tskb {
    interface Terms {
      termName: Term<"Definition of this concept">;
    }
  }
}
```

### Documentation Components

JSX components for writing docs:

- `<Doc>` - Document container
- `<H1>`, `<H2>`, `<H3>` - Headings
- `<P>` - Paragraphs
- `<List>`, `<Li>` - Lists
- `<Snippet>` - Code snippets

**Referencing entities:**

Extract references to constants before using in JSX:

```tsx
const FolderName = ref as tskb.Folders["FolderName"];
const ModuleName = ref as tskb.Modules["ModuleName"];
const termName = ref as tskb.Terms["termName"];

export default (
  <Doc>
    <P>
      The {FolderName} contains {ModuleName} which implements {termName}.
    </P>
  </Doc>
);
```

**Code snippets:**

```tsx
<Snippet
  code={() => {
    // Your code here - will be extracted as-is
    const result = doSomething();
    return result;
  }}
/>
```

**Importing React components for type-safe examples:**

You can import React components from your application to use in code snippets with full TypeScript support:

```tsx
// Import with .js extension (NodeNext resolves to .tsx source)
import { AuthContext } from "examples/taskflow-app/src/client/contexts/AuthContext.js";
import { Doc, H2, Snippet } from "tskb";

export default (
  <Doc>
    <H2>Client Authentication Context</H2>

    <Snippet
      code={() => {
        // Type-safe! TypeScript validates AuthContext usage
        const { user, login, logout } = useContext(AuthContext);

        const handleLogin = async () => {
          await login({ email: "user@example.com", password: "pass" });
        };

        return <div>{user?.name}</div>;
      }}
    />
  </Doc>
);
```

**How it works:**

- With `moduleResolution: "NodeNext"`, TypeScript follows Node.js ESM rules
- Import paths use `.js` extensions (required for ESM)
- TypeScript automatically resolves to `.tsx` source files during type-checking
- Your JSX uses tskb's runtime via `jsxImportSource: "tskb"`
- Imported components provide types but aren't executed (just stringified)
- Works with workspace packages, monorepos, and relative imports

**Required tsconfig settings:**

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "jsxImportSource": "tskb",
    "allowJs": true,
    "esModuleInterop": true
  }
}
```

### The power of JSX

Using JSX as the documentation format enables semantic, type-safe documentation that can be extended with custom components. The current component set (`<Doc>`, `<P>`, `<Snippet>`, etc.) is just the foundation.

**Future possibilities with custom JSX components:**

```tsx
// Architectural constraints
<Constraint type="layering">
  <Layer name="UI" dependsOn={["Services"]} />
  <Layer name="Services" dependsOn={["Data"]} />
  <Layer name="Data" />
</Constraint>

// Explicit relationships
<Relation from={AuthServiceExport} to={UserRepositoryExport} type="depends-on">
  Uses repository for user authentication
</Relation>

// Data flow diagrams
<Flow>
  <Step component={UIComponent}>User submits form</Step>
  <Step component={ServiceLayer}>Validates and processes</Step>
  <Step component={DataLayer}>Persists to database</Step>
</Flow>

// Layer validation
<Layers>
  <Layer name="presentation" cannot="import-from" layer="data" />
  <Layer name="business" can="import-from" layer="data" />
</Layers>

// Custom diagrams
<SequenceDiagram>
  <Actor name="Client" />
  <Actor name="Server" />
  <Message from="Client" to="Server">POST /login</Message>
  <Message from="Server" to="Client">200 {token}</Message>
</SequenceDiagram>
```

These custom components could be implemented through a future plugin system, enabling domain-specific architectural documentation while maintaining type safety through the TypeScript compiler.

## Documentation Guidelines

### Structure over implementation

Documentation should describe what exists and where, not how it works. Focus on architecture and relationships between components.

**Do:**

- Declare root-level folders first (core layers, major features)
- Point to where things live with short descriptions
- Document important relationships between modules
- Reference actual files/exports using `typeof import()`
- Focus on architecture and structure

**Don't:**

- ~~Explain implementation details (that's in the code)~~
- ~~Duplicate API documentation (use TSDoc for that)~~
- ~~Write long explanations about how code works~~
- ~~Document every single file or function~~

### Start with the Foundation

**1. Declare major folders first:**

```tsx
import type { Folder } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      // Top-level architecture
      "src.client": Folder<{
        desc: "Frontend React application";
        path: "src/client";
      }>;
      "src.server": Folder<{
        desc: "Backend Node.js API";
        path: "src/server";
      }>;
      "src.shared": Folder<{
        desc: "Shared types and utilities";
        path: "src/shared";
      }>;
    }
  }
}
```

**2. Declare important modules:**

```tsx
import type { Export } from "tskb";

declare global {
  namespace tskb {
    interface Exports {
      // Core modules that matter architecturally
      "api.client": Export<{
        desc: "HTTP client for API communication - entry point for all server requests";
        type: typeof import("@/client/services/api.client");
      }>;

      "auth.service": Export<{
        desc: "Authentication service - handles login, logout, session management";
        type: typeof import("@/server/services/auth.service");
      }>;
    }
  }
}
```

**3. Define domain terms:**

```tsx
import type { Term } from "tskb";

declare global {
  namespace tskb {
    interface Terms {
      // Architectural patterns, not every concept
      jwt: Term<"JSON Web Token for stateless authentication">;
      repository: Term<"Data access pattern isolating database logic from business logic">;
      contextProvider: Term<"React pattern for sharing state across component tree">;
    }
  }
}
```

### Documentation Structure

**High-level architecture overview:**

```tsx
import { Doc, H1, H2, P, ref } from "tskb";

const ClientFolder = ref as tskb.Folders["src.client"];
const ServerFolder = ref as tskb.Folders["src.server"];
const SharedFolder = ref as tskb.Folders["src.shared"];
const ClientMainModule = ref as tskb.Modules["client.main"];
const ServerMainModule = ref as tskb.Modules["server.main"];
const ApiClientModule = ref as tskb.Modules["api.client"];
const AuthServiceModule = ref as tskb.Modules["auth.service"];
const ContextProviderTerm = ref as tskb.Terms["contextProvider"];
const RepositoryTerm = ref as tskb.Terms["repository"];

export default (
  <Doc>
    <H1>System Architecture</H1>

    <P>
      The application has three main layers: {ClientFolder}, {ServerFolder}, and {SharedFolder}.
    </P>

    <H2>Client Layer</H2>
    <P>
      Entry point: {ClientMainModule}. Uses {ContextProviderTerm} pattern for state. API calls go
      through {ApiClientModule}.
    </P>

    <H2>Server Layer</H2>
    <P>
      Entry point: {ServerMainModule}. Uses {RepositoryTerm} pattern for data access. Authentication
      via {AuthServiceModule}.
    </P>
  </Doc>
);
```

**Focus on relationships, not details:**

```tsx
const TaskContextModule = ref as tskb.Modules["TaskContext"];
const TaskApiServiceModule = ref as tskb.Modules["task-api.service"];
const ApiClientModule = ref as tskb.Modules["api.client"];

export default (
  <Doc>
    <P>
      {TaskContextModule} provides task state to all components. It calls {TaskApiServiceModule}
      which uses {ApiClientModule} for HTTP requests.
    </P>
  </Doc>
);
```

### What gets validated

**tskb catches:**

- Referenced module/folder doesn't exist
- Wrong import paths
- Files moved or renamed
- Removed exports
- Changed type signatures in code snippets

**tskb doesn't catch:**

- ~~Implementation logic changes inside functions~~
- ~~Business rule modifications~~
- ~~Algorithm changes~~
- ~~Performance optimizations~~

`Describe structure, not behavior:`

```tsx
// Good - describes structure
const JwtTerm = ref as tskb.Terms["jwt"];
const AuthServiceModule = ref as tskb.Modules["auth.service"];
const AuthMiddlewareModule = ref as tskb.Modules["auth.middleware"];

export default (
  <Doc>
    <P>
      Authentication uses {JwtTerm} tokens. Login logic in {AuthServiceModule}, validation in
      {AuthMiddlewareModule}.
    </P>
  </Doc>
);

// Bad - explains implementation
<P>
  The authentication service uses bcrypt with 10 salt rounds to hash passwords, then compares using
  a constant-time comparison function to prevent timing attacks. It generates a JWT with HMAC-SHA256
  signing algorithm...
</P>;
```

### File organization

One file per major subsystem:

```
docs/
  ├── architecture-overview.tskb.tsx    # Top-level structure
  ├── client-layer.tskb.tsx             # Frontend architecture
  ├── server-layer.tskb.tsx             # Backend architecture
  ├── data-layer.tskb.tsx               # Database and repositories
  ├── authentication.tskb.tsx           # Auth subsystem
  └── vocabulary.tskb.tsx               # Shared terms and concepts
```

Vocabulary declarations merge across files automatically (TypeScript declaration merging).

## CLI

### Build

```bash
tskb <pattern> --out <file> --tsconfig <path>
```

- `<pattern>` — Glob pattern for documentation files (e.g., `"docs/**/*.tskb.tsx"`)
- `--out` — Output path for knowledge graph JSON
- `--tsconfig` — Path to tsconfig.json

### Visualize

```bash
tskb visualize <input> --out <file>
```

- `<input>` — Path to knowledge graph JSON
- `--out` — Output path for DOT file

### Configuration file

Create `tskb.json` in your project:

```json
{
  "pattern": "docs/**/*.tskb.tsx",
  "output": "tskb.json",
  "tsconfig": "./tsconfig.json"
}
```

Then run:

```bash
npx tskb build
```

## Use Cases

### AI assistants

The knowledge graph provides optimized architectural intent for AI tools - a structured, queryable representation of your system's design, relationships, and patterns. Instead of having AI read thousands of files to understand your architecture, it gets a focused map showing:

- What components exist and their purpose
- How modules relate to each other
- Where specific functionality lives
- What patterns and terms your team uses

This reduces AI hallucinations and improves response accuracy by giving context without noise.

**Early tests show 10x-15x token optimization** - AI assistants can understand project architecture much faster by consuming the knowledge graph instead of scanning the entire codebase.

**Note:** Context layer integration for AI assistants is currently in development and experimentation.

### Living documentation

Docs break when code changes, so you know immediately when they're out of sync. Works in CI.

### Onboarding

New team members can work with AI assistants that understand your architecture from day one - no need to wait for senior engineers to be available. Generate current architecture diagrams automatically and provide structured context that helps developers navigate unfamiliar codebases faster.

### Code reviews

Check if changes align with documented architecture. QA teams can understand the impact of changes much easier by referencing the knowledge graph - seeing which modules are affected and how components relate without diving through source code.

### AI-powered development

Copilot tools get a much clearer understanding of what's acceptable and where. The knowledge graph provides architectural guardrails - helping AI understand layer boundaries, valid dependencies, and project-specific patterns before suggesting code changes.

### Architecture analysis

Query the graph programmatically to find:

- Orphaned modules (no documentation)
- Missing references
- Undocumented patterns
- Architectural drift

## Output Schema

The generated JSON contains:

```typescript
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
    stats: { ... }
  }
}
```

### Edge Types

The knowledge graph uses three types of relationships:

**`references`** - Documentation references architectural entities

- Doc → Module: Documentation describes this module
- Doc → Export: Documentation describes this export
- Doc → Folder: Documentation describes this folder
- Doc → Term: Documentation uses this term

**`contains`** - Hierarchical folder nesting based on filesystem paths

- Folder → Folder: Parent folder contains child folder (e.g., `src/server` contains `src/server/services`)
- Determined by path prefix matching: if child path starts with parent path + `/`, parent contains child

**`belongs-to`** - Module and export ownership based on resolved file paths

- Module → Folder: Module file is located within folder path
- Export → Module: Export is from the same source file as module
- Export → Folder: Export file is within folder path (when no matching module exists)
- Determined by comparing resolved filesystem paths to find the most specific container

## Advanced

### Export<> primitive

The `Export<>` primitive creates type-safe references to actual code exports using TypeScript's `typeof import()` syntax:

```tsx
import type { Export } from "tskb";

declare global {
  namespace tskb {
    interface Exports {
      // Reference a class export
      TaskRepository: Export<{
        desc: "Data access layer for task persistence with pagination and filtering";
        type: typeof import("../src/server/database/repositories/task.repository.js").TaskRepository;
      }>;

      // Reference a function export
      AuthMiddleware: Export<{
        desc: "Authentication middleware for protected routes";
        type: typeof import("../src/server/middleware/auth.middleware.js").authenticate;
      }>;

      // Reference React Context
      TaskContext: Export<{
        desc: "React Context managing task state and CRUD operations";
        type: typeof import("../src/client/contexts/TaskContext.js").TaskContext;
      }>;
    }
  }
}
```

TypeScript validates import paths and export names at compile time. Refactoring tools can update references automatically.

### Distributed vocabulary

Vocabulary declarations merge across files using TypeScript's declaration merging:

```tsx
// In vocabulary/server-vocabulary.tskb.tsx
import type { Export } from "tskb";

declare global {
  namespace tskb {
    interface Exports {
      TaskService: Export<{
        desc: "Manages task CRUD operations and business logic";
        type: typeof import("../../src/server/services/task.service.js").TaskService;
      }>;
      TaskRepository: Export<{
        desc: "Data access layer for task persistence";
        type: typeof import("../../src/server/database/repositories/task.repository.js").TaskRepository;
      }>;
    }
  }
}

// In vocabulary/client-vocabulary.tskb.tsx
import type { Export } from "tskb";

declare global {
  namespace tskb {
    interface Exports {
      TaskContext: Export<{
        desc: "React Context managing task state";
        type: typeof import("../../src/client/contexts/TaskContext.js").TaskContext;
      }>;
    }
  }
}

// Both are available in any .tskb.tsx file after declaration merging
const TaskServiceExport = ref as tskb.Exports["TaskService"];
const TaskContextExport = ref as tskb.Exports["TaskContext"];
```

### JSX runtime configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tskb"
  }
}
```

### Path resolution

For accurate path resolution, set `rootDir` in your tsconfig:

```json
{
  "compilerOptions": {
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

## Examples

See [examples/taskflow-app](../../examples/taskflow-app) for a full-stack TypeScript app with ADRs, design constraints, and layer documentation.

See [docs/tskb-package](../../docs/tskb-package) for self-documenting the tskb package itself ([visualization](../../docs/tskb-package/dist/architecture.dot)).

## FAQ

**How is this different from JSDoc?**

JSDoc documents individual functions/classes in source files - what parameters they take, what they return. tskb documents architecture - how modules relate, where functionality lives, what patterns you use. JSDoc comments sit above functions; tskb files sit in a separate docs folder.

|                 | JSDoc                                            | tskb                                                        |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| **Level**       | API-level (function signatures, parameter types) | Architecture-level (module relationships, system structure) |
| **Type Safety** | No type-safe references to other modules         | `typeof import()` ensures references are compiler-validated |
| **Output**      | Extracted to HTML/JSON for display               | Builds queryable knowledge graph for AI and analysis        |

**How is this different from MDX?**

MDX lets you write Markdown with embedded JSX components for rich documentation. tskb uses JSX but enforces type safety through TypeScript.

|                | MDX                                                      | tskb                                                         |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **Purpose**    | General-purpose documentation with JSX for interactivity | Architecture documentation with type-checked code references |
| **Validation** | No compiler validation of code references                | TypeScript compiler validates all imports and types          |
| **Output**     | Renders to HTML/React for display                        | Generates knowledge graph for programmatic analysis          |
| **Focus**      | Content-focused (guides, tutorials, marketing pages)     | Structure-focused (architecture, relationships, patterns)    |

**How is this different from Markdown?**

Markdown is great for writing documentation, but it has no understanding of your code structure. tskb builds on TypeScript to create type-safe architectural documentation.

|                     | Markdown (.md)                                 | tskb                                                        |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| **Code References** | Plain text - breaks silently when code changes | Type-checked via `typeof import()` - breaks at compile time |
| **Structure**       | Free-form text                                 | Structured declarations (Folders, Exports, Terms)           |
| **Validation**      | None - links and references are just strings   | TypeScript compiler validates all references                |
| **Output**          | Rendered as HTML/text                          | Knowledge graph + can generate .md files (Agents.md, etc.)  |
| **AI Integration**  | AI parses raw text                             | AI gets structured graph built from type-safe documentation |

**Note:** tskb can generate specialized Markdown files from your type-safe documentation - like `Agents.md` for AI agent configurations, `claude.md` for Claude-specific context, or `skills.md` for capability documentation. These are built from your validated architecture declarations, ensuring they stay accurate as your code evolves.

**Does this work with JavaScript?**

You need TypeScript for the `.tskb.tsx` files, but you can document JavaScript projects.

**Performance impact on CI?**

Depends on your docs and project size, but shouldn't take more than a normal TypeScript build. The build time is proportional to the number of documentation files and their complexity.

**What if I rename a file?**

Docs fail to compile. Fix the import path and you're done.

**Do I need to document everything?**

No. Start with the most important architecture - what you'd explain to a new team member joining the project. Document the core layers, key modules, and important patterns. Then grow the documentation gradually as needed.

Treat it as living docs: when working with AI assistants on specific features or refactorings, add the architectural insights from those sessions as documentation artifacts. This preserves optimized context for future AI interactions and team members. You can use AI assistants to help write the docs by pointing them at specific files or folders to document.

## Roadmap

- Knowledge graph optimizations and query capabilities
- Context layer for better AI integration
- MCP server implementation

## License

MIT © Dimitar Mihaylov
