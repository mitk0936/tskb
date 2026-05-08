import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Detect the npm script that rebuilds the tskb graph by walking up from `cwd`
 * looking for a `package.json` whose `scripts` invokes `tskb` against `.tskb.tsx`
 * sources. Falls back to a raw `npx --no -- tskb` invocation when nothing matches.
 *
 * Used to bake the correct rebuild command into generated skill / instructions
 * files instead of hardcoding a script name that may not exist in the consumer's
 * project.
 */
export function detectBuildScript(cwd: string = process.cwd()): string {
  const fallback = 'npx --no -- tskb "./docs/**/*.tskb.tsx"';
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;

  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
          scripts?: Record<string, string>;
        };
        const scripts = pkg.scripts ?? {};
        const entry = Object.entries(scripts).find(
          ([, cmd]) => /\btskb\b/.test(cmd) && /\.tskb\.tsx/.test(cmd)
        );
        if (entry) return `npm run ${entry[0]}`;
      } catch {
        // ignore malformed package.json and keep walking up
      }
    }
    if (dir === root) return fallback;
    const parent = path.dirname(dir);
    if (parent === dir) return fallback;
    dir = parent;
  }
}

/**
 * Build the CLI body for the `tskb` skill.
 *
 * Contains: when to use, commands, what's on the map, response shapes.
 * Repo-specific big-picture index (folder tree, boundaries, externals, flows,
 * constraint docs, essential docs) lives in `buildTocBody` — that skill is
 * always-loaded so this body doesn't need to repeat any of it.
 */
export function buildCliBody(
  _graph: KnowledgeGraph,
  _buildScript: string = detectBuildScript()
): string {
  return `## When to Use

tskb is the **high-level map** — bearings, directions, the rules that apply. Use it to orient; then read the code it points you at.

- **Know a node ID or path** — \`context\` gets the full picture in one call: children, modules, exports, all referencing docs and constraints. Pass a node ID or a repo path.
- **Don't know where to start** — \`search\` for keywords to find relevant node IDs, then use \`context\` or \`pick\`.
- **Check rules** — Constraint docs define rules you must follow. They show up in \`pick\` results automatically.
- **Skip it** — If you already know exactly which file to edit and the change is self-contained.

## Commands

\`\`\`bash
npx --no -- tskb search "<query>" --plain                    # Fuzzy search across the entire graph (incl. docs and flows)
npx --no -- tskb pick "<identifier>" --plain                  # Detailed info on any node (by ID or path)
npx --no -- tskb context "<identifier>" --depth=2 --plain     # Node + neighborhood + docs (BFS traversal)
npx --no -- tskb ls --depth=4 --plain                         # Folder hierarchy
npx --no -- tskb docs [<query>] --plain                       # List or search docs
npx --no -- tskb flows [<query>] --plain                      # List or search flows
npx --no -- tskb registry [<query>] [--type=<kind>] --plain   # Discover registered nodes (folders/modules/exports/files/externals/terms)
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

- **context** — the most efficient single call: returns a node's full neighborhood (children, modules, exports) plus all referencing docs, deduplicated and sorted by priority. Takes a node ID or repo path. Constraint doc IDs are surfaced at the top level.
- **search** — free-text keyword search across the entire graph (includes docs and flows). Returns ranked results. Use \`pick\` or \`context\` on any \`nodeId\` for details.
- **pick** — full detail for one node. Modules/exports show code stubs with line ranges (\`// :42-68\`). Modules show imports, importedBy, and exports list. Folders show children. Externals show metadata key-value pairs. Constraint docs in results **MUST** be read.
- **ls** — folder tree with essential docs.
- **docs** — list or search docs by priority.
- **flows** — list or search flows by priority. Use \`pick\` on a flow ID for steps.
- **registry** — list or fuzzy-search registered nodes (folders, modules, exports, files, externals, terms). Use this when authoring docs to discover what's already declared before adding something new — reuse a Term, link to a known External, find sibling Modules. Without args, returns counts and a sample of each kind.`;
}

