#!/usr/bin/env node

/**
 * tskb CLI - TypeScript Semantic Knowledge Base
 *
 * Main entry point for the CLI tool.
 * Handles command parsing and routing.
 */

import { build } from "./commands/build.js";
import { visualize } from "./commands/visualize.js";
import { select } from "./commands/select.js";
import { describe } from "./commands/describe.js";
import { ls } from "./commands/ls.js";

/**
 * Parse command line arguments
 */
function parseArgs(
  args: string[]
):
  | { command: "build"; pattern: string; output: string; tsconfig: string }
  | { command: "visualize"; input: string; output: string }
  | { command: "select"; input: string; searchTerm: string; folderId: string; verbose: boolean }
  | { command: "describe"; input: string; folderId: string }
  | { command: "ls"; input: string; depth: number } {
  const command = args[0];

  if (!command) {
    console.error("Usage:");
    console.error("  tskb build <glob> --out <file> --tsconfig <path>");
    console.error("  tskb visualize <graph.json> --out <file.dot>");
    console.error("  tskb select <graph.json> <search-term> <folder-id> [--verbose]");
    console.error("  tskb describe <graph.json> <folder-id>");
    console.error("  tskb ls <graph.json> [--depth <n>]");
    console.error("");
    console.error("Examples:");
    console.error('  tskb build "src/**/*.tsx" --out graph.json --tsconfig ./tsconfig.json');
    console.error("  tskb visualize tskb.json --out graph.dot");
    console.error('  tskb select tskb.json "auth" "tskb.cli"    # Scoped select (concise)');
    console.error('  tskb select tskb.json "auth" "Package.Root" --verbose # Full context');
    console.error('  tskb describe tskb.json "tskb.cli"         # Describe folder by ID');
    console.error('  tskb describe tskb.json "Package.Root"     # Describe root folder');
    console.error("  tskb ls tskb.json                          # List all folders (depth=1)");
    console.error("  tskb ls tskb.json --depth 2                # List folders up to depth 2");
    console.error("  tskb ls tskb.json --depth -1               # List all folders (unlimited)");
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

  if (command === "select") {
    const input = args[1];
    const searchTerm = args[2];
    const folderId = args[3];
    if (!input || !searchTerm || !folderId) {
      console.error("Error: select command requires a graph file, search term, and folder ID");
      console.error('Usage: tskb select <graph.json> "<search-term>" "<folder-id>" [--verbose]');
      process.exit(1);
    }
    return {
      command: "select",
      input,
      searchTerm,
      folderId,
      verbose: args.includes("--verbose"),
    };
  }

  if (command === "describe") {
    const input = args[1];
    const folderId = args[2];
    if (!input || !folderId) {
      console.error("Error: describe command requires a graph file and folder ID");
      console.error('Usage: tskb describe <graph.json> "<folder-id>"');
      process.exit(1);
    }
    return {
      command: "describe",
      input,
      folderId,
    };
  }

  if (command === "ls") {
    const input = args[1];
    if (!input) {
      console.error("Error: ls command requires a graph file");
      console.error("Usage: tskb ls <graph.json> [--depth <n>]");
      process.exit(1);
    }
    const depth = args.includes("--depth") ? parseInt(args[args.indexOf("--depth") + 1]!, 10) : 1;
    return {
      command: "ls",
      input,
      depth,
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
    } else if (config.command === "select") {
      await select(config.input, config.searchTerm, config.folderId, !config.verbose);
    } else if (config.command === "describe") {
      await describe(config.input, config.folderId);
    } else if (config.command === "ls") {
      await ls(config.input, config.depth);
    }
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
