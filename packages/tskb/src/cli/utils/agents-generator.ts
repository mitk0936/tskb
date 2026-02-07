import fs from "node:fs";
import { getHelpText } from "./help.js";
import { REPO_ROOT_FOLDER_NAME } from "../../core/constants.js";

/**
 * Get the AGENTS.md template with dynamic values
 */
function getAgentsTemplate(cliUsage: string): string {
  return `# AGENTS.md

## What this is

This repository uses **TSKB** — a structure-first map of the codebase.

TSKB helps you understand:

- what exists
- how parts relate
- why certain areas exist

It is a **navigator**, not a full description of the code.

---

## How to use it

Start with TSKB before reading code.

Use it to:

- orient yourself
- narrow the scope
- decide where to look next

If something is not documented, it does **not** mean it is unimportant.

TSKB reduces exploration cost, not thinking.

---

## CLI

\`\`\`bash
${cliUsage}
\`\`\`

---

## Typical workflow

### 1. Start with \`ls\` to see the structure

\`\`\`bash
npx tskb ls --depth 2
\`\`\`

This shows you all folders up to depth 2, ordered by depth (root → top-level → children).

**What to look for:**
- High-level organization (packages, apps, services)
- Naming patterns that hint at purpose
- Folder descriptions that explain intent

### 2. Use \`describe\` to understand a specific area

\`\`\`bash
npx tskb describe "TSKB.Package.Root"
\`\`\`

This shows:
- **context**: The folder itself (id, type, desc, path)
- **parent**: What contains this folder
- **contents**: Child folders within this folder
- **modules**: Files/modules that belong to this folder
- **exports**: Public exports from this folder
- **referencedInDocs**: Which .tskb.tsx docs reference this folder

**What to look for:**
- Parent/child relationships to understand hierarchy
- Modules to find actual implementation files
- Docs that explain architectural decisions

### 3. Use \`select\` to find specific items

\`\`\`bash
npx tskb select "authentication" "${REPO_ROOT_FOLDER_NAME}"
\`\`\`

This searches within a scope (folder) for the best match.

**Returns:**
- **match**: The best matching node (with confidence score)
- **parent**: What contains this node
- **children**: What this node contains
- **docs**: Documentation that references this node
- **files**: Relevant file paths
- **suggestions**: Alternative matches if confidence is low

**Scoping:**
- Start with \`${REPO_ROOT_FOLDER_NAME}\` to search the entire repo
- Narrow to a specific folder ID (e.g., "tskb.cli") to search within that area
- Use \`--verbose\` for more detailed output

---

## Understanding the output

### Node types

- **folder**: Architectural context (like "CLI", "Core", "Runtime")
- **module**: A file (e.g., "cli.index" → packages/tskb/src/cli/index.ts)
- **export**: A public symbol (class, function, type) from a module
- **term**: A vocabulary term (like "repository-pattern", "jwt")
- **doc**: A .tskb.tsx documentation file

### Edge types

- **contains**: Folder A contains Folder B (hierarchical structure)
- **belongs-to**: Module/Export belongs to a Folder (ownership)
- **references**: Doc references a Folder/Module/Export/Term (semantic relation)

### Confidence scores

When using \`select\`:
- **1.0**: Exact match (ID or path matches exactly)
- **0.85**: Prefix match (ID starts with search term)
- **0.7-0.8**: Phrase match in path or description
- **< 0.7**: Partial match (check suggestions for alternatives)

---

## Extending TSKB docs

TSKB documentation (.tskb.tsx files) should be extended by **both humans and AI assistants**.

### When to extend docs

Extend documentation when:

1. **Structural changes**: New packages, folders, or modules are added
2. **Architectural decisions**: New patterns, constraints, or design choices
3. **Breaking changes**: Code changes broke the tskb build (type errors in docs)
4. **Important additions**: New core functionality that affects system understanding
5. **Clarification needed**: Existing docs are unclear or outdated

### When NOT to extend docs

Don't extend for:

- Minor implementation details (small bug fixes, refactoring)
- Temporary code or experiments
- Changes that are self-explanatory from the code
- Private/internal implementation details

### How to extend docs

When creating or updating .tskb.tsx files:

1. **Describe intent and structure** (not implementation details)
2. **Explain why things exist** (architectural rationale)
3. **Reference code, don't restate it** (use imports and types)
4. **Use type-checked snippets** (via \`<Snippet code={...} />\`)
5. **Define vocabulary** (use the global tskb namespace)

**Example scenario:**

If you add a new folder \`packages/tskb/templates/\` with template files:

1. Update the vocabulary to declare the folder:
   \`\`\`tsx
   interface Folders {
     "tskb.templates": Folder<{
       desc: "Template files used for generating output (e.g., AGENTS.md)";
       path: "packages/tskb/templates";
     }>;
   }
   \`\`\`

2. Create or update a doc to explain its purpose:
   \`\`\`tsx
   <P>
     The {TemplatesFolder} contains template files that are processed
     during the build. The AGENTS.md template is used to generate
     agent guidance with injected CLI help text.
   </P>
   \`\`\`

3. Run \`tskb build\` to regenerate the graph

---

## Best practices

### For exploration

- **Start broad, narrow down**: Use \`ls\` → \`describe\` → \`select\`
- **Follow references**: If a doc mentions a folder, \`describe\` it
- **Check confidence**: Low confidence? Try different search terms or scopes
- **Read actual code**: TSKB points you to files, but you still need to read them

### For understanding

- **Look for patterns**: Similar folder structures often indicate similar purposes
- **Check parent folders**: Understanding the parent helps understand the child
- **Read docs first**: .tskb.tsx docs explain the "why" behind the "what"
- **Trace dependencies**: Follow \`belongs-to\` edges to understand ownership

### For making changes

- **Verify with describe**: After adding code, check if it appears in the graph
- **Update docs if needed**: If structure changed significantly, update .tskb.tsx
- **Run build to validate**: TSKB will fail if docs reference non-existent code
- **Keep docs semantic**: Focus on architecture, not implementation

---

## Rules

1. **TSKB is the starting point** — use it before exploring code
2. **Do not explore blindly** — let TSKB guide your file reading
3. **Combine with normal tools** — use TSKB for structure, then read files directly
4. **Trust the graph** — if something's not in TSKB, it might not be architecturally significant
5. **Update when appropriate** — extend docs when structure or architecture changes
`;
}

/**
 * Generate AGENTS.md file from template
 */
export function generateAgentsFile(outputPath: string): void {
  // Get CLI usage text
  const cliUsage = getHelpText();

  // Generate content from template
  const content = getAgentsTemplate(cliUsage);

  // Write the file
  fs.writeFileSync(outputPath, content, "utf-8");
}
