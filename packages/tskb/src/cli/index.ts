#!/usr/bin/env node

/**
 * tskb CLI - TypeScript Semantic Knowledge Base
 *
 * Main entry point for the CLI tool.
 * Handles command parsing and routing.
 */

import { build } from "./commands/build.js";
import { visualize } from "./commands/visualize.js";
import { query } from "./commands/query.js";

/**
 * Parse command line arguments
 */
function parseArgs(
  args: string[]
):
  | { command: "build"; pattern: string; output: string; tsconfig: string }
  | { command: "visualize"; input: string; output: string }
  | { command: "query"; input: string; searchTerm: string; verbose: boolean } {
  const command = args[0];

  if (!command) {
    console.error("Usage:");
    console.error("  tskb build <glob> --out <file> --tsconfig <path>");
    console.error("  tskb visualize <graph.json> --out <file.dot>");
    console.error("  tskb query <graph.json> <search-term> [--verbose]");
    console.error("");
    console.error("Examples:");
    console.error('  tskb build "src/**/*.tsx" --out graph.json --tsconfig ./tsconfig.json');
    console.error("  tskb visualize tskb.json --out graph.dot");
    console.error('  tskb query tskb.json "auth"              # Concise output (default)');
    console.error('  tskb query tskb.json "auth" --verbose    # Full context');
    process.exit(1);
  }

  // If first arg doesn't look like a command, assume it's the old "build" usage
  if (command.includes("*") || command.includes("/")) {
    return {
      command: "build",
      pattern: command,
      output: args.includes("--out") ? args[args.indexOf("--out") + 1]! : "tskb.json",
      tsconfig: args.includes("--tsconfig")
        ? args[args.indexOf("--tsconfig") + 1]!
        : "tsconfig.json",
    };
  }

  // Parse modern command format
  if (command === "build") {
    const pattern = args[1];
    if (!pattern) {
      console.error("Error: build command requires a glob pattern");
      process.exit(1);
    }
    return {
      command: "build",
      pattern,
      output: args.includes("--out") ? args[args.indexOf("--out") + 1]! : "tskb.json",
      tsconfig: args.includes("--tsconfig")
        ? args[args.indexOf("--tsconfig") + 1]!
        : "tsconfig.json",
    };
  }

  if (command === "visualize") {
    const input = args[1];
    if (!input) {
      console.error("Error: visualize command requires an input JSON file");
      process.exit(1);
    }
    return {
      command: "visualize",
      input,
      output: args.includes("--out") ? args[args.indexOf("--out") + 1]! : "graph.dot",
    };
  }

  if (command === "query") {
    const input = args[1];
    const searchTerm = args[2];
    if (!input || !searchTerm) {
      console.error("Error: query command requires a graph file and search term");
      console.error('Usage: tskb query <graph.json> "<search-term>" [--verbose]');
      process.exit(1);
    }
    return {
      command: "query",
      input,
      searchTerm,
      verbose: args.includes("--verbose"),
    };
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const config = parseArgs(args);

  try {
    if (config.command === "build") {
      await build({ pattern: config.pattern, output: config.output, tsconfig: config.tsconfig });
    } else if (config.command === "visualize") {
      await visualize(config.input, config.output);
    } else if (config.command === "query") {
      await query(config.input, config.searchTerm, !config.verbose);
    }
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
