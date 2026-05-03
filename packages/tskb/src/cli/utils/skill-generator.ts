import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import {
  buildCliBody,
  buildTocBody,
  buildUpdateBody,
  buildUpdateSyntaxBody,
  detectBuildScript,
} from "./content-builder.js";

/**
 * Generate Claude Code skill files:
 * - .claude/skills/tskb/SKILL.md                — CLI / orientation (always-on)
 * - .claude/skills/tskb-toc/SKILL.md            — repo table of contents (on-demand)
 * - .claude/skills/tskb-update/SKILL.md         — when/where/how-to-think for docs
 * - .claude/skills/tskb-update-syntax/SKILL.md  — what-to-type reference (on-demand)
 *
 * Split rationale: agents load only what they need. The CLI how-to and the
 * doc-authoring workflow are stable and small; the toc snapshot and the syntax
 * reference are heavy and only needed in specific situations.
 *
 * @param graph - The built knowledge graph (used to bake in folder tree and doc summaries)
 * @returns Array of paths written
 */
export function generateSkillFiles(graph: KnowledgeGraph): string[] {
  const skillsDir = path.resolve(process.cwd(), ".claude", "skills");
  const buildScript = detectBuildScript();

  const paths: string[] = [];

  // CLI / orientation skill
  const cliDir = path.join(skillsDir, "tskb");
  fs.mkdirSync(cliDir, { recursive: true });
  const cliContent = buildCliSkillContent(graph, buildScript);
  const cliPath = path.join(cliDir, "SKILL.md");
  fs.writeFileSync(cliPath, cliContent, "utf-8");
  paths.push(cliPath);

  // Table-of-contents skill
  const tocDir = path.join(skillsDir, "tskb-toc");
  fs.mkdirSync(tocDir, { recursive: true });
  const tocContent = buildTocSkillContent(graph, buildScript);
  const tocPath = path.join(tocDir, "SKILL.md");
  fs.writeFileSync(tocPath, tocContent, "utf-8");
  paths.push(tocPath);

  // Update skill (workflow + folder structure + key rules)
  const updateDir = path.join(skillsDir, "tskb-update");
  fs.mkdirSync(updateDir, { recursive: true });
  const updateContent = buildUpdateSkillContent(graph, buildScript);
  const updatePath = path.join(updateDir, "SKILL.md");
  fs.writeFileSync(updatePath, updateContent, "utf-8");
  paths.push(updatePath);

  // Update-syntax skill (registry primitives, JSX, snippets, class methods)
  const updateSyntaxDir = path.join(skillsDir, "tskb-update-syntax");
  fs.mkdirSync(updateSyntaxDir, { recursive: true });
  const updateSyntaxContent = buildUpdateSyntaxSkillContent(graph);
  const updateSyntaxPath = path.join(updateSyntaxDir, "SKILL.md");
  fs.writeFileSync(updateSyntaxPath, updateSyntaxContent, "utf-8");
  paths.push(updateSyntaxPath);

  return paths;
}

function buildCliSkillContent(graph: KnowledgeGraph, buildScript: string): string {
  return `---
name: tskb
description: "Codebase map — check it whenever you enter unfamiliar territory. Shows where things live, how they connect, what constraints apply. Use before grepping or reading files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Map

A curated map of the codebase. Not every file — the parts that matter architecturally: folders, modules, exports, flows, constraints, and how they connect.

Consult the map whenever you step into unfamiliar territory — not just the first question, but every time the conversation moves to a new area. A quick \`search\` or \`pick\` is cheaper than guessing from file names.

For the repo's curated index of boundaries, externals, flows, and essential docs, load the \`tskb-toc\` skill.

${buildCliBody(graph, buildScript)}
`;
}

function buildTocSkillContent(graph: KnowledgeGraph, buildScript: string): string {
  return `---
name: tskb-toc
description: "Table of contents for this repo's codebase map: boundaries, externals, flows, and the essential-docs index. Load when orienting in unfamiliar territory — 'where is X', 'what areas exist', 'what flows are defined' — or before exploring a new part of the codebase. Skip when you already know the node ID or path."
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Table of Contents

Curated index of the repo's structural elements. Load this when you need to orient — what areas exist, which boundaries separate runtimes, what external services are used, what flows are documented. For the CLI itself (commands, response shapes), see the \`tskb\` skill.

${buildTocBody(graph, buildScript)}
`;
}

function buildUpdateSkillContent(graph: KnowledgeGraph, buildScript: string): string {
  return `---
name: tskb-update
description: "Write, update, and maintain .tskb.tsx documentation files — covers the workflow for finding the right questions to answer, folder structure and naming conventions, and key authoring rules. Use when the developer asks to document something or when you spot something structural that isn't in the map. For full syntax (registry primitives, JSX components, snippets), load the tskb-update-syntax skill."
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob
---

# TSKB — Write & Update Documentation

How to write and maintain the codebase map. The map lives in \`.tskb.tsx\` files — they declare what exists and how it connects.

For full syntax — registry primitives, JSX components, snippets, class-method patterns — load the **\`tskb-update-syntax\`** skill.

${buildUpdateBody(graph, buildScript)}
`;
}

function buildUpdateSyntaxSkillContent(graph: KnowledgeGraph): string {
  return `---
name: tskb-update-syntax
description: "Syntax reference for writing .tskb.tsx files: file anatomy, registry primitives, JSX components, type-checked snippets, the boundary prop, and class-method patterns. Load when actually editing or creating a .tskb.tsx file. For the workflow (when to update, where to put things, how to find questions to answer), see the tskb-update skill."
allowed-tools: Read, Write, Edit, Glob
---

# TSKB — Authoring Syntax

Reference for the syntax used inside \`.tskb.tsx\` files. Load this when your hands are on the keyboard. For when/where/how-to-think, see the \`tskb-update\` skill.

${buildUpdateSyntaxBody(graph)}
`;
}
