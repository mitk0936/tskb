import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Build the query/explore body used by the tskb skill and query instructions.
 *
 * Contains: graph concepts, commands, response shapes, folder structure, docs, constraints, and workflow.
 */
export function buildQueryBody(graph: KnowledgeGraph): string {
  const folderTree = buildFolderTree(graph, 2);
  const docSummaries = buildDocSummaries(graph, true);

  return `## Workflow — READ THIS FIRST

**Query TSKB every time you touch a new area** — not just at the start of a task. When your work moves to a different folder, module, or concept, query TSKB again before reading files. The graph captures developer intent, constraints, and structural relationships that filesystem exploration alone will miss.

1. **Query before touching** — Run \`search\`, \`pick\`, or \`context\` for the area you're about to touch. Do this each time you move to a new part of the codebase, even mid-task.
2. **Read docs and constraints** — Check \`referencingDocs\` in results. Constraint docs **MUST** be read and followed.
3. **Fall back to files only if TSKB has no coverage** — If no registered nodes or docs reference the area, use filesystem exploration. Consider suggesting doc updates.
4. **Act** — Make architecturally coherent changes based on what you learned.

Do NOT skip step 1 and jump straight to reading files — you risk missing documented intent and constraints.

## Commands

\`\`\`bash
npx --no -- tskb search "<query>" --optimized                    # Fuzzy search across the entire graph
npx --no -- tskb pick "<identifier>" --optimized                  # Detailed info on any node (by ID or path)
npx --no -- tskb context "<identifier>" --depth=2 --optimized     # Node + neighborhood + docs (BFS traversal)
npx --no -- tskb ls --depth=4 --optimized                         # Folder hierarchy
npx --no -- tskb docs "<query>" --optimized                       # Search docs
\`\`\`

Drop \`--optimized\` for human-readable output.

## Response Shapes

All paths are relative to where \`tskb build\` was run and can be used directly to read files.

- **search**: Ranked results with graph-aware scoring. Results are boosted when they are graph neighbors of higher-ranked results. Scores are relative to the top result (1.0 = best match). Folders include \`structureSummary\`, modules and exports include \`morphologySummary\`, modules include \`importsSummary\`. Use \`pick\` on any \`nodeId\` for full details.
- **pick**: Type-specific detail. Modules and exports include \`morphology\` (code stubs) and \`morphologySummary\`. Modules include \`imports\` (with \`moduleId\` when the target is a registered module), \`importsSummary\`, and \`importedBy\` (which registered modules import this one). Exports include \`parent\` with \`morphologySummary\` when the parent is a module (shows what else the module exports). Folders include \`children\`, \`structureSummary\`, and \`packageName\` (if the folder is an npm package root). Docs include \`content\`. All types include \`referencingDocs\` — constraint docs in this list **MUST** be read.
- **context**: Graph neighborhood traversal via BFS across all edge types (contains, belongs-to, imports, related-to). Returns connected nodes up to the specified depth, with all referencing docs and constraints surfaced at top level. Use for understanding what connects to a node — not just its structural children.
- **ls**: Essential docs first, then folder hierarchy with \`structureSummary\`.
- **docs**: Lists or searches all docs. Use \`pick\` on a doc \`nodeId\` to get full content.

## Graph Concepts

- **Folder**: Logical grouping (feature, layer, package). Has ID, description, filesystem path.
- **Module**: A source file. Linked to parent folder via belongs-to edges and to other modules via imports edges.
- **Export**: A specific function, class, type, or constant from a module. Type-checked via \`typeof import()\`.
- **File**: A non-JS/TS file (README.md, yml configs, etc.). Has ID, description, filesystem path.
- **Term**: A domain concept or pattern. Not tied to a file.
- **Doc**: A \`.tskb.tsx\` documentation file. Has \`explains\`, \`priority\` (essential, constraint, supplementary), and references to other nodes.

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
- \`Term<"...">\` — Domain concept. Not tied to a file.

Reference nodes in JSX via type assertions: \`const X = ref as tskb.Modules["id"]\`, then use \`{X}\` in JSX.

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
