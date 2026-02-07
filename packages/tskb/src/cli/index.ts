#!/usr/bin/env node

/**
 * tskb CLI - TypeScript Semantic Knowledge Base
 *
 * Main entry point for the CLI tool.
 * Handles command parsing and routing.
 */

import { build } from "./commands/build.js";
import { select } from "./commands/select.js";
import { describe } from "./commands/describe.js";
import { ls } from "./commands/ls.js";
import { printHelpAndExit } from "./utils/help.js";

/**
 * Parse command line arguments
 */
function parseArgs(
  args: string[]
):
  | { command: "build"; pattern: string; tsconfig: string }
  | { command: "select"; searchTerm: string; folderId: string; verbose: boolean }
  | { command: "describe"; folderId: string }
  | { command: "ls"; depth: number } {
  const command = args[0];

  if (!command) {
    printHelpAndExit();
  }

  // If first arg doesn't look like a command, assume it's the old "build" usage
  if (command.includes("*") || command.includes("/")) {
    return {
      command: "build",
      pattern: command,
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
      tsconfig: args.includes("--tsconfig")
        ? args[args.indexOf("--tsconfig") + 1]!
        : "tsconfig.json",
    };
  }

  if (command === "select") {
    const searchTerm = args[1];
    const folderId = args[2];
    if (!searchTerm || !folderId) {
      console.error("Error: select command requires a search term and folder ID");
      console.error('Usage: tskb select "<search-term>" "<folder-id>" [--verbose]');
      process.exit(1);
    }
    return {
      command: "select",
      searchTerm,
      folderId,
      verbose: args.includes("--verbose"),
    };
  }

  if (command === "describe") {
    const folderId = args[1];
    if (!folderId) {
      console.error("Error: describe command requires a folder ID");
      console.error('Usage: tskb describe "<folder-id>"');
      process.exit(1);
    }
    return {
      command: "describe",
      folderId,
    };
  }

  if (command === "ls") {
    const depth = args.includes("--depth") ? parseInt(args[args.indexOf("--depth") + 1]!, 10) : 1;
    return {
      command: "ls",
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
      await build({ pattern: config.pattern, tsconfig: config.tsconfig });
    } else if (config.command === "select") {
      await select(config.searchTerm, config.folderId, !config.verbose);
    } else if (config.command === "describe") {
      await describe(config.folderId);
    } else if (config.command === "ls") {
      await ls(config.depth);
    }
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
