import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Build the query/explore body used by the tskb skill and query instructions.
 *
 * Contains: graph concepts, commands, response shapes, folder structure, docs, constraints, and workflow.
 */
export function buildQueryBody(graph: KnowledgeGraph): string {
  const folderTree = buildFolderTree(graph, 2);
  const docSummaries = buildDocSummaries(graph, true);

  return `## Graph Concepts

The knowledge graph consists of these node types:

- **Folder**: Logical grouping in the codebase (feature, layer, package). Has an ID, description, and filesystem path.
- **Module**: A source file or unit of code. Linked to its parent folder via belongs-to edges.
- **Export**: A specific function, class, type, or constant exported from a module. Type-checked via \`typeof import()\`.
- **Term**: A domain concept, pattern, or piece of terminology. Not tied to a file — used to name ideas.
- **Doc**: A \`.tskb.tsx\` documentation file. References other nodes to create edges. Has an \`explains\` field and a \`priority\` (essential, constraint, or supplementary).

## Commands


List folder hierarchy:
\`\`\`bash
npx --no -- tskb ls --depth=4
\`\`\`

Get detailed info on any node (by ID or path):
\`\`\`bash
npx --no -- tskb pick "<identifier>"
\`\`\`

Search for concepts, modules, or folders:
\`\`\`bash
npx --no -- tskb search "<query>"
\`\`\`

List or search docs:
\`\`\`bash
npx --no -- tskb docs
npx --no -- tskb docs "<query>"
\`\`\`

Get full context for an area (node + neighborhood + docs):
\`\`\`bash
npx --no -- tskb context "<identifier>" --depth=2
\`\`\`

## Command Response Shapes

All paths in responses are relative to where \`tskb build\` was run. They can be used directly to read files or navigate the filesystem.

**search** returns ranked results. Folders include \`structureSummary\`, modules include \`morphologySummary\`. Use \`pick\` on any \`nodeId\` for full details.

**pick** returns type-specific detail:
- **Folder**: \`node.children\` lists filesystem contents — each child has \`name\` and, if registered, \`nodeId\` + \`desc\`. \`node.structureSummary\` gives counts.
- **Module**: \`node.morphology\` is a \`string[]\` of code stubs (function signatures, class/interface shapes with methods and fields). \`node.morphologySummary\` gives counts.
- **Doc**: \`node.content\` has full text inline.
- All types include \`referencingDocs\`. Constraint docs in this list **MUST** be read.

**context** returns a node's neighborhood (BFS traversal) with all referencing docs and constraints surfaced at top level.

**ls** returns essential docs first, then folder hierarchy with \`structureSummary\` on each folder.

**docs** lists or searches all docs. Use \`pick\` on a doc \`nodeId\` to get full content.
\`\`\`

## Folder Structure

${folderTree}

## Documentation

Each doc has an \`explains\` field describing its purpose. Use this to decide which docs to read.

${docSummaries}

## Constraints

Some docs are marked as **constraints** (\`priority="constraint"\`). These define architectural rules and invariants that **MUST** be followed when working on related modules or folders. When \`pick\` or \`ls\` shows a constraint doc referencing the area you're working on, **read it before making changes**.

## Workflow

**For every new task, query TSKB first** — the knowledge graph captures developer intent, architectural decisions, and constraints that filesystem exploration alone will miss. Only fall back to file reading when TSKB has no coverage for the area (no registered folders, modules, or docs reference it).

1. **Query TSKB first** — Run \`search\`, \`pick\`, or \`context\` for the area you're about to touch. This is mandatory, not optional.
2. **Check for docs and constraints** — Read any referencing docs, especially constraints. These encode rules you must follow.
3. **If TSKB has no coverage** — The area is undocumented. Switch to filesystem exploration (file reads, grep) to understand it directly. Consider suggesting doc updates.
4. **Act** — Make architecturally coherent changes based on what you learned.

Do NOT skip step 1 and jump straight to reading files — you risk missing documented intent, constraints, and structural relationships that the developer has explicitly recorded.`;
}

