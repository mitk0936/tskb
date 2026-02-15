import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildBody } from "./content-builder.js";

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

${buildBody(graph)}
`;
}
