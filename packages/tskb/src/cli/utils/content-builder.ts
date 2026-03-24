import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Build the query/explore body used by the tskb skill and query instructions.
 *
 * Contains: graph concepts, commands, response shapes, folder structure, docs, constraints, and workflow.
 */
export function buildQueryBody(graph: KnowledgeGraph): string {
  const folderTree = buildFolderTree(graph, 2);
  const docSummaries = buildDocSummaries(graph, true);

  return `## When to Use

Use tskb **first** — before grepping or reading files. It tells you where things are and how they relate, so you don't waste time exploring blind. Think of it as asking a teammate "where does X live?" instead of searching every folder yourself.

- **Find things** — \`search\` or \`ls\` to locate modules, exports, folders by name or concept.
- **Understand connections** — \`pick\` or \`context\` to see what a module imports, exports, and what docs reference it.
- **Check rules** — Constraint docs define rules you must follow. They show up in \`pick\` results automatically.
- **Skip it** — If you already know exactly which file to edit and the change is self-contained.

## Commands

\`\`\`bash
npx --no -- tskb search "<query>" --plain                    # Fuzzy search across the entire graph
npx --no -- tskb pick "<identifier>" --plain                  # Detailed info on any node (by ID or path)
npx --no -- tskb context "<identifier>" --depth=2 --plain     # Node + neighborhood + docs (BFS traversal)
npx --no -- tskb ls --depth=4 --plain                         # Folder hierarchy
npx --no -- tskb docs "<query>" --plain                       # Search docs
\`\`\`

Drop \`--plain\` for JSON output. Use \`--optimized\` for compact JSON (no whitespace).

## What's on the Map

- **Folder** — a logical area (feature, layer, package). Has a path and description.
- **Module** — a source file. Shows imports, exports, and code stubs with line numbers.
- **Export** — a function, class, type, or constant from a module.
- **File** — a non-JS/TS file (README, config, etc.).
- **External** — something outside the repo (npm package, API, cloud service, database). Has free-form key-value metadata.
- **Term** — a domain concept, not tied to a file.
- **Doc** — a \`.tskb.tsx\` documentation file. Has priority: essential, constraint, or supplementary.

All paths are relative to project root and can be used directly to read files.

## What Each Command Returns

- **search** — ranked results by relevance. Use \`pick\` on any \`nodeId\` for details.
- **pick** — full detail for one node. Modules/exports show code stubs with line ranges (\`// :42-68\`). Modules show imports, importedBy, and exports list. Folders show children. Externals show metadata key-value pairs. Constraint docs in results **MUST** be read.
- **context** — a node and its neighbors (BFS traversal). Shows what connects to what.
- **ls** — folder tree with essential docs.
- **docs** — search or list all docs. Use \`pick\` on a doc ID for full content.

## Folder Structure

${folderTree}

## Documentation

${docSummaries}

Constraint docs define architectural rules that **MUST** be followed when working on related code.`;
}

/**
 * Build the update/authoring body used by the tskb-update skill and update instructions.
 *
 * Contains: philosophy, when to update, how to write .tskb.tsx files, primitives, examples, best practices.
 */