/**
 * Build the update/authoring body used by the tskb-update skill and update instructions.
 *
 * Contains: philosophy, when to update, how to write .tskb.tsx files, primitives, examples, best practices.
 */
export function buildUpdateBody(graph: KnowledgeGraph): string {
  const docsFolder = Object.values(graph.nodes.folders).find((f) => f.id === "docs");
  const docsPath = docsFolder?.path ?? "docs";

  return `## Philosophy

TSKB docs are **structural maps**, not implementation manuals. They describe *what* exists, *where* it lives, and *why* it matters — never *how* it works internally. Implementation details drift with every commit; structural relationships are stable.

The type-safe primitives (\`Folder\`, \`Module\`, \`Export\`) anchor docs to real code via \`typeof import()\`. The TypeScript compiler validates that referenced files and exports actually exist — if code moves or is deleted, the build breaks, so docs can't silently go stale.

## Doc Content: Think Code Comments, Not Prose

**\`<Doc>\` blocks must be terse — like code comments, not essays.** Each \`<Doc>\` should:

- **State what this is and its main purpose** — one or two sentences, no more.
- **Bind to actual nodes** — reference \`Folder\`, \`Module\`, \`Export\`, and \`Term\` refs. The references *are* the documentation; prose just connects them.
- **Never narrate implementation** — don't describe control flow, algorithms, function internals, or step-by-step logic. That belongs in the code itself.

A good \`<Doc>\` reads like a label on a map: "This folder handles X. Key module is Y, which provides Z." A bad \`<Doc>\` reads like a tutorial with paragraphs explaining how things work internally.

\`\`\`tsx
// GOOD — short, structural, bound to nodes
export default (
  <Doc explains="Task scheduling: queue, workers, retry logic">
    <P>{TaskQueue} dispatches jobs to {WorkerPool}. Retry policy in {RetryConfig}.</P>
  </Doc>
);

// BAD — verbose, implementation-heavy
export default (
  <Doc explains="Task scheduling system">
    <H1>Task Scheduling</H1>
    <P>The task scheduling system works by first accepting tasks into a queue,
    where they are prioritized by creation time. The worker pool then picks up
    tasks using a round-robin strategy. Each worker processes the task and
    reports back. If a task fails, the retry module checks the retry count
    against the max retries configuration...</P>
  </Doc>
);
\`\`\`

## When to Update Docs

Suggest documenting when:

- You discover a folder, module, or export that plays a structural role but isn't in the knowledge graph
- A new feature area is added that warrants its own folder/module declarations
- An architectural decision is made that should be recorded as a constraint
- The developer explicitly asks to record something

Do **not** update docs for:

- Routine bug fixes or small implementation changes
- Internal function changes that don't affect structure
- Temporary or experimental code

## Documentation Files

Documentation lives in \`${docsPath}/\` as \`.tskb.tsx\` files. Each file has two parts:

### 1. Registry Block

Declares structural elements in a \`declare global\` block:

\`\`\`tsx
declare global {
  namespace tskb {
    interface Folders {
      "my-feature": Folder<{
        desc: "Handles user authentication and session management";
        path: "src/auth";
      }>;
    }

    interface Modules {
      "auth.service": Module<{
        desc: "Core authentication service — login, logout, token refresh";
        type: typeof import("src/auth/service.js");
      }>;
    }

    interface Exports {
      "auth.service.login": Export<{
        desc: "Authenticates a user with credentials, returns a session token";
        type: typeof import("src/auth/service.js").login;
      }>;
    }

    interface Terms {
      sessionToken: Term<"A JWT issued on login, used to authenticate subsequent API requests">;
    }
  }
}
\`\`\`

### 2. JSX Documentation Content

References declared nodes and explains relationships:

\`\`\`tsx
const AuthFolder = ref as tskb.Folders["my-feature"];
const AuthService = ref as tskb.Modules["auth.service"];

export default (
  <Doc explains="Authentication architecture: service, token flow, and session management">
    <H1>Authentication</H1>
    <P>Located in {AuthFolder}. Core logic in {AuthService}.</P>
  </Doc>
);
\`\`\`

## Importing Code for Physical Binding

Import real code from the codebase into \`.tskb.tsx\` files. This creates a **physical bind** — if the imported file moves, is renamed, or is deleted, the TypeScript compiler will fail, signaling that the doc needs updating. This prevents docs from silently going stale.

\`\`\`tsx
// Import types and values from the actual codebase
import { TaskRepository } from "src/server/database/repositories/task.repository.js";
import { Task } from "src/shared/types/task.types.js";
import { Database } from "src/server/database/connection.js";
\`\`\`

Use these imports in JSX instead of hardcoding names as strings:

\`\`\`tsx
// GOOD — physically bound, compiler catches changes
<Snippet code={() => {
  class Service {
    constructor(private repo: TaskRepository, private db: Database) {}
    async find(id: string): Promise<Task | null> {
      return this.repo.findById(id);
    }
  }
}} />

// BAD — hardcoded strings, silently goes stale
<P>The TaskRepository class in src/server/database uses the Database connection...</P>
\`\`\`

**Rule of thumb:** if something can be imported, import it. If you're writing a name that exists in the codebase as a string literal, it should probably be an import or a registry reference instead.

## Registry Primitives

- \`Folder<{ desc: "..."; path: "..." }>\` — A logical grouping. Path is relative to project root.
- \`Module<{ desc: "..."; type: typeof import("...") }>\` — A source file. Import path must resolve.
- \`Export<{ desc: "..."; type: typeof import("...").Name }>\` — A specific named export. Compiler validates existence.
- \`Term<"...">\` — A domain concept or pattern. Not tied to a file.

Use \`typeof import("path/to/file.js")\` for type references — the compiler validates the path exists.

## Referencing Nodes in JSX

Bind nodes to variables via type assertions, then use them in JSX:

\`\`\`tsx
const MyModule = ref as tskb.Modules["module-id"];
// In JSX: {MyModule} renders as a reference link
\`\`\`

Available namespaces: \`tskb.Folders\`, \`tskb.Modules\`, \`tskb.Exports\`, \`tskb.Terms\`.

## JSX Components

### \`<Doc>\`

The root component. Every \`.tskb.tsx\` file exports a default \`<Doc>\` element.

- \`explains\` (required) — Short description of what the doc covers.
- \`priority\` (optional) — \`"essential"\`, \`"constraint"\`, or \`"supplementary"\` (default).

### \`<Snippet>\`

Embeds a code example that uses real imported types and values. The function body is captured as a string in the graph.

\`\`\`tsx
import { TaskRepository } from "src/server/repositories/task.repository.js";
import { Database } from "src/server/database/connection.js";

<Snippet code={() => {
  // This code references real imports — compiler validates they exist
  class TaskRepo {
    constructor(private db: Database) {}
    async findById(id: string) {
      return this.db.query("SELECT * FROM tasks WHERE id = ?", [id]);
    }
  }
}} />
\`\`\`

Use \`<Snippet>\` to show architectural patterns and how components interact. The imported types inside the snippet create physical binds to the codebase.

### \`<Adr>\`

Architecture Decision Record — documents a significant architectural choice.

\`\`\`tsx
<Adr
  id="001"
  title="Use repository pattern for data access"
  status="accepted"
  date="2024-01-15"
  deciders="Team Lead, Senior Dev"
>
  <H2>Context</H2>
  <P>We needed to decide how services interact with the database...</P>

  <H2>Decision</H2>
  <P>Implement the repository pattern with one repository per domain entity.</P>

  <H2>Consequences</H2>
  <P>Better testability, more boilerplate...</P>
</Adr>
\`\`\`

Properties: \`id\` (required), \`title\` (required), \`status\` (\`"proposed"\` | \`"accepted"\` | \`"deprecated"\` | \`"superseded"\`), \`date\` (optional), \`deciders\` (optional).

### Content Components

\`<H1>\`, \`<H2>\`, \`<H3>\` — Headings. \`<P>\` — Paragraph. \`<List>\`/\`<Li>\` — Bulleted lists.

## Doc Priorities

Set via the \`priority\` attribute on \`<Doc>\`:

- **\`essential\`** — Orientation docs. Shown in \`ls\` output. Read these first to understand an area.
- **\`constraint\`** — Architectural rules and invariants. **Must** be followed when working on related code.
- **\`supplementary\`** — Additional context (default). Available via \`search\` and \`pick\`.

## What to Avoid

- **Implementation details** — Don't describe algorithms, control flow, or internal logic. These change constantly.
- **Prose about how functions work** — The code is the source of truth for "how."
- **Duplicating information available in code** — If a type signature or function name already communicates the intent, don't repeat it.
- **Anything that drifts with code changes** — If it would need updating after a refactor, it probably shouldn't be in the doc.

## Best Practices

- **Import, don't hardcode** — If a type, class, or value exists in the codebase, import it. Never write codebase names as string literals. Imports create physical binds that the compiler validates.
- **Keep it minimal** — Document structure and relationships, not implementation. Let the code speak for itself.
- **Anchor to code via primitives** — Use \`Folder<>\`, \`Module<>\`, and \`Export<>\` to declare elements. The compiler catches drift.
- **Use \`<Snippet>\` with real imports** — Snippets should reference imported types to stay bound to the codebase, not use made-up placeholder types.
- **Focus on "what" and "where"** — Explain what role things play and how they relate. Code diffs show the "how."
- **Use \`<Adr>\` for architectural decisions** — Record significant choices with context, decision, and consequences. These are long-lived and valuable.
- **Mark constraints** — Use \`priority="constraint"\` for rules that must be followed.
- **Use \`essential\` sparingly** — Only for top-level orientation docs.
- **Rebuild after editing** — Run \`npx --no -- tskb build\` to validate. The build will throw if any path or reference doesn't resolve.`;
}

