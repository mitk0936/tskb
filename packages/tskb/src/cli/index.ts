#!/usr/bin/env node

/**
 * tskb CLI - TypeScript Semantic Knowledge Base
 *
 * Main entry point for the CLI tool.
 * Handles command parsing and routing.
 */

import { parseArgs } from "node:util";
import { search } from "./commands/search.js";
import { pick } from "./commands/pick.js";
import { ls } from "./commands/ls.js";
import { context } from "./commands/context.js";
import { printHelpAndExit } from "./utils/help.js";

/**
 * Main CLI entry point
 */
async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      tsconfig: { type: "string", default: "tsconfig.json" },
      depth: { type: "string", default: "1" },
    },
    allowPositionals: true,
  });

  // If first arg looks like a glob, treat it as the old "build" usage
  const command = positionals[0];
  if (!command) printHelpAndExit();
  const resolvedCommand = command.includes("*") || command.includes("/") ? "build" : command;

  try {
    switch (resolvedCommand) {
      case "build": {
        const pattern = resolvedCommand === command ? positionals[1] : command;
        if (!pattern) {
          console.error("Error: build command requires a glob pattern");
          process.exit(1);
        }
        const { build } = await import("./commands/build.js");
        await build({ pattern, tsconfig: values.tsconfig! });
        break;
      }
      case "search": {
        const query = positionals[1];
        if (!query) {
          console.error("Error: search command requires a query");
          console.error('Usage: tskb search "<query>"');
          process.exit(1);
        }
        await search(query);
        break;
      }
      case "pick": {
        const identifier = positionals[1];
        if (!identifier) {
          console.error("Error: pick command requires an identifier");
          console.error('Usage: tskb pick "<identifier>"');
          process.exit(1);
        }
        await pick(identifier);
        break;
      }
      case "ls": {
        await ls(parseInt(values.depth!, 10));
        break;
      }
      case "context": {
        const identifier = positionals[1];
        if (!identifier) {
          console.error("Error: context command requires an identifier");
          console.error('Usage: tskb context "<identifier>" [--depth <n>]');
          process.exit(1);
        }
        await context(identifier, parseInt(values.depth!, 10));
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
