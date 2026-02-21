import { globSync } from "glob";
import fs from "node:fs";
import path from "node:path";
import { createProgram } from "../../typescript/index.js";
import { extractRegistry, extractDocs } from "../../core/extraction/index.js";
import { buildGraph } from "../../core/graph/index.js";
import { generateDot } from "../../core/visualization/index.js";
import { info, verbose, infoTime } from "../utils/logger.js";

/**
 * Configuration for the extract command
 */
export interface ExtractConfig {
  /**
   * Glob pattern to match documentation files
   */
  pattern: string;
  /**
   * Path to tsconfig.json
   */
  tsconfig: string;
}

/**
 * Generates a knowledge graph from tskb documentation files.
 *
 * PIPELINE OVERVIEW:
 * Orchestrates the complete knowledge graph extraction process through six stages:
 *
 * 1. FILE DISCOVERY
 *    Locates all documentation files matching the glob pattern.
 *
 * 2. PROGRAM INITIALIZATION
 *    Loads files into TypeScript's compiler, providing access to the parsed AST
 *    (Abstract Syntax Tree) and type checker.
 *
 * 3. REGISTRY EXTRACTION
 *    Scans the AST for `declare global { namespace tskb { ... } }` declarations.
 *    Extracts Context/Module/Term definitions to build the canonical vocabulary—
 *    the authoritative names and descriptions for your codebase.
 *
 * 4. DOCUMENTATION EXTRACTION
 *    Processes each file's AST to extract documentation by traversing the JSX
 *    tree to extract text and references, capturing content and its relationships
 *    to vocabulary items.
 *
 * 5. GRAPH CONSTRUCTION
 *    Merges registry and documentation into a unified graph structure with
 *    nodes (entities) and edges (relationships), creating a queryable network.
 *
 * 6. OUTPUT GENERATION
 *    Creates a .tskb directory containing:
 *    - graph.json: The knowledge graph in JSON format
 *    - graph.dot: Graphviz visualization
 *    Optionally generates:
 *    - .claude/skills/tskb/SKILL.md: Claude Code skill (if .claude/skills/ exists)
 *    - .github/instructions/tskb.instructions.md: Copilot instructions (if .github/ exists)
 *
 * OUTPUT:
 * A .tskb directory with knowledge graph artifacts, plus optional AI tool
 * integrations for Claude Code and GitHub Copilot.
 *
 * @param config - Extract configuration (pattern, tsconfig)
 */
