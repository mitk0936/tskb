import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import {
  buildQueryBody,
  buildUpdateBody,
  buildUpdateSyntaxBody,
  detectBuildScript,
} from "./content-builder.js";

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
  const buildScript = detectBuildScript();

  const paths: string[] = [];

  // Query instructions
  const queryContent = buildQueryInstructionsContent(graph, buildScript);
  const queryPath = path.join(instructionsDir, "tskb.instructions.md");
  fs.writeFileSync(queryPath, queryContent, "utf-8");
  paths.push(queryPath);

  // Update instructions
  const updateContent = buildUpdateInstructionsContent(graph, buildScript);
  const updatePath = path.join(instructionsDir, "tskb-update.instructions.md");
  fs.writeFileSync(updatePath, updateContent, "utf-8");
  paths.push(updatePath);

  return paths;
}

function buildQueryInstructionsContent(graph: KnowledgeGraph, buildScript: string): string {
  return `---
applyTo: "**"
---

# TSKB — Codebase Architecture

This project has a curated codebase map. Not every file — the parts that matter architecturally: folders, modules, exports, flows, constraints, and how they connect.

Consult the map whenever you step into unfamiliar territory — not just the first question, but every time the conversation moves to a new area. A quick \`search\` or \`pick\` is cheaper than guessing from file names.

${buildQueryBody(graph, buildScript)}
`;
}

function buildUpdateInstructionsContent(graph: KnowledgeGraph, buildScript: string): string {
  return `---
applyTo: "**/*.tskb.tsx"
---

# TSKB — Write & Update Documentation

This project uses **TSKB**, a semantic knowledge graph of the codebase.
This guide covers how to write, update, and maintain \`.tskb.tsx\` documentation files — workflow, folder structure, registry primitives, JSX components, and best practices.

${buildUpdateBody(graph, buildScript)}

---

${buildUpdateSyntaxBody(graph)}
`;
}
