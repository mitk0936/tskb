import { globSync } from "glob";
import fs from "node:fs";
import path from "node:path";
import { createProgram } from "../../typescript/index.js";
import { extractRegistry, extractDocs } from "../../core/extraction/index.js";
import { buildGraph } from "../../core/graph/index.js";

/**
 * Configuration for the extract command
 */
export interface ExtractConfig {
  /**
   * Glob pattern to match documentation files
   */
  pattern: string;
  /**
   * Output file path for the generated graph JSON
   */
  output: string;
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
 * 6. SERIALIZATION
 *    Writes the graph to JSON format for consumption by AI tools and documentation systems.
 *
 * OUTPUT:
 * A comprehensive knowledge graph mapping your codebase's architecture, entities,
 * and their interconnections—enabling AI to understand your project structure.
 *
 * @param config - Extract configuration (pattern, output, tsconfig)
 */
export async function build(config: ExtractConfig): Promise<void> {
  console.log("tskb build");
  console.log(`   Pattern: ${config.pattern}`);
  console.log(`   Tsconfig: ${config.tsconfig}`);
  console.log("");

  // Find all matching files
  const files = globSync(config.pattern, { absolute: true, nodir: true });
  console.log(`Found ${files.length} documentation files`);

  if (files.length === 0) {
    console.warn("No files found matching pattern");
    return;
  }

  // Create TypeScript program
  console.log("Creating TypeScript program...");
  const program = createProgram(files, config.tsconfig);

  // Extract registry (vocabulary)
  console.log("Extracting registry (Folders, Modules, Terms)...");
  const tsconfigDir = path.dirname(path.resolve(config.tsconfig));

  // Use rootDir from tsconfig if available, otherwise use tsconfig directory
  const compilerOptions = program.getCompilerOptions();
  const baseDir = compilerOptions.rootDir
    ? path.resolve(tsconfigDir, compilerOptions.rootDir)
    : tsconfigDir;

  console.log(`   Base directory: ${baseDir}`);

  const registry = extractRegistry(program, baseDir, config.tsconfig);
  console.log(`   ├─ ${registry.folders.size} folders`);

  // Report path resolution status
  const foldersWithPaths = Array.from(registry.folders.values()).filter((c) => c.path);
  const validPaths = foldersWithPaths.filter((c) => c.pathExists).length;
  const invalidPaths = foldersWithPaths.filter((c) => !c.pathExists).length;
  if (foldersWithPaths.length > 0) {
    console.log(
      `   │  └─ Paths: ${validPaths} valid, ${
        invalidPaths > 0 ? `${invalidPaths} missing` : "0 missing"
      }`
    );
  }

  console.log(`   ├─ ${registry.modules.size} modules`);

  // Report module import path resolution status
  const modulesWithImports = Array.from(registry.modules.values()).filter((m) => m.importPath);
  const validImports = modulesWithImports.filter((m) => m.pathExists).length;
  const invalidImports = modulesWithImports.filter((m) => !m.pathExists).length;
  if (modulesWithImports.length > 0) {
    console.log(
      `   │  └─ Imports: ${validImports} valid, ${
        invalidImports > 0 ? `${invalidImports} missing` : "0 missing"
      }`
    );
  }

  console.log(`   └─ ${registry.terms.size} terms`);

  // Extract documentation
  console.log("Extracting documentation...");
  const docs = extractDocs(program, new Set(files), baseDir);
  console.log(`└─ ${docs.length} docs`);

  // Build knowledge graph
  console.log("Building knowledge graph...");
  const graph = buildGraph(registry, docs, baseDir);
  console.log(`   ├─ ${graph.metadata.stats.folderCount} folder nodes`);
  console.log(`   ├─ ${graph.metadata.stats.moduleCount} module nodes`);
  console.log(`   ├─ ${graph.metadata.stats.exportCount} export nodes`);
  console.log(`   ├─ ${graph.metadata.stats.termCount} term nodes`);
  console.log(`   ├─ ${graph.metadata.stats.docCount} doc nodes`);
  console.log(`   └─ ${graph.metadata.stats.edgeCount} edges`);

  // Write output
  console.log(`Writing graph to ${config.output}...`);
  fs.mkdirSync(path.dirname(config.output), { recursive: true });
  fs.writeFileSync(config.output, JSON.stringify(graph, null, 2), "utf-8");

  console.log("");
  console.log("Done!");
}