/**
 * Build the table-of-contents body for the `tskb-toc` skill.
 *
 * Big-picture index loaded first whenever working in the repo: folder tree,
 * boundaries, constraint docs (load-bearing rules), externals, flows, and
 * essential docs. The CLI commands for drilling in live in `buildCliBody`.
 */
export function buildTocBody(
  graph: KnowledgeGraph,
  buildScript: string = detectBuildScript()
): string {
  const folderTree = buildFolderTree(graph, 2);
  const constraintDocs = buildConstraintDocsSummary(graph);
  const docSummaries = buildDocSummaries(graph, true);
  const boundariesSummary = buildBoundariesSummary(graph);
  const externalsSummary = buildExternalsSummary(graph);
  const flowsSummary = buildFlowsSummary(graph);

  return `> Regenerated by \`${buildScript}\`. Each entry below is a graph node — drill in with \`npx --no -- tskb pick <id>\` or \`tskb context <id> --depth=2\`.

## Folder Structure

${folderTree}

${boundariesSummary}

## Constraint Docs

${constraintDocs}

Constraint docs define architectural rules that **MUST** be followed when working on related code.

## Essential Docs

${docSummaries}

${externalsSummary}

${flowsSummary}`;
}

/**
 * Build the merged query body — used by Copilot instructions where there is no
 * on-demand skill loading and everything must live in one file.
 */
export function buildQueryBody(
  graph: KnowledgeGraph,
  buildScript: string = detectBuildScript()
): string {
  return `${buildCliBody(graph, buildScript)}

${buildTocBody(graph, buildScript)}`;
}

/**
 * Build the reference files for the tskb-update skill — deep dives on layout,
 * recovery, and setup that aren't needed for the common authoring path.
 */
export function buildUpdateReferences(graph: KnowledgeGraph): SkillReference[] {
  const docsFolder = Object.values(graph.nodes.folders).find((f) => f.id === "docs");
  const docsPath = docsFolder?.path ?? "docs";

  return [
    {
      filename: "folder-layout.md",
      hook: `top-level \`${docsPath}/\` files, naming registry keys, and when to split a file. Load when creating a new area or splitting up a doc.`,
      body: `# Folder layout & naming

## Top-level files in \`${docsPath}/\`

- \`architecture.tskb.tsx\` — overview of the whole repo: main areas and how they fit.
- \`vocabulary.tskb.tsx\` — only for \`Terms\` and \`Externals\` shared across many areas (e.g., a domain concept used by both client and server). Area-specific Terms belong in that area's \`main.tskb.tsx\`.
- \`adr/\` — Architecture Decision Records, one file per decision.
- \`constraints/\` — docs with \`priority="constraint"\`, one rule per file.

## Naming registry keys

Keys should hint at where the thing lives, but stay short. The goal: a reader sees the key and knows what it refers to.

Both styles are fine — pick what reads better:
- Dot-separated lowercase: \`auth.service.login\`
- PascalCase: \`AuthService\`, \`LoginEndpoint\`

Keep keys meaningful, not exhaustive:

\`\`\`
GOOD: ServerUtils
BAD:  MicroservicesServerUtils    // too much path baked in
\`\`\`

Class methods follow the parent: \`pkg.MyClass.mount\`.

**Keys are global.** The same key can't appear twice across all files.

## When to split a file

Split when:
- The registry block has more than ~15–20 declarations.
- The file mixes unrelated areas (e.g., auth and payments).
- One \`<Doc>\` is growing into a wall of prose — turn it into several smaller question-shaped docs, possibly in separate files.
`,
    },
    {
      filename: "removing-areas.md",
      hook: "recovery procedure when deleting or moving a Folder, Module, or Export breaks references. Load when the build fails after a deletion or rename.",
      body: `# Removing or moving an area

Deleting a Folder, Module, or Export breaks every \`<Doc>\`, \`<Flow>\`, or \`<Relation>\` that references it — the build fails on the missing key.

Recovery:

1. \`npx --no -- tskb search "<oldKey>" --plain\` and \`tskb context "<oldKey>" --plain\` — find every dependent.
2. Update or delete the referencing docs **as part of the same change**. Don't leave stale references; don't comment out — delete.
3. Rebuild to confirm the graph still resolves.
`,
    },
    {
      filename: "setup.md",
      hook: "tsconfig requirements, monorepo tips, common build errors. Load when tskb is being set up in a new repo or the build is failing on config.",
      body: `# tskb setup & troubleshooting

If the build fails with a TypeScript error, check:
- \`${docsPath}/tsconfig.json\` has \`"jsxImportSource": "tskb"\`
- \`baseUrl\` and \`rootDir\` point to the repo root (e.g., \`"../"\`)
- Import paths in \`.tskb.tsx\` files end with \`.js\` (NodeNext module resolution)

## Monorepo tips

- Place \`${docsPath}/\` at the workspace root.
- Set \`baseUrl\` and \`rootDir\` to \`"../"\` from the docs folder (or adjust for your layout).
- Add \`paths\` entries for workspace packages if needed.
`,
    },
  ];
}

