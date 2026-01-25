# TaskFlow Documentation

Architecture documentation for the TaskFlow example application, written using tskb.

## Documentation Files

Each file declares the vocabulary it needs using TypeScript's declaration merging:

- **taskflow-vocabulary.tskb.tsx** - Base vocabulary (top-level folders and common terms)
- **architecture-overview.tskb.tsx** - High-level system architecture and data flow
- **authentication-system.tskb.tsx** - Auth implementation (declares AuthService, AuthContext, etc.)
- **data-layer.tskb.tsx** - Repository pattern (declares Database, repositories, type exports)
- **constraint-service-isolation.tskb.tsx** - Constraint: Services must use repositories
- **constraint-api-responses.tskb.tsx** - Constraint: Consistent API response structure
- **adr-repository-pattern.tskb.tsx** - ADR: Why we use repository pattern
- **adr-context-over-redux.tskb.tsx** - ADR: React Context vs Redux

**Note:** Vocabulary is distributed across files - each document declares what it needs. The global `tskb` namespace merges all declarations together.

## Building Knowledge Graph

```bash
npm run build        # Generate taskflow-graph.json
npm run visualize    # Generate architecture.dot
```

## Vocabulary Summary

### Folders (16 total)

- **Top-level:** Client, Server, Shared
- **Client subdirs:** Components, Pages, Contexts, Hooks, ClientServices
- **Server subdirs:** Services, Controllers, Middleware, Database, Repositories
- **Shared subdirs:** Types, Utils, Config

### Modules (13 total, using Export<> primitive)

- **Services:** AuthService, TaskService, ProjectService, UserService, NotificationService
- **Repositories:** TaskRepository, UserRepository, ProjectRepository
- **Contexts:** AuthContext, TaskContext, ProjectContext
- **Utilities:** ApiClient, WebSocketService, AuthMiddleware, ErrorHandler

Each module references actual exports from the TaskFlow codebase using the `Export<>` primitive with:

- `path` - Relative path to source file
- `export` - Named export to reference
- `desc` - Description of the module

### Terms (9 total)

- repositoryPattern, serviceLayer, contextProvider
- jwt, pagination, middlewareChain
- dependencyInjection, crudOperations, typeGuards

## Example: Distributed Vocabulary Pattern

Each documentation file can declare its own vocabulary using declaration merging:

```tsx
// In data-layer.tskb.tsx
import { Doc, H1, P, ref } from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      TaskRepository: Export<{
        desc: "Data access layer for task persistence";
        type: typeof import("../../examples/taskflow/src/server/database/repositories/task.repository").TaskRepository;
      }>;
    }
  }
}

export default (
  <Doc>
    <H1>Data Layer</H1>
    <P>The {ref as tskb.Modules["TaskRepository"]} handles...</P>
  </Doc>
);
```

**Key points:**

- Use `type: typeof import('path').ExportName` syntax
- TypeScript validates the import path and export name
- All declarations merge into the global `tskb` namespace
- Vocabulary stays close to where it's used
