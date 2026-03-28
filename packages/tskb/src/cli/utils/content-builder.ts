import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Build the query/explore body used by the tskb skill and query instructions.
 *
 * Contains: graph concepts, commands, response shapes, folder structure, docs, constraints, and workflow.
 */
export function buildQueryBody(graph: KnowledgeGraph): string {
  const folderTree = buildFolderTree(graph, 2);
  const docSummaries = buildDocSummaries(graph, true);
  const externalsSummary = buildExternalsSummary(graph);
  const flowsSummary = buildFlowsSummary(graph);

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
npx --no -- tskb flows [<query>] --plain                       # List flows sorted by priority
\`\`\`

Drop \`--plain\` for JSON output. Use \`--optimized\` for compact JSON (no whitespace).

## What's on the Map

- **Folder** — a logical area (feature, layer, package). Has a path and description.
- **Module** — a source file. Shows imports, exports, and code stubs with line numbers.
- **Export** — a function, class, type, or constant from a module.
- **File** — a non-JS/TS file (README, config, etc.).
- **External** — something outside the repo (npm package, API, cloud service, database). Has free-form key-value metadata.
- **Term** — a domain concept, not tied to a file.
- **Flow** — a named, ordered sequence of steps through the system. Has priority like docs.
- **Doc** — a \`.tskb.tsx\` documentation file. Has priority: essential, constraint, or supplementary.

All paths are relative to project root and can be used directly to read files.

## What Each Command Returns

- **search** — ranked results by relevance. Use \`pick\` on any \`nodeId\` for details.
- **pick** — full detail for one node. Modules/exports show code stubs with line ranges (\`// :42-68\`). Modules show imports, importedBy, and exports list. Folders show children. Externals show metadata key-value pairs. Constraint docs in results **MUST** be read.
- **context** — a node and its neighbors (BFS traversal). Shows what connects to what.
- **ls** — folder tree with essential docs.
- **docs** — search or list all docs. Use \`pick\` on a doc ID for full content.
- **flows** — list or search flows, sorted by priority. Use \`pick\` on a flow ID for steps.

## Folder Structure

${folderTree}

${externalsSummary}

${flowsSummary}

## Documentation

${docSummaries}

Constraint docs define architectural rules that **MUST** be followed when working on related code.`;
}

/**
 * Build the update/authoring body used by the tskb-update skill and update instructions.
 *
 * Contains: when to trigger updates, syntax reference, registry primitives, JSX components, good practices.
 */