/**
 * Build the update/authoring body used by the tskb-update skill and update instructions.
 *
 * The lean core: when to update, the 5-step workflow, key rules, and the
 * essentials of where docs live. Deep dives on naming, recovery from deletes,
 * and tsconfig setup live in references/ emitted by buildUpdateReferences().
 */
export function buildUpdateBody(
  graph: KnowledgeGraph,
  buildScript: string = detectBuildScript()
): string {
  const refs = buildUpdateReferences(graph);
  const referencesList = refs.map((r) => `- \`references/${r.filename}\` — ${r.hook}`).join("\n");

  return `## When to Update

Update the docs when:
- A new feature area is being built — declare it before or alongside the code.
- You spot a folder, module, or export that matters but isn't in the graph.
- An architectural decision needs to be recorded (use \`<Adr>\`).
- A rule must be followed for the system to keep working (use \`priority="constraint"\`).
- A multi-step process spans several modules — capture it as a \`<Flow>\`, not prose.
- The dev asks for it.

Don't update for fixes that don't change structure (renames inside a function, off-by-one fixes, log tweaks), purely internal refactors, or temporary code. **Do** update if a fix reveals a missing constraint or surfaces an undocumented invariant — that's not "routine".

## Documentation Workflow

When asked to document something, follow these steps. Don't skip ahead to writing.

### 1. Look first

See what's already there:

\`\`\`bash
npx --no -- tskb context "<nodeId|path>" --plain   # docs and modules in this area
npx --no -- tskb ls --plain                        # which folders are mapped
npx --no -- tskb search "<keywords>" --plain       # is this already written?
\`\`\`

If a doc already covers the topic, update it. Don't write a second one.

### 2. Discover what's already declared

Before declaring new Terms, Externals, or Modules, see what already exists — reuse beats redeclare:

\`\`\`bash
npx --no -- tskb registry --plain                          # overview: counts + samples per kind
npx --no -- tskb registry "<concept>" --plain              # fuzzy across all registry kinds
npx --no -- tskb registry --type=term --plain              # all Terms (the area vocabularies)
npx --no -- tskb registry --type=external --plain          # all Externals (npm packages, services)
\`\`\`

If a Term already names the concept you were about to introduce, reference it (\`{ExistingTerm}\`) instead of declaring a new one. Same for Externals — one declaration per external dependency, shared across all docs that touch it.

### 3. Find the questions

A good doc answers ONE question about the system. Your job is to find the right questions.

**Try the dev first.** Ask:
- What's hard about this area for someone new?
- What rules must always hold?
- What would surprise someone reading the code?
- What bug would happen if someone got this wrong?

**If the dev doesn't know yet** (often true — the area may be new to them too):
- Read the code yourself.
- Look for tricky logic, error handling, "why" comments, recent bug fixes.
- Write down the questions the code answers.
- Bring the list back to the dev: "Here are the questions I think this area answers. Which are real? Which are wrong? What did I miss?"
- **Pause here** unless the dev has explicitly told you to just write it.

If a question survives the conversation but its answer is ambiguous, ask before writing. Missing docs are better than wrong docs.

### 4. Frame each doc as a question

Every \`<Doc explains="...">\` answers one question. Write the question in plain language and end it with a question mark.

\`\`\`tsx
// GOOD — one specific question
<Doc explains="How does login issue JWTs?">
<Doc explains="Why does the worker pool re-queue on partial failure?">
<Doc explains="What ordering does the dispatch queue guarantee?" priority="constraint">

// BAD — topic, not a question
<Doc explains="Authentication">

// BAD — feature list, not a question
<Doc explains="CLI logging: stderr-only output, --verbose flag">

// BAD — two questions in one
<Doc explains="How does login work and how do sessions expire?">
// → split into two docs
\`\`\`

This rule applies to **new docs**. Older statement-form docs are fine where they are — only update them if you're already touching the file for another reason.

### 5. Place it & write

Declare any new modules, exports, and Terms in the **closest** area's \`main.tskb.tsx\` — the one that owns the related code. The registry merges across files so any placement compiles, but locality keeps each area's entry point honest. See "Where things go" below for the rule. Small or specialized docs can live in their own file alongside \`main.tskb.tsx\`.

- A few sentences plus references is usually enough.
- Use \`{NodeRef}\` to link to other things instead of restating them.
- For multi-step processes, use \`<Flow>\` instead of prose.
- For code examples, use \`<Snippet>\` — they're type-checked.

For full syntax (registry primitives, JSX components, snippets), load the **\`tskb-update-syntax\`** skill.

### 6. Rebuild

Run \`${buildScript}\`. The build fails if any import path, export name, or folder path doesn't resolve. Fix errors before committing.

## Key Rules

- **Map the structure, don't explain the code.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Use types, not strings.** Prefer \`Module<{ type: typeof import("...") }>\` and \`Export<{ type: typeof import("...").Name }>\` over plain descriptions. The compiler catches drift. Only use \`Term\` and \`File\` (string-only primitives) for things that have no importable type.
- **Import, don't hardcode.** If a type or class exists in the codebase, import it. Imports are validated by the compiler.
- **Rebuild after editing.** The build throws if any path or reference doesn't resolve.
- **Write in plain English.** Docs are read by people from many backgrounds, including non-native English speakers. Use short sentences, common words, and skip jargon. If a fancy word and a plain word mean the same thing, use the plain one. Examples: "uses" not "leverages", "starts" not "initiates", "make" not "facilitate", "call" not "invoke", "needs" not "requires".
- **Primitive \`name\` and \`desc\` are durable.** A registry key (the \`name\`) and its \`desc\` say what the thing is and why it matters — no implementation details that change as the code evolves. Skip algorithm names ("uses Fuse.js"), internal mechanics ("renders as ellipses"), tool calls ("via execSync"), and step-by-step lists. If the implementation is rewritten next month, the \`desc\` should still be true. Implementation details belong inside \`<Doc>\` prose, not in registry metadata. Examples: "Searches the graph and returns ranked matches" beats "Fuzzy searches the graph using Fuse.js across IDs, descriptions, and paths"; "DOT generator for the graph" beats "DOT file generator - renders folders as nested subgraphs, modules as ellipses, terms as diamonds".

## Where things go

**Locality: register a node next to its closest neighbors.** A Module belongs in the area that owns its source file. An Export goes wherever its Module is declared. A Term lives in the area whose Docs use it (only promote to \`vocabulary.tskb.tsx\` when multiple distant areas share it). The compiler accepts any placement because the registry merges across files — but a node declared far from its kin makes its area's entry point misleading and forces the next reader to chase declarations across the repo.

Every important area has a \`main.tskb.tsx\` — that's the area's entry point and registry root. An "area" is a repo, a package in a monorepo, a subsystem inside a package, or a major sub-area inside a subsystem. Don't mirror every nested folder; only create a \`main.tskb.tsx\` for areas a new dev would need to understand on their own.

The \`main.tskb.tsx\` file holds:
1. The area's main registry — folders, modules, exports, **and Terms** for the things that matter.
2. Reference aliases (\`const X = ref as tskb.Modules["..."]\`).
3. A short \`<Doc>\` that gives a quick overview of the area.

You can put other \`.tskb.tsx\` files alongside \`main.tskb.tsx\` for specific docs — one question per file is fine. **Registry declarations across all \`.tskb.tsx\` files merge into one global registry**, so a sibling file can reference anything declared anywhere else.

For naming registry keys, when to split a file, and the top-level layout under \`docs/\`, load \`references/folder-layout.md\`.

## References (load only when needed)

${referencesList}
`;
}

