import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Build the shared markdown body used by both skill and instructions generators.
 *
 * Contains: commands, response shapes, folder structure, docs, constraints, and workflow.
 */
export function buildBody(graph: KnowledgeGraph): string {
  const folderTree = buildFolderTree(graph, 2);
  const docSummaries = buildDocSummaries(graph, true);
  const docsFolder = Object.values(graph.nodes.folders).find((f) => f.id === "docs");
  const docsPath = docsFolder?.path ?? "docs";

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
npx tskb ls --depth=4
\`\`\`

Get detailed info on any node (by ID or path):
\`\`\`bash
npx tskb pick "<identifier>"
\`\`\`

Search for concepts, modules, or folders:
\`\`\`bash
npx tskb search "<query>"
\`\`\`

Get full context for an area (node + neighborhood + docs):
\`\`\`bash
npx tskb context "<identifier>" --depth=2
\`\`\`

## Command Response Shapes

All paths in responses are relative to where \`tskb build\` was run. They can be used directly to read files or navigate the filesystem.

**search** returns ranked results across all node types:
\`\`\`json
{ "query": "...",
  "results": [{ "type": "folder|module|export|term|doc", "id": "...", "desc": "...", "score": 0.85 }] }
\`\`\`
Use \`pick\` on any result ID to get full details.

**pick** returns type-specific context for any node:
\`\`\`json
{ "type": "folder", "node": { "id": "...", "desc": "...", "path": "..." },
  "parent": { ... }, "childFolders": [...], "modules": [...],
  "exports": [...], "referencingDocs": [{ "id": "...", "explains": "...", "priority": "..." }] }
\`\`\`
Follow \`referencingDocs\` to find related documentation. Constraint docs in this list MUST be read.

**context** returns a node's full neighborhood with inline doc content:
\`\`\`json
{ "root": { "id": "...", "type": "folder", "desc": "...", "resolvedVia": "id" },
  "nodes": [{ "id": "...", "type": "module", "desc": "...", "depth": 1 }],
  "docs": [{ "id": "...", "explains": "...", "priority": "...", "content": "...", "filePath": "..." }],
  "constraints": ["constraint-doc-id"] }
\`\`\`
Use \`context\` to get everything about an area in one call. Constraints are surfaced at the top level.

**ls** returns the folder hierarchy and essential docs:
\`\`\`json
{ "root": "...", "folders": [{ "id": "...", "desc": "...", "path": "..." }],
  "docs": [{ "id": "...", "explains": "...", "filePath": "..." }] }
\`\`\`

## Folder Structure

${folderTree}

## Documentation

Each doc has an \`explains\` field describing its purpose. Use this to decide which docs to read.

${docSummaries}

## Constraints

Some docs are marked as **constraints** (\`priority="constraint"\`). These define architectural rules and invariants that **MUST** be followed when working on related modules or folders. When \`pick\` or \`ls\` shows a constraint doc referencing the area you're working on, **read it before making changes**.

## Workflow

1. **Orient** — Scan the folder structure above to find the relevant area
2. **Search** — Run \`npx tskb search "<query>"\` to find specific nodes
3. **Pick** — Run \`npx tskb pick "<id>"\` for full context on a node. Check for constraint docs.
4. **Explore** — Only then use file reading tools for implementation details not covered by the graph
5. **Act** — Make architecturally coherent changes based on what you learned

## Updating Documentation

Documentation lives in \`${docsPath}/\` as \`.tskb.tsx\` files. When you notice structural elements (new folders, modules, services, important exports) that aren't captured in the graph, suggest adding them to the relevant doc file.

**When to update docs:**

- You discover a folder, module, or export that plays a structural role but isn't in the graph
- A new feature area is added that warrants its own folder/module declarations
- An architectural decision is made that should be recorded as an ADR or constraint

**How to update docs:**

- Declare new items in the \`declare global { namespace tskb { ... } }\` block using the type-safe primitives: \`Folder<{ desc: "..."; path: "..." }>\`, \`Module<{ desc: "..."; type: typeof import("...") }>\`, \`Export<{ desc: "..."; type: typeof import("...").Name }>\`, \`Term<"...">\`
- Import code elements directly and bind them to typed variables — use \`typeof\` to reference actual code rather than describing it in prose
- Reference graph nodes in JSX via type assertions: \`{ref as tskb.Modules['Name']}\` or \`{ref as tskb.Folders['Name']}\`
- Avoid free-text prose — let the type-safe bindings and structural primitives describe the architecture
- After editing, rebuild with \`npx tskb build\` — the build will throw if any path or reference doesn't resolve

**Best Practices:**

- **Keep it minimal** — Document structure and relationships, not implementation details. Let the code speak for itself.
- **Bind via primitives** — Use \`Folder<>\`, \`Module<>\`, and \`Export<>\` to declare structural elements. Reference them in JSX with \`{ref as tskb.X['Name']}\`. This keeps docs anchored to the codebase and resistant to decay.
- **Avoid implementation details** — Don't describe how functions work internally. Instead, explain what role they play in the architecture and how they relate to other components.
- **Focus on "why" and "what"** — Explain architectural decisions, responsibilities, and relationships. Code diffs show the "how."
- **Mark constraints** — Use \`priority="constraint"\` for rules that must be followed. Use \`priority="essential"\` for orientation docs that provide architectural overview.`;
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
      return `${indent}- **${f.id}** (\`${f.path}\`) — ${f.desc}`;
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
      return `${lines}\n\n_Plus ${supplementaryCount} supplementary doc${supplementaryCount === 1 ? "" : "s"} available via \`npx tskb search\`._`;
    }
  }

  return lines;
}