/**
 * Build a markdown folder tree from the knowledge graph.
 *
 * @param graph - The knowledge graph
 * @param maxDepth - Maximum folder depth to include (0 = root only, -1 = unlimited). Defaults to -1.
 */
function buildFolderTree(graph: KnowledgeGraph, maxDepth: number = -1): string {
  const folders = Object.values(graph.nodes.folders)
    .filter((f) => f.path)
    .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));

  if (folders.length === 0) return "_No folders in graph._";

  return folders
    .filter((f) => {
      if (maxDepth === -1) return true;
      const depth = f.path === "." ? 0 : (f.path?.split("/").length ?? 0);
      return depth <= maxDepth;
    })
    .map((f) => {
      const depth = f.path === "." ? 0 : (f.path?.split("/").length ?? 0);
      const indent = "  ".repeat(depth);
      const summary = f.structureSummary ? ` [${f.structureSummary}]` : "";
      return `${indent}- **${f.id}** (\`${f.path}\`) — ${f.desc}${summary}`;
    })
    .join("\n");
}

/**
 * Build a markdown list of doc summaries from the knowledge graph.
 * Only includes docs with priority "essential".
 */
function buildDocSummaries(graph: KnowledgeGraph, essentialOnly: boolean): string {
  const allDocs = Object.values(graph.nodes.docs).sort((a, b) =>
    a.filePath.localeCompare(b.filePath)
  );

  if (allDocs.length === 0) return "_No docs in graph._";

  const docs = essentialOnly ? allDocs.filter((d) => d.priority === "essential") : allDocs;

  if (docs.length === 0)
    return '_No essential docs marked. Add `priority="essential"` to important `<Doc>` tags._';

  const lines = docs
    .map((d) => `- \`${d.filePath}\` — ${d.explains || "_no explains provided_"}`)
    .join("\n");

  if (essentialOnly) {
    const supplementaryCount = allDocs.length - docs.length;
    if (supplementaryCount > 0) {
      return `${lines}\n\n_Plus ${supplementaryCount} supplementary doc${supplementaryCount === 1 ? "" : "s"} available via \`npx --no -- tskb search\`._`;
    }
  }

  return lines;
}
