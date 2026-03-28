import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildQueryBody, buildUpdateBody } from "./content-builder.js";

/**
 * Generate Claude Code skill files:
 * - .claude/skills/tskb/SKILL.md (query/explore)
 * - .claude/skills/tskb-update/SKILL.md (update/write docs)
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
description: "Codebase map — check it whenever you enter unfamiliar territory. Shows where things live, how they connect, what constraints apply. Use before grepping or reading files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Map

A curated map of the codebase. Not every file — the parts that matter architecturally: folders, modules, exports, flows, constraints, and how they connect.

Consult the map whenever you step into unfamiliar territory — not just the first question, but every time the conversation moves to a new area. A quick \`search\` or \`pick\` is cheaper than guessing from file names.

${buildQueryBody(graph)}
`;
}

function buildUpdateSkillContent(graph: KnowledgeGraph): string {
  return `---
name: tskb-update
description: "Write, update, and maintain .tskb.tsx documentation files — covers JSX syntax, registry primitives, session triggers, and best practices. Use when the developer asks to document or when you encounter something structurally important that's missing from the map."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob
---

# TSKB — Write & Update Documentation

How to write and maintain the codebase map. The map lives in \`.tskb.tsx\` files — they declare what exists and how it connects.

${buildUpdateBody(graph)}
`;
}