export function buildUpdateBody(graph: KnowledgeGraph): string {
  const docsFolder = Object.values(graph.nodes.folders).find((f) => f.id === "docs");
  const docsPath = docsFolder?.path ?? "docs";

  return `## When to Update — Session Triggers

**Trigger an update during a session when:**
- You discover a folder, module, or export that plays a structural role but isn't in the graph
- A new feature area is being built (declare it before or alongside implementation)
- An architectural decision is being made that should be recorded (use \`<Adr>\`)
- A constraint is identified that future changes must respect (use \`priority="constraint"\`)
- An important process or sequence spans multiple modules — capture it as a \`<Flow>\`
- The developer explicitly asks to update the map

**Don't update for:** routine bug fixes, refactoring internals, temporary code, or anything that doesn't change the architecture.

**Prefer flows for processes.** When you encounter an important multi-step process (authentication, build pipelines, request handling, data sync, deployment), document it as a \`<Flow>\` rather than describing steps in prose. Flows become first-class graph nodes — searchable, visualized, and included in generated skill files when marked \`priority="essential"\`.

**How to check what's missing:**

\`\`\`bash
npx --no -- tskb ls --plain              # See what folders are mapped
npx --no -- tskb search "<area>" --plain # Check if something already exists
\`\`\`

## Key Rules

- **Structural maps, not implementation manuals.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Verify through types, not strings.** Prefer \`Module<{ type: typeof import("...") }>\` and \`Export<{ type: typeof import("...").Name }>\` over plain descriptions. Infer types from actual project imports — the compiler catches drift. Only use \`Term\` and \`File\` (string-only primitives) for things that genuinely have no importable type.
- **Import, don't hardcode.** If a type/class/value exists in the codebase, import it. Imports create physical binds the compiler validates.
- **Rebuild after editing.** Check the root \`package.json\` for the project's tskb build script and run it. The build throws if any path or reference doesn't resolve.

## File Structure

Docs live in \`${docsPath}/\` as \`.tskb.tsx\` files. Each has two parts:

**1. Registry block** — declares structural elements:

\`\`\`tsx
import type { Folder, Module, Export, File, External, Term } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "auth": Folder<{ desc: "Authentication and session management"; path: "src/auth" }>;
    }
    interface Modules {
      "auth.service": Module<{ desc: "Core auth logic"; type: typeof import("../src/auth/service.js") }>;
    }
    interface Exports {
      "auth.service.login": Export<{
        desc: "Authenticates user, returns session token";
        type: typeof import("../src/auth/service.js").login;
      }>;
    }
    interface Files {
      "auth.config": File<{ desc: "Auth provider config"; path: "src/auth/config.yml" }>;
    }
    interface Externals {
      "redis": External<{ desc: "Session cache and pub/sub"; url: "https://redis.io" }>;
    }
    interface Terms {
      "session-token": Term<"JWT issued on login, used to authenticate API requests">;
    }
  }
}
\`\`\`

**2. JSX content** — references nodes and explains relationships:

\`\`\`tsx
import { Doc, H1, P, ref } from "tskb";

const AuthFolder = ref as tskb.Folders["auth"];
const AuthService = ref as tskb.Modules["auth.service"];
const SessionToken = ref as tskb.Terms["session-token"];

export default (
  <Doc explains="Authentication: login flow, JWT tokens, session management" priority="essential">
    <H1>Authentication</H1>
    <P>{AuthService} lives in {AuthFolder} and issues {SessionToken} on login.</P>
  </Doc>
);
\`\`\`

## Registry Primitives

| Primitive | When to use |
|-----------|-------------|
| \`Folder<{ desc; path }>\` | A logical area of the codebase |
| \`Module<{ desc; type: typeof import("...") }>\` | A source file — import path validates it exists |
| \`Export<{ desc; type: typeof import("...").Name }>\` | A named export — compiler validates it exists |
| \`File<{ desc; path }>\` | Non-TS files: configs, READMEs, specs |
| \`External<{ desc; [key]: string }>\` | npm packages, APIs, services outside the repo |
| \`Term<"...">\` | Domain concepts not tied to a specific file |

**Import paths must resolve.** Use \`.js\` extensions with NodeNext module resolution.

## Referencing Nodes

Declare a constant with a type assertion, then use inline:

\`\`\`tsx
const MyModule = ref as tskb.Modules["my.module"];   // reference a module
const MyTerm   = ref as tskb.Terms["my-concept"];    // reference a term
// then in JSX:
<P>{MyModule} uses {MyTerm}.</P>
\`\`\`

The \`ref\` value is a placeholder — only the type matters. The compiler validates the key exists in the registry.

## JSX Components

- **\`<Doc explains="..." priority?>\`** — Root component. Every file exports one default Doc.
  - \`priority="essential"\` — shown in \`tskb ls\`. Use sparingly for orientation docs.
  - \`priority="constraint"\` — architectural rules. Must be followed. Shown in \`pick\` results.
  - \`priority="supplementary"\` (default) — additional context.
- **\`<P>\`**, **\`<H1>\`**, **\`<H2>\`**, **\`<H3>\`**, **\`<List>\`/\`<Li>\`** — Content structure.
- **\`<Snippet code={() => { ... }} />\`** — Type-checked code example. Real imports, not strings.
- **\`<Relation from={NodeA} to={NodeB} label?="..." />\`** — Explicit semantic relationship edge.
- **\`<Adr id="..." title="..." status="accepted|proposed|deprecated|superseded">\`** — Architecture Decision Record.
- **\`<Flow name="..." desc="..." priority?>\`** — Named, ordered sequence of steps through the system. Becomes a first-class graph node. Only \`<Step>\` children allowed.
  - \`priority="essential"\` — included in generated skill/instructions files and \`tskb flows\` output.
  - \`priority="supplementary"\` (default) — graph-only, queryable via \`tskb flows\`.
- **\`<Step node={NodeRef} label?="..." />\`** — A single participant in a Flow. References any registered node.

## Type-Checked Snippets

Snippets are **not string literals** — they are real TypeScript checked at build time:

\`\`\`tsx
import type { UserRepository } from "../src/db/user.repository.js";

<Snippet
  code={async () => {
    const repo = new UserRepository();
    const user = await repo.findByEmail("test@example.com");
    return user?.id;
  }}
/>
\`\`\`

If the API changes and \`findByEmail\` is removed, the build fails. That's the point.

Snippets are **never executed** — they are parsed, type-checked, and stringified at build time. To support all the types your snippets need, extend the docs \`tsconfig.json\` — add \`lib\` entries (e.g., \`"DOM"\`, \`"ES2022"\`), \`paths\` aliases, or \`types\` for ambient declarations. The docs tsconfig is independent from the project's build config, so you can tailor it for documentation without affecting production builds.

## Writing Style

**Do:**
- Write a few sentences per \`<Doc>\` — enough to orient someone unfamiliar with the area. Use \`<H2>\` sections to organize within a doc.
- Let node references (\`{AuthService}\`, \`{DataLayer}\`) carry meaning — they link to full details in the graph.
- Describe *what* exists, *where* it lives, *why* it matters.
- Use \`priority="constraint"\` for rules that must not be violated.

**Don't:**
- Narrate algorithms or control flow — that's what code is for.
- Duplicate what type signatures already say.
- Write implementation-level prose — focus on structural relationships and intent.

\`\`\`tsx
// GOOD — use <Flow> for multi-step processes
<Flow name="task-dispatch" desc="Task scheduling through queue and workers" priority="essential">
  <Step node={TaskQueue} />
  <Step node={WorkerPool} label="picks and executes" />
  <Step node={ResultCollector} label="reports back" />
</Flow>

// GOOD — use prose for static relationships
<Doc explains="Task scheduling: queue, workers, retry policy">
  <P>{TaskQueue} dispatches jobs to {WorkerPool}.</P>
</Doc>

// BAD — describing a process in prose instead of a Flow
<Doc explains="Task scheduling system">
  <P>The system works by accepting tasks into a prioritized queue. Workers pick
  tasks using round-robin, process them, and report results back to the coordinator...</P>
</Doc>
\`\`\`

## File Organization

- **Organize \`${docsPath}/\` by architectural boundaries, not 1:1 with the filesystem.** Create folders for packages, feature areas, and important layers — but don't replicate every directory. The goal is to map what matters structurally.
- **Keep each file focused on one area.** A file should only declare things directly related to its concern. Don't put the auth service module and the payment gateway external in the same file just because they're both "backend." If a file grows beyond ~15-20 registry declarations, split it.
- **Leverage the global registry.** All \`declare global { namespace tskb { ... } }\` declarations merge across files — that's distributed authorship. Declare a Term in \`vocabulary.tskb.tsx\`, declare a Module in \`auth/auth.tskb.tsx\`, and reference both from a third file. No single file needs to contain everything.
- **Typical layout:**
  - \`architecture.tskb.tsx\` — top-level overview: main Folders, high-level relationships (\`essential\`)
  - \`vocabulary.tskb.tsx\` — shared Terms and Externals used across multiple docs
  - \`auth/auth.tskb.tsx\` — Modules, Exports, and doc scoped to the auth area
  - \`data/data.tskb.tsx\` — data layer: repositories, database connections
  - \`adr/\` subfolder — Architecture Decision Records
  - \`constraints/\` — constraint docs with \`priority="constraint"\`
- **Import source files, not build output.** Always point \`typeof import()\` at the source (\`src/\`), never at \`dist/\`, \`build/\`, or compiled output. The compiler resolves source — built files may not exist at doc-build time and their types can differ.
- **Use \`.js\` extensions in import paths.** TypeScript's NodeNext module resolution requires \`.js\` even when the source file is \`.ts\`. Write \`typeof import("../src/auth/service.js")\`, not \`typeof import("../src/auth/service")\` or \`typeof import("../src/auth/service.ts")\`.

## After Editing

Always rebuild to validate references and update the graph:

\`\`\`bash
npm run docs
\`\`\`

The build fails if any import path, export name, or folder path doesn't resolve. Fix the error before committing.

## Troubleshooting

If the build fails with a TypeScript error, check:
- \`${docsPath}/tsconfig.json\` has \`"jsxImportSource": "tskb"\`
- \`baseUrl\` and \`rootDir\` point to the repo root (e.g., \`"../"\`)
- Import paths in \`.tskb.tsx\` files end with \`.js\` (NodeNext module resolution)

**Monorepo tips:**
- Place \`${docsPath}/\` at the workspace root
- Set \`baseUrl\` and \`rootDir\` to \`"../"\` from the docs folder (or adjust for your layout)
- Add \`paths\` entries for workspace packages if needed`;
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
      return `${lines}\n\n_Plus ${supplementaryCount} supplementary doc${supplementaryCount === 1 ? "" : "s"} available via \`npx --no -- tskb docs --plain\`._`;
    }
  }

  return lines;
}

