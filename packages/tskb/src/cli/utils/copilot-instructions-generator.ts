import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildQueryBody, buildUpdateBody } from "./content-builder.js";

/**
 * Generate GitHub Copilot instructions files:
 * - .github/instructions/tskb.instructions.md (query/explore)
 * - .github/instructions/tskb-update.instructions.md (update/write docs)
 *
 * Directories are created automatically if they don't exist.
 *
 * @param graph - The built knowledge graph (used to bake in folder tree and doc summaries)
 * @returns Array of paths written
 */
export function generateCopilotInstructionsFiles(graph: KnowledgeGraph): string[] {
  const githubDir = path.resolve(process.cwd(), ".github");
  const instructionsDir = path.join(githubDir, "instructions");
  fs.mkdirSync(instructionsDir, { recursive: true });

  const paths: string[] = [];

  // Query instructions
  const queryContent = buildQueryInstructionsContent(graph);
  const queryPath = path.join(instructionsDir, "tskb.instructions.md");
  fs.writeFileSync(queryPath, queryContent, "utf-8");
  paths.push(queryPath);

  // Update instructions
  const updateContent = buildUpdateInstructionsContent(graph);
  const updatePath = path.join(instructionsDir, "tskb-update.instructions.md");
  fs.writeFileSync(updatePath, updateContent, "utf-8");
  paths.push(updatePath);

  return paths;
}

function buildQueryInstructionsContent(graph: KnowledgeGraph): string {
  return `---
applyTo: "**"
---

# TSKB — Codebase Architecture

This project has a curated codebase map. Not every file — the parts that matter architecturally: folders, modules, exports, flows, constraints, and how they connect.

Consult the map whenever you step into unfamiliar territory — not just the first question, but every time the conversation moves to a new area. A quick \`search\` or \`pick\` is cheaper than guessing from file names.

${buildQueryBody(graph)}
`;
}

function buildUpdateInstructionsContent(graph: KnowledgeGraph): string {
  return `---
applyTo: "**/*.tskb.tsx"
---

# TSKB — Write & Update Documentation

This project uses **TSKB**, a semantic knowledge graph of the codebase.
This guide covers how to write, update, and maintain \`.tskb.tsx\` documentation files — syntax, registry primitives, session triggers, and best practices.

${buildUpdateBody(graph)}
`;
}