export async function build(config: ExtractConfig): Promise<void> {
  const buildDone = infoTime("tskb build");
  verbose(`   Pattern: ${config.pattern}`);
  verbose(`   Tsconfig: ${config.tsconfig}`);

  // Find all matching files
  const globDone = infoTime("Discovering files");
  const files = globSync(config.pattern, { absolute: true, nodir: true });
  globDone();
  info(`Found ${files.length} documentation files`);

  if (files.length === 0) {
    info("No files found matching pattern");
    return;
  }

  // Create TypeScript program
  const programDone = infoTime("Creating TypeScript program");
  const program = createProgram(files, config.tsconfig);
  programDone();

  // Extract registry (vocabulary)
  const registryDone = infoTime("Extracting registry (Folders, Modules, Terms)");
  const tsconfigDir = path.dirname(path.resolve(config.tsconfig));

  // Use rootDir from tsconfig if available, otherwise use tsconfig directory
  const compilerOptions = program.getCompilerOptions();

  // compilerOptions.rootDir is already an absolute path resolved by TypeScript
  const baseDir = compilerOptions.rootDir || tsconfigDir;

  verbose(`   Base directory: ${baseDir}`);

  const registry = extractRegistry(program, baseDir, config.tsconfig);
  registryDone();

  info(`   ├─ ${registry.folders.size} folders`);

  // Report path resolution status
  const foldersWithPaths = Array.from(registry.folders.values()).filter((c) => c.path);
  const validPaths = foldersWithPaths.filter((c) => c.pathExists).length;
  const invalidPaths = foldersWithPaths.filter((c) => !c.pathExists).length;
  if (foldersWithPaths.length > 0) {
    verbose(
      `   │  └─ Paths: ${validPaths} valid, ${
        invalidPaths > 0 ? `${invalidPaths} missing` : "0 missing"
      }`
    );
  }

  info(`   ├─ ${registry.modules.size} modules`);

  // Report module import path resolution status
  const modulesWithImports = Array.from(registry.modules.values()).filter((m) => m.importPath);
  const validImports = modulesWithImports.filter((m) => m.pathExists).length;
  const invalidImports = modulesWithImports.filter((m) => !m.pathExists).length;
  if (modulesWithImports.length > 0) {
    verbose(
      `   │  └─ Imports: ${validImports} valid, ${
        invalidImports > 0 ? `${invalidImports} missing` : "0 missing"
      }`
    );
  }

  info(`   ├─ ${registry.exports.size} exports`);
  info(`   └─ ${registry.terms.size} terms`);

  // Report folder summary and module morphology counts
  const foldersWithSummary = Array.from(registry.folders.values()).filter(
    (f) => f.folderSummary
  ).length;
  if (foldersWithSummary > 0) {
    verbose(`   Folder summaries: ${foldersWithSummary} extracted`);
  }
  const modulesWithMorphology = Array.from(registry.modules.values()).filter(
    (m) => m.morphology
  ).length;
  if (modulesWithMorphology > 0) {
    verbose(`   Module morphologies: ${modulesWithMorphology} extracted`);
  }

  // Extract documentation
  const docsDone = infoTime("Extracting documentation");
  const docs = extractDocs(program, new Set(files));
  docsDone();
  info(`└─ ${docs.length} docs`);

  // Build knowledge graph
  const graphDone = infoTime("Building knowledge graph");
  const graph = buildGraph(registry, docs, baseDir);
  graphDone();

  info(`   ├─ ${graph.metadata.stats.folderCount} folder nodes`);
  info(`   ├─ ${graph.metadata.stats.moduleCount} module nodes`);
  info(`   ├─ ${graph.metadata.stats.exportCount} export nodes`);
  info(`   ├─ ${graph.metadata.stats.termCount} term nodes`);
  info(`   ├─ ${graph.metadata.stats.docCount} doc nodes`);
  info(`   └─ ${graph.metadata.stats.edgeCount} edges`);

  // Create .tskb output directory
  const outputDone = infoTime("Writing outputs");
  const outputDir = path.resolve(process.cwd(), ".tskb");
  verbose(`   Output directory: ${outputDir}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // Write graph.json
  const graphPath = path.join(outputDir, "graph.json");
  verbose(`   Writing graph to ${graphPath}`);
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");

  // Generate and write graph.dot
  const dotPath = path.join(outputDir, "graph.dot");
  verbose(`   Generating visualization: ${dotPath}`);
  const dot = generateDot(graph);
  fs.writeFileSync(dotPath, dot, "utf-8");

  // Generate Claude Code skills if .claude/skills/ exists
  const { generateSkillFiles } = await import("../utils/skill-generator.js");
  const skillPaths = generateSkillFiles(graph);
  for (const p of skillPaths) {
    info(`Writing Claude Code skill: ${p}`);
  }

  // Generate Copilot instructions if .github/ exists
  const { generateCopilotInstructionsFiles } =
    await import("../utils/copilot-instructions-generator.js");
  const copilotPaths = generateCopilotInstructionsFiles(graph);
  for (const p of copilotPaths) {
    info(`Writing Copilot instructions: ${p}`);
  }
  outputDone();

  info("");
  info("✓ Done!");
  info("");
  info("Output directory: .tskb/");
  info("   ├─ graph.json     Knowledge graph data");
  info("   └─ graph.dot      Graphviz visualization");
  for (const p of skillPaths) {
    info(`   └─ ${path.relative(process.cwd(), p)}  Claude Code skill`);
  }
  for (const p of copilotPaths) {
    info(`   └─ ${path.relative(process.cwd(), p)}  Copilot instructions`);
  }
  info("");
  info(`Visualize with: dot -Tpng .tskb/graph.dot -o .tskb/graph.png`);
  buildDone();
}
