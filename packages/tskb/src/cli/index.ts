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
import { docs } from "./commands/docs.js";
import { init } from "./commands/init.js";
import { printHelpAndExit } from "./utils/help.js";
import { configure, error } from "./utils/logger.js";

/** Parses argv into positionals + typed option values. */
function parseCliArgs() {
  return parseArgs({
    args: process.argv.slice(2),
    options: {
      tsconfig: { type: "string", default: "tsconfig.json" },
      project: { type: "string" },
      depth: { type: "string", default: "1" },
      verbose: { type: "boolean", default: false },
      optimized: { type: "boolean", default: false },
      plain: { type: "boolean", default: false },
      yes: { type: "boolean", default: false, short: "y" },
      // registry options
      type: { type: "string" },
      // explore options
      port: { type: "string", default: "4442" },
      "no-open": { type: "boolean", default: false },
      export: { type: "string" },
      // build watch mode
      watch: { type: "boolean", default: false },
      "watch-path": { type: "string", multiple: true },
    },
    allowPositionals: true,
  });
}

type CliValues = ReturnType<typeof parseCliArgs>["values"];

/** A command handler: receives the positionals after the command name + option values. */
type CommandHandler = (args: string[], values: CliValues) => Promise<void>;

/**
 * Returns `value`, or prints the given error lines and exits when it's missing.
 * Lets each handler assert its required positional in one expression.
 */
function requireArg(value: string | undefined, ...errorLines: string[]): string {
  if (!value) {
    for (const line of errorLines) error(line);
    process.exit(1);
  }
  return value;
}

/** `build` (and its `--watch` variant) — validates the glob pattern and project name. */
async function runBuild(args: string[], values: CliValues): Promise<void> {
  const pattern = requireArg(args[0], "Error: build command requires a glob pattern");
  if (!values.project) {
    error("Error: build command requires --project <name>");
    process.exit(1);
  }
  const config = { pattern, tsconfig: values.tsconfig!, projectName: values.project };

  if (values.watch) {
    const { watch } = await import("./commands/watch.js");
    await watch(config, values["watch-path"] ?? []);
  } else {
    const { build } = await import("./commands/build.js");
    await build(config);
  }
}

/** Command name → handler. Routing is a lookup; each handler owns its own validation. */
const COMMANDS: Record<string, CommandHandler> = {
  build: runBuild,
  search: async (args, v) =>
    search(
      requireArg(args[0], "Error: search command requires a query", 'Usage: tskb search "<query>"'),
      v.optimized!,
      v.plain!
    ),
  pick: async (args, v) =>
    pick(
      requireArg(
        args[0],
        "Error: pick command requires an identifier",
        'Usage: tskb pick "<identifier>"'
      ),
      v.optimized!,
      v.plain!
    ),
  ls: async (_args, v) => ls(parseInt(v.depth!, 10), v.optimized!, v.plain!),
  context: async (args, v) =>
    context(
      requireArg(
        args[0],
        "Error: context command requires an identifier",
        'Usage: tskb context "<identifier>" [--depth <n>]'
      ),
      parseInt(v.depth!, 10),
      v.optimized!,
      v.plain!
    ),
  docs: async (args, v) => docs(args[0], v.optimized!, v.plain!),
  flows: async (args, v) => {
    const { flows } = await import("./commands/flows.js");
    await flows(args[0], v.optimized!, v.plain!);
  },
  registry: async (args, v) => {
    const { registry } = await import("./commands/registry.js");
    await registry(args[0], { type: v.type }, v.optimized!, v.plain!);
  },
  init: async (_args, v) => init({ yes: v.yes }),
  explore: async (_args, v) => {
    const { explore } = await import("./commands/explore.js");
    await explore({
      port: parseInt(v.port!, 10),
      open: !v["no-open"],
      exportPath: v.export,
    });
  },
};

/**
 * Main CLI entry point: parse args, resolve the command, dispatch.
 */
async function main() {
  const { positionals, values } = parseCliArgs();
  configure({ verbose: values.verbose! });

  const command = positionals[0];
  if (!command) printHelpAndExit();

  // A bare glob (containing `*` or `/`) is shorthand for `build <glob>`; there the
  // glob is the first positional, so the whole list is the build command's args.
  const isGlob = command.includes("*") || command.includes("/");
  const name = isGlob ? "build" : command;
  const args = isGlob ? positionals : positionals.slice(1);

  const handler = COMMANDS[name];
  if (!handler) {
    error(`Unknown command: ${command}`);
    process.exit(1);
  }

  try {
    await handler(args, values);
  } catch (err) {
    error("❌ Error: " + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

main();
