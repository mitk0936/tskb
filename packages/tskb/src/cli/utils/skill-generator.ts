import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";

/**
 * Generate a Claude Code skill file at .claude/skills/tskb/SKILL.md
 *
 * If .claude/skills/ doesn't exist, prints a suggestion to create it.
 *
 * @param graph - The built knowledge graph (used to bake in folder tree and doc summaries)
 * @returns The path written, or null if skipped
 */
export function generateSkillFile(graph: KnowledgeGraph): string | null {
  const skillsDir = path.resolve(process.cwd(), ".claude", "skills");

  if (!fs.existsSync(skillsDir)) {
    console.log("");
    console.log(
      "Tip: Create a .claude/skills/ directory to generate a Claude Code skill for tskb:"
    );
    console.log("   mkdir -p .claude/skills");
    console.log("   Then re-run the build to generate .claude/skills/tskb/SKILL.md");
    return null;
  }

  const tskbSkillDir = path.join(skillsDir, "tskb");
  fs.mkdirSync(tskbSkillDir, { recursive: true });

  const content = buildSkillContent(graph);
  const skillPath = path.join(tskbSkillDir, "SKILL.md");
  fs.writeFileSync(skillPath, content, "utf-8");

  return skillPath;
}

function buildSkillContent(graph: KnowledgeGraph): string {
  const folderTree = buildFolderTree(graph);
  const docSummaries = buildDocSummaries(graph);

  return `---
name: tskb
description: "IMPORTANT: Always invoke this skill BEFORE planning, exploring, or making code changes. Uses the tskb knowledge graph to understand codebase structure, locate concepts, and find relevant files."
argument-hint: [query]
allowed-tools: Bash(npx tskb *)
---

# TSKB — Codebase Architecture Explorer

This project uses **TSKB**, a semantic knowledge graph of the codebase.

**You MUST use this skill before:**
- Planning any implementation or refactoring
- Exploring unfamiliar parts of the codebase
- Making code changes (to understand what you're touching)
- Answering architecture questions

Use the commands below to query the graph — do NOT skip this and jump straight to reading files.

## Commands

Search for concepts, modules, or folders:
\`\`\`bash
npx tskb search "$ARGUMENTS"
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

Always follow this order — do not skip to step 4 or 5 without completing earlier steps:

1. **Orient** — Scan the folder structure above to find the relevant area
2. **Search** — Run \`npx tskb search "<query>"\` to find specific nodes
3. **Pick** — Run \`npx tskb pick "<id>"\` for full context on a node
4. **Explore** — Only then use Read/Grep for implementation details not covered by the graph
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
