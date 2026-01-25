# tskb

**TypeScript Knowledge Base** — Architecture-as-code with type-safe documentation for AI collaboration.

## What is tskb?

tskb lets you document your codebase's architecture using TypeScript's type system and JSX, then generates a queryable knowledge graph that AI tools can understand.

**The problem:** AI assistants struggle to understand your project's architecture. Comments drift, docs rot, and there's no machine-queryable source of truth.

**The solution:** Define your architecture vocabulary (Folders, Modules, Terms) with TypeScript's declaration merging, write type-safe documentation in JSX, and generate structured knowledge graphs.

## Features

- ✅ **Type-safe references** — TypeScript validates that referenced entities exist
- ✅ **JSX documentation** — Familiar syntax for writing structured content
- ✅ **Knowledge graph output** — JSON format optimized for AI consumption
- ✅ **Graphviz visualization** — Auto-generated architecture diagrams
- ✅ **Cross-platform** — Portable paths, works on Windows/Mac/Linux
- ✅ **Monorepo-friendly** — Document complex architectures at scale

## Installation

```bash
npm install --save-dev tskb
```

## Quick Start

### 1. Define your vocabulary

Create a `.tskb.tsx` file with your architecture vocabulary:

```tsx
// docs/architecture.tskb.tsx

declare global {
  namespace tskb {
    interface Folders {
      Auth: Folder<{
        desc: "Authentication and authorization system";
        path: "src/auth";
      }>;
      Api: Folder<{
        desc: "REST API endpoints";
        path: "src/api";
      }>;
    }

    interface Modules {
      AuthService: Export<{
        desc: "Handles user authentication and session management";
        type: typeof import("@/auth/AuthService").AuthService;
      }>;
      ApiClient: Export<{
        desc: "HTTP client for API communication";
        type: typeof import("@/api/client").ApiClient;
      }>;
    }

    interface Terms {
      jwt: Term<"JSON Web Token used for stateless authentication">;
    }
  }
}

export {};
```

### 2. Write documentation

Create documentation files that reference your vocabulary:

```tsx
// docs/auth-overview.tskb.tsx
import { Doc, H1, H2, P, List, Li, Snippet, ref } from "tskb";

export default (
  <Doc>
    <H1>Authentication System</H1>

    <P>
      The {ref as tskb.Folders["Auth"]} handles user authentication using {ref as tskb.Terms["jwt"]}{" "}
      tokens. The core logic is in {ref as tskb.Modules["AuthService"]}.
    </P>

    <H2>How it works</H2>
    <List>
      <Li>User submits credentials to login endpoint</Li>
      <Li>AuthService validates against database</Li>
      <Li>JWT token issued and returned to client</Li>
    </List>

    <H2>Example Usage</H2>
    <Snippet
      code={() => {
        const authService = new AuthService();
        const token = authService.login(username, password);
        return token;
      }}
    />
  </Doc>
);
```

### 3. Generate the knowledge graph

```bash
# Build the knowledge graph
npx tskb "docs/**/*.tskb.tsx" --out graph.json --tsconfig tsconfig.json

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

## Core Concepts

### Folders

Represent logical groupings in your codebase (features, layers, packages):

```typescript
interface Folders {
  FeatureName: Folder<{
    desc: "Description of what this folder contains";
    path: "relative/path/from/repo/root"; // Optional
  }>;
}
```

### Modules

Represent concrete code units (classes, services, components):

```typescript
interface Modules {
  ModuleName: Export<{
    desc: "What this module does";
    type: typeof import("@/path/to/module").ExportedName;
  }>;
}
```

The `Export<>` primitive uses TypeScript's `typeof import()` syntax to create type-safe references to actual code exports. This ensures documentation stays in sync with your codebase.

### Terms

Represent domain concepts, patterns, or terminology:

```typescript
interface Terms {
  termName: Term<"Definition of this concept">;
}
```

### Documentation Components

tskb provides JSX components for structured documentation:

- **`<Doc>`** - Document container (root element)
- **`<H1>`, `<H2>`, `<H3>`** - Headings
- **`<P>`** - Paragraphs
- **`<List>`, `<Li>`** - Lists and list items
- **`<Snippet>`** - Code snippets with syntax highlighting

**Referencing entities:**

Use type assertions with `ref` to create type-safe references:

```tsx
{
  ref as tskb.Folders["FolderName"];
}
{
  ref as tskb.Modules["ModuleName"];
}
{
  ref as tskb.Terms["termName"];
}
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
import { TaskCard } from "examples/myapp/src/components/TaskCard.js";
import { Doc, H2, Snippet } from "tskb";

