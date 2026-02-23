import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildQueryBody, buildUpdateBody } from "./content-builder.js";
import { info } from "./logger.js";

/**
 * Generate GitHub Copilot instructions files:
 * - .github/instructions/tskb.instructions.md (query/explore)
 * - .github/instructions/tskb-update.instructions.md (update docs)
 *
 * If .github/ doesn't exist, prints a suggestion to create it.
 *
 * @param graph - The built knowledge graph (used to bake in folder tree and doc summaries)
 * @returns Array of paths written, or empty array if skipped
 */
export function generateCopilotInstructionsFiles(graph: KnowledgeGraph): string[] {
  const githubDir = path.resolve(process.cwd(), ".github");

  if (!fs.existsSync(githubDir)) {
    info("");
    info("Tip: Create a .github/ directory to generate Copilot instructions for tskb:");
    info("   mkdir -p .github/instructions");
    info("   Then re-run the build to generate instruction files");
    return [];
  }

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

This project uses **TSKB**, a semantic knowledge graph of the codebase.
Before making code changes, use TSKB to understand the architecture.

${buildQueryBody(graph)}
`;
}

function buildUpdateInstructionsContent(graph: KnowledgeGraph): string {
  return `---
applyTo: "**/*.tskb.tsx"
---

# TSKB — Documentation Authoring Guide

This project uses **TSKB**, a semantic knowledge graph of the codebase.
This guide explains how to write and update \`.tskb.tsx\` documentation files.

${buildUpdateBody(graph)}
`;
}
