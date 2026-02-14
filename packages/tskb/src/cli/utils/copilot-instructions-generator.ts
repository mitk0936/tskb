import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Generate a GitHub Copilot instructions file at .github/instructions/tskb.instructions.md
 *
 * If .github/ doesn't exist, prints a suggestion to create it.
 *
 * @param graph - The built knowledge graph (used to bake in folder tree and doc summaries)
 * @returns The path written, or null if skipped
 */
export function generateCopilotInstructions(graph: KnowledgeGraph): string | null {
  const githubDir = path.resolve(process.cwd(), ".github");

  if (!fs.existsSync(githubDir)) {
    console.log("");
    console.log("Tip: Create a .github/ directory to generate Copilot instructions for tskb:");
    console.log("   mkdir -p .github/instructions");
    console.log("   Then re-run the build to generate .github/instructions/tskb.instructions.md");
    return null;
  }

  const instructionsDir = path.join(githubDir, "instructions");
  fs.mkdirSync(instructionsDir, { recursive: true });

  const content = buildInstructionsContent(graph);
  const instructionsPath = path.join(instructionsDir, "tskb.instructions.md");
  fs.writeFileSync(instructionsPath, content, "utf-8");

  return instructionsPath;
}

function buildInstructionsContent(graph: KnowledgeGraph): string {
  const folderTree = buildFolderTree(graph);
  const docSummaries = buildDocSummaries(graph);

  return `---
applyTo: "**"
---

# TSKB — Codebase Architecture

This project uses **TSKB**, a semantic knowledge graph of the codebase.
Before making code changes, use TSKB to understand the architecture.

## Commands

Search for concepts, modules, or folders:
\`\`\`bash
npx tskb search "<query>"
\`\`\`

Get detailed info on any node (by ID or path):
\`\`\`bash
npx tskb pick "<identifier>"
\`\`\`

List folder hierarchy:
\`\`\`bash
npx tskb ls --depth=4
\`\`\`

## Folder Structure

${folderTree}

## Documentation

Each doc has an \`explains\` field describing its purpose. Use this to decide which docs to read.

${docSummaries}

## Workflow

1. **Orient** — Scan the folder structure above to find the relevant area
2. **Search** — Run \`npx tskb search "<query>"\` to find specific nodes
3. **Pick** — Run \`npx tskb pick "<id>"\` for full context on a node
4. **Explore** — Use file reading tools for implementation details not covered by the graph
5. **Act** — Make architecturally coherent changes based on what you learned
`;
}

function buildFolderTree(graph: KnowledgeGraph): string {
  const folders = Object.values(graph.nodes.folders)
    .filter((f) => f.path)
    .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));

  if (folders.length === 0) return "_No folders in graph._";

  return folders
    .map((f) => {
      const depth = f.path === "." ? 0 : (f.path?.split("/").length ?? 0);
      const indent = "  ".repeat(depth);
      return `${indent}- **${f.id}** (\`${f.path}\`) — ${f.desc}`;
    })
    .join("\n");
}

function buildDocSummaries(graph: KnowledgeGraph): string {
  const docs = Object.values(graph.nodes.docs).sort((a, b) => a.filePath.localeCompare(b.filePath));

  if (docs.length === 0) return "_No docs in graph._";

  return docs
    .map((d) => `- \`${d.filePath}\` — ${d.explains || "_no explains provided_"}`)
    .join("\n");
}
