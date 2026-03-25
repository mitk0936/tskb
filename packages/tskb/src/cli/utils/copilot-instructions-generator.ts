import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildQueryBody, buildUpdateBody, buildBootstrapBody } from "./content-builder.js";

/**
 * Generate GitHub Copilot instructions files:
 * - .github/instructions/tskb.instructions.md (query/explore)
 * - .github/instructions/tskb-update.instructions.md (update/write docs)
 * - .github/instructions/tskb-bootstrap.instructions.md (initial setup)
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

  // Bootstrap instructions
  const bootstrapContent = buildBootstrapInstructionsContent(graph);
  const bootstrapPath = path.join(instructionsDir, "tskb-bootstrap.instructions.md");
  fs.writeFileSync(bootstrapPath, bootstrapContent, "utf-8");
  paths.push(bootstrapPath);

  return paths;
}

function buildQueryInstructionsContent(graph: KnowledgeGraph): string {
  return `---
applyTo: "**"
---

# TSKB — Codebase Architecture

This project uses **TSKB**, a semantic knowledge graph of the codebase. It captures architectural intent, constraints, and structural relationships that filesystem exploration alone will miss.

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

function buildBootstrapInstructionsContent(graph: KnowledgeGraph): string {
  return `---
applyTo: "**"
---

# TSKB — Bootstrap Initial Setup

This project can use **TSKB** for architecture documentation. Use this guide to scaffold tskb from scratch.

${buildBootstrapBody(graph)}
`;
}
