import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildQueryBody, buildUpdateBody, buildBootstrapBody } from "./content-builder.js";

/**
 * Generate Claude Code skill files:
 * - .claude/skills/tskb/SKILL.md (query/explore)
 * - .claude/skills/tskb-update/SKILL.md (update/write docs)
 * - .claude/skills/tskb-bootstrap/SKILL.md (initial setup)
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

  // Bootstrap skill
  const bootstrapDir = path.join(skillsDir, "tskb-bootstrap");
  fs.mkdirSync(bootstrapDir, { recursive: true });
  const bootstrapContent = buildBootstrapSkillContent(graph);
  const bootstrapPath = path.join(bootstrapDir, "SKILL.md");
  fs.writeFileSync(bootstrapPath, bootstrapContent, "utf-8");
  paths.push(bootstrapPath);

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
description: "Write, update, and maintain .tskb.tsx documentation files — covers JSX syntax, registry primitives, session triggers, and best practices. Use when the developer asks to document or when you encounter something structurally important that's missing from the map."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob
---

# TSKB — Write & Update Documentation

How to write and maintain the codebase map. The map lives in \`.tskb.tsx\` files — they declare what exists and how it connects.

${buildUpdateBody(graph)}
`;
}

function buildBootstrapSkillContent(graph: KnowledgeGraph): string {
  return `---
name: tskb-bootstrap
description: "Initial tskb setup in a new or existing repo — install, scaffold docs folder, configure TypeScript, add AI integrations. Use when the developer wants to add tskb to their project for the first time."
allowed-tools: Bash(npx tskb init), Bash(npx --no -- tskb *), Read, Write, Edit
---

# TSKB — Bootstrap Initial Setup

${buildBootstrapBody(graph)}
`;
}
