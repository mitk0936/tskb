import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import {
  buildCliBody,
  buildTocBody,
  buildUpdateBody,
  buildUpdateReferences,
  buildUpdateSyntaxBody,
  buildUpdateSyntaxReferences,
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

  const updateRefsDir = path.join(updateDir, "references");
  fs.mkdirSync(updateRefsDir, { recursive: true });
  for (const ref of buildUpdateReferences(graph)) {
    const refPath = path.join(updateRefsDir, ref.filename);
    fs.writeFileSync(refPath, ref.body, "utf-8");
    paths.push(refPath);
  }

  // Update-syntax skill (registry primitives, JSX, snippets, class methods)
  const updateSyntaxDir = path.join(skillsDir, "tskb-update-syntax");
  fs.mkdirSync(updateSyntaxDir, { recursive: true });
  const updateSyntaxContent = buildUpdateSyntaxSkillContent(graph);
  const updateSyntaxPath = path.join(updateSyntaxDir, "SKILL.md");
  fs.writeFileSync(updateSyntaxPath, updateSyntaxContent, "utf-8");
  paths.push(updateSyntaxPath);

  const updateSyntaxRefsDir = path.join(updateSyntaxDir, "references");
  fs.mkdirSync(updateSyntaxRefsDir, { recursive: true });
  for (const ref of buildUpdateSyntaxReferences()) {
    const refPath = path.join(updateSyntaxRefsDir, ref.filename);
    fs.writeFileSync(refPath, ref.body, "utf-8");
    paths.push(refPath);
  }

  return paths;
}

function buildCliSkillContent(graph: KnowledgeGraph, buildScript: string): string {
  const projectLabel = graph.metadata.projectName ? ` (${graph.metadata.projectName})` : "";
  return `---
name: tskb
description: "CLI for exploring the codebase map${projectLabel} — search, pick, context, ls, docs, flows. Use whenever you enter unfamiliar territory: discover the architecture around an area or concept, find what's related, inspect a module/export/folder/flow/doc, check constraints — all before grepping or reading files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Map CLI${projectLabel}

Commands for exploring the codebase map. Use to discover the architecture around an area or concept, find what's related to a node, trace a flow, or check rules — before you grep or open files.

${buildCliBody(graph, buildScript)}
`;
}

function buildTocSkillContent(graph: KnowledgeGraph, buildScript: string): string {
  const projectLabel = graph.metadata.projectName ? ` (${graph.metadata.projectName})` : "";
  return `---
name: tskb-toc
description: "ALWAYS load first when working in this repo${projectLabel}. Big-picture index — folder tree, boundaries, externals, flows, constraint rules (MUST follow), and essential docs. Tells you what areas exist, what runtimes are separate, and what rules apply before you touch anything."
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Repo Table of Contents${projectLabel}

The big-picture index of this repo. Load this whenever you start a task — it tells you what areas exist, which folders are distinct runtimes, what external services are in play, what flows describe key processes, what rules MUST be followed, and which docs are essential reading.

${buildTocBody(graph, buildScript)}
`;
}

function buildUpdateSkillContent(graph: KnowledgeGraph, buildScript: string): string {
  return `---
name: tskb-update
description: "Write, update, and maintain .tskb.tsx documentation files — covers the workflow for finding the right questions to answer, folder structure and naming conventions, and key authoring rules. Use when the developer asks to document something or when you spot something structural that isn't in the map. For full syntax (registry primitives, JSX components, snippets), load the tskb-update-syntax skill."
allowed-tools: Bash(npx --no -- tskb *), Bash(${buildScript}:*), Read, Write, Edit, Glob, Grep
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
allowed-tools: Bash(npx --no -- tskb *), Read, Write, Edit, Glob, Grep
---

# TSKB — Authoring Syntax

Reference for the syntax used inside \`.tskb.tsx\` files. Load this when your hands are on the keyboard. For when/where/how-to-think, see the \`tskb-update\` skill.

${buildUpdateSyntaxBody(graph)}
`;
}
