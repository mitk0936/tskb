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
description: "IMPORTANT: Always invoke this skill BEFORE planning, exploring, or making code changes. Uses the tskb knowledge graph to understand codebase structure, locate concepts, and find relevant files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Architecture Explorer

This project uses **TSKB**, a semantic knowledge graph of the codebase.

**You MUST query TSKB before touching any area of the codebase** — not just once per task, but each time your work moves to a different folder, module, or concept. Re-query when you shift focus mid-task. The graph captures developer intent and constraints that file reading alone will miss.

${buildQueryBody(graph)}
`;
}

function buildUpdateSkillContent(graph: KnowledgeGraph): string {
  return `---
name: tskb-update
description: "Use when you discover undocumented architecture, make structural changes, or the developer wants to record an important decision. Guides writing .tskb.tsx documentation files."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob
---

# TSKB — Documentation Authoring Guide

This project uses **TSKB**, a semantic knowledge graph of the codebase.
This guide explains how to write and update \`.tskb.tsx\` documentation files.

${buildUpdateBody(graph)}
`;
}