/**
 * Reference file emitted alongside a skill's SKILL.md.
 *
 * Each entry: filename inside the skill's `references/` directory, the body,
 * and a short hook used to advertise the file in the SKILL.md footer.
 */
export interface SkillReference {
  filename: string;
  hook: string;
  body: string;
}

/**
 * Build the reference files for the tskb-update-syntax skill — heavy or rare
 * authoring topics moved out of the main SKILL.md so it stays small.
 */
export function buildUpdateSyntaxReferences(): SkillReference[] {
  return [
    {
      filename: "boundaries.md",
      hook: "full table of `boundary` values + when to use each. Load when adding `boundary` to a top-level folder.",
      body: `# Boundary prop reference

\`boundary\` marks a folder as the root of a distinct runtime or deployment unit — a process, app, or package that runs or deploys on its own. Add it only to the **top-level folder** that IS that boundary; never repeat it on sub-folders inside.

Prefer one of these values. Add a new value only if your runtime genuinely doesn't fit:

| Value | When to use |
|-------|-------------|
| \`"[NAME] repository"\` | A distinct git repo |
| \`"[NAME] package"\` | An npm package root with its own \`package.json\`, published or consumed as a library |
| \`"[NAME] SPA"\` | A browser single-page application (Vite, CRA, Next.js client bundle) |
| \`"[NAME] client"\` | Frontend app in a project that also has a server. Pair with \`"server"\`. |
| \`"[NAME] server"\` | Node.js (or similar) backend process. Pair with \`"client"\` when both exist. |
| \`"[NAME] CLI"\` | A command-line binary published or invoked as its own process |
| \`"[NAME] worker"\` | Background or queue worker — long-running process, distinct from request handlers |
| \`"[NAME] function"\` | Serverless function / Lambda / Cloud Function — each deployable unit is its own boundary |
| \`"[NAME] mobile app"\` | iOS or Android app target |
| \`"[NAME] extension"\` | Browser or IDE extension package with its own runtime host |
| \`"[NAME] daemon"\` | OS-level daemon or background service |
| \`"[TYPE] tests"\` | Test suite root — the test runner is a distinct process from production code |

**Don't** add boundary to architectural layers (core, cli, utils, shared types), sub-folders already inside a bounded area, or organizational groupings with no independent runtime. If in doubt, leave it off.
`,
    },
    {
      filename: "class-methods.md",
      hook: "declare one Export per method (public or private) using `InstanceType<...>`. Load when documenting a class with notable methods.",
      body: `# Documenting class methods

For classes with important methods (public or private), declare one \`Export\` per method using a local type alias and \`InstanceType\`:

\`\`\`tsx
// 1. Hoist the class constructor type once at the top of the file
type MyClass = typeof import("src/my-class.js").MyClass;

// 2. One Export per method — works for private methods too
interface Exports {
  "pkg.MyClass": Export<{
    desc: "Top-level controller. Call mount() once on startup.";
    type: MyClass;
  }>;

  "pkg.MyClass.mount": Export<{
    desc: "Public entry point. Wires dependencies and loads initial data.";
    type: InstanceType<MyClass>["mount"];
  }>;

  "pkg.MyClass.render": Export<{
    desc: "Re-runs the full D3 enter/update/exit cycle.";
    type: InstanceType<MyClass>["render"]; // works even if render is private
  }>;
}
\`\`\`

\`InstanceType<MyClass>["methodName"]\` resolves to the actual method signature. The compiler validates the name exists and catches renames. Works for **both public and private** TypeScript members.
`,
    },
    {
      filename: "snippets-advanced.md",
      hook: "wrapping JSON, shell commands, SQL or other non-JS content inside a snippet body, plus tsconfig tweaks. Load when a basic snippet won't fit.",
      body: `# Snippets — non-JS content and tsconfig tweaks

The snippet body must be valid JavaScript or TypeScript. When the content you want to show isn't JS — JSON, a shell command, a SQL query, a config blob — wrap it in a JS expression so the body stays valid and the imports keep getting type-checked.

## JSON output — use \`JSON.stringify\`

\`\`\`tsx
import { buildConfig } from "../src/config.js";

<Snippet
  code={() => {
    const config = buildConfig({ env: "prod" });
    return JSON.stringify(config, null, 2);
  }}
/>
\`\`\`

## Shell command — use \`execSync\`

The call is type-checked; the command isn't run at doc-build time.

\`\`\`tsx
import { execSync } from "node:child_process";

<Snippet
  code={() => execSync("npx --no -- tskb search 'auth' --plain")}
/>
\`\`\`

## SQL or other strings — tagged template or plain string

\`\`\`tsx
<Snippet
  code={() => \`
    SELECT id, email FROM users WHERE active = true;
  \`}
/>
\`\`\`

The point of the wrapper is the same: the body stays valid JS, and TypeScript still validates any imports or function calls inside it.

## tsconfig tweaks for snippets

To support the types your snippets need, extend the docs \`tsconfig.json\`:
- Add \`lib\` entries (\`"DOM"\`, \`"ES2022"\`) for browser or modern-runtime APIs.
- Add \`paths\` aliases if your project uses them.
- Add \`types\` for ambient declarations.

The docs \`tsconfig.json\` is independent from the project's build config — tailor it for documentation without affecting production builds.
`,
    },
    {
      filename: "relations.md",
      hook: "what to put in a `<Relation>` label, when an edge is worth declaring, and which direction to pick. Load when adding a `<Relation>`.",
      body: `# Relations — when, what, and which direction

A \`<Relation from={A} to={B} label="..." />\` is a single semantic edge between two registered nodes. Use it for one-line "X relates to Y" facts. For anything with order or multiple participants, use a \`<Flow>\` instead.

## What Relations are for

**Pointing out non-obvious links between parts of the codebase** — connections a reader wouldn't see by following the folder tree, the imports, or the module morphology. Two distant modules that share a hidden coupling. A module that depends on an external boundary the import graph doesn't make obvious. A folder that owns a domain term defined elsewhere. If the link is already visible from the structural edges (\`belongs-to\`, \`contains\`) or the import graph, you don't need a Relation.

## What labels should say

Describe the **functional or architectural relationship** — the role one part plays for the other. Not how it's wired in code.

- **Good:** "owns user identity", "is the source of truth for tasks", "wraps the compiler API", "depends on for auth", "renders into".
- **Bad:** "calls login()", "imports \`validateToken\`", "instantiates new AuthService()". These are implementation details — the imports edge and morphology already capture them, and they break the moment a method is renamed.

If the only thing you can say about the edge is the name of a function call, you don't need a Relation.

## Direction matters

Read the label as a verb phrase from \`from\` to \`to\`. Pick \`from\`/\`to\` so the sentence scans naturally: \`<Relation from={AuthService} to={Postgres} label="persists sessions to" />\` reads "AuthService persists sessions to Postgres".
`,
    },
  ];
}

