import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { buildBody } from "./content-builder.js";

/**
 * Generate a GitHub Copilot instructions file at .github/instructions/tskb.instructions.md
 *
 * If .github/ doesn't exist, prints a suggestion to create it.
 *
 * @param graph - The built knowledge graph (used to bake in folder tree and doc summaries)
 * @returns The path written, or null if skipped
 */
export function generateCopilotInstructions(graph: KnowledgeGraph): string | null {
  const githubDir = path.resolve(process.cwd(), ".github");

  if (!fs.existsSync(githubDir)) {
    console.log("");
    console.log("Tip: Create a .github/ directory to generate Copilot instructions for tskb:");
    console.log("   mkdir -p .github/instructions");
    console.log("   Then re-run the build to generate .github/instructions/tskb.instructions.md");
    return null;
  }

  const instructionsDir = path.join(githubDir, "instructions");
  fs.mkdirSync(instructionsDir, { recursive: true });

  const content = buildInstructionsContent(graph);
  const instructionsPath = path.join(instructionsDir, "tskb.instructions.md");
  fs.writeFileSync(instructionsPath, content, "utf-8");

  return instructionsPath;
}

function buildInstructionsContent(graph: KnowledgeGraph): string {
  return `---
applyTo: "**"
---

# TSKB — Codebase Architecture

This project uses **TSKB**, a semantic knowledge graph of the codebase.
Before making code changes, use TSKB to understand the architecture.

${buildBody(graph)}
`;
}
