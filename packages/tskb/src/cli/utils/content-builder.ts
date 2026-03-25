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

${externalsSummary}

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
- The developer explicitly asks to update the map

**Don't update for:** routine bug fixes, refactoring internals, temporary code, or anything that doesn't change the architecture.

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
// GOOD
<Doc explains="Task scheduling: queue, workers, retry policy">
  <P>{TaskQueue} dispatches jobs to {WorkerPool}.</P>
</Doc>

// BAD
<Doc explains="Task scheduling system">
  <P>The system works by accepting tasks into a prioritized queue. Workers pick
  tasks using round-robin, process them, and report results back to the coordinator...</P>
</Doc>
\`\`\`

## File Organization

- **Keep files focused.** One \`.tskb.tsx\` file per feature area or architectural concern. If a file grows beyond ~15-20 registry declarations, split it.
- **Mirror the project filesystem** in \`${docsPath}/\` for top-level structure.
- **Split the registry across files.** Don't put all Folders, Modules, and Terms in one giant file:
  - \`architecture.tskb.tsx\` — top-level overview: main Folders, high-level relationships (\`essential\`)
  - \`externals.tskb.tsx\` — all External declarations (databases, APIs, npm packages) in one place
  - \`vocabulary.tskb.tsx\` — shared Terms used across multiple docs
  - \`auth/auth.tskb.tsx\` — Modules, Exports, and doc for the auth area
- ADRs belong in their own files under an \`adr/\` subfolder.
- Constraints belong in \`constraints/\` with \`priority="constraint"\`.

## After Editing

Always rebuild to validate references and update the graph:

\`\`\`bash
npm run docs
\`\`\`

The build fails if any import path, export name, or folder path doesn't resolve. Fix the error before committing.`;
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

/**
 * Build the bootstrap body used by the tskb-bootstrap skill and instructions.
 *
 * Covers: initial setup, questions to ask the user, the init command, and first steps.
 */
export function buildBootstrapBody(_graph: KnowledgeGraph): string {
  return `## Purpose

Guide a developer through adding tskb to their repo for the first time — from install to first successful build.

## Step 1 — Ask orientation questions

Before doing anything, ask the user:

1. **Do you already have a \`docs/\` folder or preferred docs location?** (default: \`docs/\`)
2. **Are you in a monorepo?** If yes, should the docs folder live at the workspace root?
3. **Which AI assistant integrations do you want?**
   - Claude Code (\`.claude/skills/\`)
   - GitHub Copilot (\`.github/instructions/\`)
   - Both, or neither

Then run the interactive scaffolder:

\`\`\`bash
npx tskb init
\`\`\`

This will prompt for the same answers and scaffold everything in one step.

## Step 2 — What init creates

After running \`tskb init\`, check that the following exist:

\`\`\`
your-repo/
├── docs/
│   ├── tsconfig.json          # TypeScript config for docs (jsxImportSource: "tskb")
│   └── architecture.tskb.tsx  # Starter doc — edit this first
├── package.json               # "docs" script added automatically
├── .claude/skills/            # Created if Claude Code was selected
└── .github/                   # Created if Copilot was selected
\`\`\`

## Step 3 — Build the knowledge graph

\`\`\`bash
npm run docs
\`\`\`

This compiles all \`.tskb.tsx\` files, validates references, and writes:

- \`.tskb/graph.json\` — queryable knowledge graph
- \`.tskb/graph.dot\` — Graphviz visualization
- \`.claude/skills/tskb/SKILL.md\` — Claude Code skill (if \`.claude/skills/\` exists)
- \`.github/instructions/tskb.instructions.md\` — Copilot instructions (if \`.github/\` exists)

## Step 4 — Verify setup

\`\`\`bash
npx tskb ls --plain       # Should show your folder structure
npx tskb docs --plain     # Should list your starter doc
\`\`\`

If the build fails with a TypeScript error, check:
- \`docs/tsconfig.json\` has \`"jsxImportSource": "tskb"\`
- \`baseUrl\` and \`rootDir\` point to the repo root (e.g., \`"../"\`)
- Import paths in \`.tskb.tsx\` files end with \`.js\` (NodeNext module resolution)

## Common tsconfig for docs

\`\`\`json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "tskb",
    "baseUrl": "../",
    "rootDir": "../"
  },
  "include": ["**/*.tskb.tsx"]
}
\`\`\`

## Monorepo notes

- Place \`docs/\` at the workspace root
- Set \`baseUrl\` and \`rootDir\` to \`"../"\` from the docs folder (or adjust for your layout)
- Add \`paths\` entries for workspace packages if needed
- Run the build from the workspace root where \`package.json\` lives

## Next step — Start building the architecture map

Once the first build succeeds, begin iteratively documenting the codebase. Use the **tskb-update** skill for syntax, best practices, and when to trigger updates during a session.

### Recommended workflow

1. **Explore the project structure.** Look at top-level folders in \`src/\` (or equivalent). Identify the major areas: features, layers, shared utilities, configs.

2. **Mirror the project filesystem in \`docs/\`.** Create \`.tskb.tsx\` files that reflect the top-level structure:
   \`\`\`
   docs/
   ├── architecture.tskb.tsx     # Top-level overview (essential)
   ├── vocabulary.tskb.tsx        # Shared terms and externals
   ├── auth/
   │   └── auth.tskb.tsx          # Auth feature area
   ├── api/
   │   └── api.tskb.tsx           # API layer
   └── data/
       └── data.tskb.tsx          # Data layer
   \`\`\`

3. **Start top-down.** Declare top-level Folders first, then key Modules and Exports. Add Terms for domain concepts and Externals for dependencies (databases, APIs, npm packages).

4. **Ask the developer questions.** Don't guess — ask about:
   - What are the main feature areas?
   - Are there architectural layers (API → Service → Data)?
   - What external services or databases does the project depend on?
   - Are there naming conventions or patterns (repository pattern, service pattern)?
   - What constraints should be documented?

5. **Build incrementally.** After each round of additions, run \`npm run docs\` to validate. Fix any broken references before adding more.

6. **Use all registry primitives.** A well-documented project uses Folders (areas), Modules (key files), Exports (important APIs), Terms (domain vocabulary), Externals (dependencies), and Files (configs, specs).

7. **Set priorities deliberately.** Mark the top-level overview as \`essential\`. Add \`constraint\` docs for rules that must not be violated. Leave everything else as \`supplementary\`.
`;
}