/**
 * Build the syntax-reference body for the \`tskb-update-syntax\` skill.
 *
 * The lean core: file anatomy, registry primitives, referencing nodes, JSX
 * components, basic snippets, and Flows. Heavy or rare topics (boundary table,
 * class methods, snippet wrappers, relations detail) live in references/
 * emitted by buildUpdateSyntaxReferences().
 */
export function buildUpdateSyntaxBody(_graph: KnowledgeGraph): string {
  const refs = buildUpdateSyntaxReferences();
  const referencesList = refs.map((r) => `- \`references/${r.filename}\` — ${r.hook}`).join("\n");

  return `## File Anatomy

A \`.tskb.tsx\` file has two parts.

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

**2. JSX content** — the default-exported \`<Doc>\` plus its references:

\`\`\`tsx
import { Doc, H1, P, ref } from "tskb";

const AuthFolder = ref as tskb.Folders["auth"];
const AuthService = ref as tskb.Modules["auth.service"];
const SessionToken = ref as tskb.Terms["session-token"];

export default (
  <Doc explains="How does login issue and validate JWTs?" priority="essential">
    <H1>Login</H1>
    <P>{AuthService} lives in {AuthFolder} and issues {SessionToken} on login.</P>
  </Doc>
);
\`\`\`

## Registry Primitives

| Primitive | When to use |
|-----------|-------------|
| \`Folder<{ desc; path; boundary? }>\` | A logical area of the codebase. Add \`boundary\` only on the top-level folder of a distinct runtime — see \`references/boundaries.md\`. |
| \`Module<{ desc; type: typeof import("...") }>\` | A source file — import path validates it exists. |
| \`Export<{ desc; type: typeof import("...").Name }>\` | A named export — compiler validates it exists. For class methods, see \`references/class-methods.md\`. |
| \`File<{ desc; path }>\` | Non-TS/JS files: configs, READMEs, specs. |
| \`External<{ desc; [key]: string }>\` | npm packages, APIs, services outside the repo. |
| \`Term<"...">\` | A name from the area's vocabulary (e.g., \`SessionToken\`, \`DispatchQueue\`). Declared in the area's \`main.tskb.tsx\` and used across that area's docs. |

**Import paths must resolve.** Use \`.js\` extensions with NodeNext module resolution.

**Import source files, not build output.** Always point \`typeof import()\` at \`src/\`, never at \`dist/\` or \`build/\`. The compiler resolves source — built files may not exist at doc-build time and their types can differ.

> The "keep \`name\` and \`desc\` durable" rule (with examples) lives in the **\`tskb-update\`** skill's Key Rules. Implementation details belong in \`<Doc>\` prose, not registry metadata.

## Referencing Nodes

Declare a constant with a type assertion, then use it inline:

\`\`\`tsx
const MyModule = ref as tskb.Modules["my.module"];   // reference a module
const MyTerm   = ref as tskb.Terms["my-concept"];    // reference a term
// then in JSX:
<P>{MyModule} uses {MyTerm}.</P>
\`\`\`

The \`ref\` value is a placeholder — only the type matters. The compiler validates that the key exists in the registry.

## JSX Components

- **\`<Doc explains="..." priority?>\`** — Root component. Every file exports one default Doc. The \`explains\` string must be a real question.
  - \`priority="essential"\` — shown in \`tskb ls\`. Use sparingly for orientation docs.
  - \`priority="constraint"\` — architectural rules. Must be followed. Shown in \`pick\` results.
  - \`priority="supplementary"\` (default) — additional context.
- **\`<P>\`**, **\`<H1>\`**, **\`<H2>\`**, **\`<H3>\`**, **\`<List>\`/\`<Li>\`** — Content structure.
- **\`<Snippet code={() => { ... }} />\`** — Type-checked code example. See Snippets below.
- **\`<Relation from={NodeA} to={NodeB} label?="..." />\`** — Explicit semantic edge between two nodes. See \`references/relations.md\` for label and direction guidance.
- **\`<Adr id="..." title="..." status="accepted|proposed|deprecated|superseded">\`** — Architecture Decision Record.
- **\`<Flow name="..." desc="..." priority?>\`** — Named, ordered sequence of steps through the system. Becomes a first-class graph node. Only \`<Step>\` children allowed. See Flows below.
- **\`<Step node={NodeRef} label?="..." />\`** — A single participant in a Flow. References any registered node.

## Snippets

The \`code\` prop is a real arrow function — TypeScript reads it at build time, so renames break the build. The body must be valid JS/TS (no raw JSON, shell, or SQL strings). Snippets are never executed.

\`\`\`tsx
import { UserRepository } from "../src/db/user.repository.js";

<Snippet
  code={async () => {
    const repo = new UserRepository();
    const user = await repo.findByEmail("test@example.com");
    return user?.id;
  }}
/>
\`\`\`

If \`findByEmail\` is renamed, the build fails — the doc can't drift. For wrapping JSON, shell commands, or SQL inside a snippet, see \`references/snippets-advanced.md\`.

## Flows

A \`<Flow>\` describes a multi-step process — how several parts work together to do one thing. Reach for it when a \`<Relation>\` is too thin (more than two participants, or order matters) and prose would hide the structure.

**Core rules:**
- **Lean on registered nodes** — steps reference real anchors (modules, exports, externals, terms, folders). Never raw strings.
- **The first \`<Step>\` is the orchestrator** — the CLI command, HTTP route, test file, or cron handler that kicks the flow off. Use \`desc\` for the real-world context ("user submits login form").
- **Cover the whole path** — every meaningful node a request touches.
- **Don't branch** — a flow is one path. Two branches that both matter → two flows.
- **Avoid drift-prone details** — no hardcoded paths, filenames, default values, or CLI flag spellings in labels or \`desc\`. None of that is validated. Stick to roles ("reads the graph file from disk"); let the registered nodes carry the implementation.
- **Naming** — kebab-case, area-prefixed (\`auth-login\`, \`task-dispatch\`). The prefix groups related flows in \`tskb flows\` output.
- **\`priority="essential"\`** — reserve for flows the system can't run without; essential flows get bundled into generated skills.

\`\`\`tsx
<Flow
  name="auth-login"
  desc="User submits login form; API route validates credentials and issues a JWT"
  priority="essential"
>
  <Step node={ApiRoutes} label="receives login request" />
  <Step node={AuthServiceExport} label="validates credentials" />
  <Step node={Postgres} label="queries user record" />
  <Step node={AuthServiceExport} label="signs and returns JWT" />
</Flow>
\`\`\`

## References (load only when needed)

${referencesList}
`;
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
 * Build a markdown list of constraint-priority docs from the knowledge graph.
 *
 * Constraint docs are load-bearing — they declare architectural rules that
 * must be followed. They live in the always-loaded `tskb` skill rather than
 * the on-demand `tskb-toc` so an agent never misses them.
 */
function buildConstraintDocsSummary(graph: KnowledgeGraph): string {
  const docs = Object.values(graph.nodes.docs)
    .filter((d) => d.priority === "constraint")
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  if (docs.length === 0) {
    return '_No constraint docs declared. Add `priority="constraint"` to architectural-rule `<Doc>` tags._';
  }

  return docs
    .map((d) => `- \`${d.filePath}\` — ${d.explains || "_no explains provided_"}`)
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
function buildBoundariesSummary(graph: KnowledgeGraph): string {
  const bounded = Object.values(graph.nodes.folders)
    .filter((f) => f.boundary)
    .sort(
      (a, b) => a.boundary!.localeCompare(b.boundary!) || (a.path ?? "").localeCompare(b.path ?? "")
    );

  if (bounded.length === 0) return "";

  const lines = bounded.map((f) => `- **${f.boundary}** — \`${f.path}\` — ${f.desc}`).join("\n");

  return `## Boundaries\n\n${lines}`;
}

function buildExternalsSummary(graph: KnowledgeGraph): string {
  const externals = Object.values(graph.nodes.externals).sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { sensitivity: "base" })
  );

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
