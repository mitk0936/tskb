import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildQueryBody, buildUpdateBody } from "./content-builder.js";

/**
 * Generate Claude Code skill files:
 * - .claude/skills/tskb/SKILL.md (query/explore)
 * - .claude/skills/tskb-update/SKILL.md (update docs)
 *
 * Directories are created automatically if they don't exist.
 *
 * @param graph - The built knowledge graph (used to bake in folder tree and doc summaries)
 * @returns Array of paths written
 */
export function generateSkillFiles(graph: KnowledgeGraph): string[] {
  const skillsDir = path.resolve(process.cwd(), ".claude", "skills");

  const paths: string[] = [];

  // Query skill
  const queryDir = path.join(skillsDir, "tskb");
  fs.mkdirSync(queryDir, { recursive: true });
  const queryContent = buildQuerySkillContent(graph);
  const queryPath = path.join(queryDir, "SKILL.md");
  fs.writeFileSync(queryPath, queryContent, "utf-8");
  paths.push(queryPath);

  // Update skill
  const updateDir = path.join(skillsDir, "tskb-update");
  fs.mkdirSync(updateDir, { recursive: true });
  const updateContent = buildUpdateSkillContent(graph);
  const updatePath = path.join(updateDir, "SKILL.md");
  fs.writeFileSync(updatePath, updateContent, "utf-8");
  paths.push(updatePath);

  return paths;
}

function buildQuerySkillContent(graph: KnowledgeGraph): string {
  return `---
name: tskb
description: "A map of the codebase — folders, modules, exports, and how they connect. Use it before grep/glob to find where things are, what depends on what, and what docs exist. Incomplete but fast."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Map

Like an open-source map of the codebase — not satellite imagery, but what people thought was important to map. Folders, modules, exports, their connections, and developer-written docs. Won't have everything, but gets you oriented fast.

${buildQueryBody(graph)}
`;
}

function buildUpdateSkillContent(graph: KnowledgeGraph): string {
  return `---
name: tskb-update
description: "Add or update entries on the codebase map — declare folders, modules, exports, and write .tskb.tsx doc files. Use when the developer asks or when you find something important that's not on the map."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob
---

# TSKB — Update the Codebase Map

How to add things to the map. The map lives in \`.tskb.tsx\` files — they declare what exists and how it connects.

${buildUpdateBody(graph)}
`;
}