export function buildUpdateBody(graph: KnowledgeGraph): string {
  const docsFolder = Object.values(graph.nodes.folders).find((f) => f.id === "docs");
  const docsPath = docsFolder?.path ?? "docs";

  return `## Key Rules — READ THIS FIRST

- **Structural maps, not implementation manuals.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Terse like code comments.** One or two sentences per \`<Doc>\`. References *are* the documentation; prose just connects them.
- **Import, don't hardcode.** If a type/class/value exists in the codebase, import it. Imports create physical binds the compiler validates.
- **Rebuild after editing.** Check the root \`package.json\` for the project's tskb build script and run it. The build throws if any path or reference doesn't resolve.

## When to Update Docs

**Do** document when:
- A folder, module, or export plays a structural role but isn't in the graph
- A new feature area warrants its own declarations
- An architectural decision should be recorded as a constraint
- The developer explicitly asks

**Don't** document: routine bug fixes, internal function changes, temporary code.

## File Structure

Docs live in \`${docsPath}/\` as \`.tskb.tsx\` files. Each has two parts:

**1. Registry block** — declares structural elements:

\`\`\`tsx
declare global {
  namespace tskb {
    interface Folders {
      "my-feature": Folder<{ desc: "User authentication and sessions"; path: "src/auth" }>;
    }
    interface Modules {
      "auth.service": Module<{ desc: "Core auth service"; type: typeof import("src/auth/service.js") }>;
    }
    interface Exports {
      "auth.service.login": Export<{ desc: "Authenticates user, returns session token"; type: typeof import("src/auth/service.js").login }>;
    }
    interface Files {
      "auth.config.yml": File<{ desc: "Auth provider configuration"; path: "src/auth/config.yml" }>;
    }
    interface Externals {
      "redis": External<{ desc: "Session cache and pub/sub"; url: "https://redis.io" }>;
    }
    interface Terms {
      sessionToken: Term<"JWT issued on login for authenticating API requests">;
    }
  }
}
\`\`\`

**2. JSX content** — references nodes and explains relationships:

\`\`\`tsx
const AuthFolder = ref as tskb.Folders["my-feature"];
const AuthService = ref as tskb.Modules["auth.service"];

export default (
  <Doc explains="Authentication: service, token flow, session management">
    <P>Located in {AuthFolder}. Core logic in {AuthService}.</P>
  </Doc>
);
\`\`\`

## Registry Primitives

- \`Folder<{ desc: "..."; path: "..." }>\` — Logical grouping. Path relative to project root.
- \`Module<{ desc: "..."; type: typeof import("...") }>\` — Source file. Import path must resolve.
- \`Export<{ desc: "..."; type: typeof import("...").Name }>\` — Named export. Compiler validates existence.
- \`File<{ desc: "..."; path: "..." }>\` — Non-JS/TS file (README, config, etc.). Path relative to project root.
- \`External<{ desc: "..."; [key: string]: "..." }>\` — Something outside the repo (npm package, API, cloud service). Free-form key-value metadata (url, version, kind, etc.).
- \`Term<"...">\` — Domain concept. Not tied to a file.

Reference nodes in JSX via type assertions: \`const X = ref as tskb.Modules["id"]\` or \`const R = ref as tskb.Externals["redis"]\`, then use \`{X}\` in JSX.

## JSX Components

- <Doc explains="..." priority?="essential"|"constraint"|"supplementary"> — Root component. Every file exports one.
- <Snippet code={() => { ... }} /> — Code example using real imports. Creates physical binds.
- <Relation from={...} to={...} label?="..." /> — Declares a semantic relation between two nodes. from and to must be node constants (from the registry). label is optional and describes the relationship (e.g., "depends on"). Produces a related-to edge in the graph, visible in CLI output.
- <Adr id="..." title="..." status="accepted"|"proposed"|"deprecated"|"superseded"> — Architecture Decision Record.
- <H1>, <H2>, <H3>, <P>, <List>/<Li> — Content components.

## Priorities

- essential — Orientation docs shown in ls. Use sparingly.
- constraint — Architectural rules. Must be followed.
- supplementary (default) — Additional context.

## Good vs Bad

\`\`\`tsx
// GOOD — short, structural, bound to nodes
<Doc explains="Task scheduling: queue, workers, retry logic">
  <P>{TaskQueue} dispatches jobs to {WorkerPool}. Retry policy in {RetryConfig}.</P>
</Doc>

// BAD — verbose, narrates implementation
<Doc explains="Task scheduling system">
  <P>The system works by accepting tasks into a queue, prioritized by creation time.
  The worker pool picks up tasks using round-robin. Each worker processes and reports back...</P>
</Doc>
\`\`\`

Never describe algorithms, control flow, or internal logic. Never duplicate what type signatures already communicate.`;
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
      return `${lines}\n\n_Plus ${supplementaryCount} supplementary doc${supplementaryCount === 1 ? "" : "s"} available via \`npx --no -- tskb docs --optimized\`._`;
    }
  }

  return lines;
}