export default (
  <Doc>
    <H2>Task Card Component</H2>

    <Snippet
      code={() => {
        // Type-safe! TypeScript knows TaskCard's props
        return (
          <TaskCard
            task={{ id: "1", title: "Example", status: "open" }}
            onUpdate={(task) => console.log(task)}
          />
        );
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

## CLI Reference

### Build Command

```bash
tskb <pattern> --out <file> --tsconfig <path>
```

- `<pattern>` — Glob pattern for documentation files (e.g., `"docs/**/*.tskb.tsx"`)
- `--out` — Output path for knowledge graph JSON
- `--tsconfig` — Path to tsconfig.json

### Visualize Command

```bash
tskb visualize <input> --out <file>
```

- `<input>` — Path to knowledge graph JSON
- `--out` — Output path for DOT file

## Configuration

Create a `tskb.json` in your project root:

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

### 🤖 AI Context

Feed the generated JSON to AI assistants for accurate architectural understanding:

```typescript
// AI can now understand:
// - What folders exist and their purpose
// - What modules belong to each folder
// - How documentation references specific code
// - Domain terminology and concepts
```

### 📚 Onboarding

Generate up-to-date architecture diagrams and documentation for new developers.

### 🔍 Code Reviews

Reference the knowledge graph to validate that changes align with documented architecture.

### 📊 Architecture Analysis

Query the graph programmatically to find:

- Orphaned modules (no documentation)
- Missing references
- Architecture violations

## Knowledge Graph Schema

The generated JSON contains:

```typescript
{
  nodes: {
    folders: Record<string, FolderNode>;
    modules: Record<string, ModuleNode>;
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

## Advanced Usage

### Export<> Primitive

The `Export<>` primitive creates type-safe references to actual code exports using TypeScript's `typeof import()` syntax:

```tsx
declare global {
  namespace tskb {
    interface Modules {
      // Reference a class export
      TaskService: Export<{
        desc: "Manages task CRUD operations";
        type: typeof import("../src/services/task.service").TaskService;
      }>;

      // Reference a function export
      authenticate: Export<{
        desc: "Authentication middleware";
        type: typeof import("../src/middleware/auth").authenticate;
      }>;

      // Reference a type/interface export
      Task: Export<{
        desc: "Task entity type";
        type: typeof import("../src/types/task").Task;
      }>;
    }
  }
}
```

**Benefits:**

- TypeScript validates the import path and export name at compile time
- Auto-completion works when referencing modules
- Refactoring tools can update references automatically
- Documentation breaks if referenced code is removed/renamed

### Distributed Vocabulary Pattern

Vocabulary declarations merge across files using TypeScript's declaration merging:

```tsx
// In data-layer.tskb.tsx
declare global {
  namespace tskb {
    interface Modules {
      TaskRepository: Export<{
        desc: "Data access layer for tasks";
        type: typeof import("../src/db/task.repository").TaskRepository;
      }>;
    }
  }
}

// In auth.tskb.tsx
declare global {
  namespace tskb {
    interface Modules {
      AuthService: Export<{
        desc: "Authentication service";
        type: typeof import("../src/services/auth").AuthService;
      }>;
    }
  }
}

// Both modules are available in any .tskb.tsx file
{
  ref as tskb.Modules["TaskRepository"];
}
{
  ref as tskb.Modules["AuthService"];
}
```

This keeps vocabulary declarations close to where they're used.

### Custom JSX Runtime

tskb provides a JSX runtime for writing documentation:

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tskb"
  }
}
```

### Path Resolution

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

See the [examples directory](../../tools/tskb-docs) for a complete example documenting an Electron monorepo.

## Roadmap

- [ ] CLI query commands (`tskb query graph.json folder "Auth"`)
- [ ] Markdown export for GitHub
- [ ] MCP server for AI editors (Cursor, Cline)
- [ ] VS Code extension with inline previews
- [ ] Validation warnings for stale references
- [ ] Template library (`tskb init --template next-monorepo`)

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT

---

**Built with ❤️ for better AI-human collaboration in codebases**