/**
 * Build a markdown list of essential/constraint flows from the knowledge graph.
 */
function buildFlowsSummary(graph: KnowledgeGraph): string {
  const flows = Object.values(graph.nodes.flows).sort((a, b) => {
    const order: Record<string, number> = { essential: 0, constraint: 1, supplementary: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
  });

  if (flows.length === 0) return "";

  const important = flows.filter((f) => f.priority === "essential" || f.priority === "constraint");
  if (important.length === 0) return "";

  const lines = important
    .map((f) => {
      const steps = f.steps.map((s) => s.nodeId).join(" → ");
      return `- **${f.id}** [${f.priority}] — ${f.desc}\n  ${steps}`;
    })
    .join("\n");

  const supplementaryCount = flows.length - important.length;
  const suffix =
    supplementaryCount > 0
      ? `\n\n_Plus ${supplementaryCount} supplementary flow${supplementaryCount === 1 ? "" : "s"} available via \`npx --no -- tskb flows --plain\`._`
      : "";

  return `## Flows\n\n${lines}${suffix}`;
}

/**
 * Build a markdown list of externals from the knowledge graph.
 */
function buildExternalsSummary(graph: KnowledgeGraph): string {
  const externals = Object.values(graph.nodes.externals).sort((a, b) => a.id.localeCompare(b.id));

  if (externals.length === 0) return "";

  const lines = externals
    .map((e) => {
      const meta = Object.entries(e.metadata)
        .filter(([k]) => k !== "desc")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      const suffix = meta ? ` (${meta})` : "";
      return `- **${e.id}** — ${e.desc}${suffix}`;
    })
    .join("\n");

  return `## Externals\n\n${lines}`;
}
