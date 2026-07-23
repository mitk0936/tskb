#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { createOmkitClient } from "./client/index.ts";

export interface Cli {
  command: string;
  target?: string;
  json: boolean;
  tsconfig: string;
}

/** Parse argv (without node/script) into a command, an optional target, and flags. */
export function parseCli(argv: string[]): Cli {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
      tsconfig: { type: "string", default: "tsconfig.omkit.json" },
    },
    allowPositionals: true,
  });
  return {
    command: positionals[0] ?? "run",
    target: positionals[1],
    json: Boolean(values.json),
    tsconfig: values.tsconfig as string,
  };
}

/** The bin entry: route to a lazily-imported command; owns stdout and the exit code. */
async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const client = createOmkitClient({ tsconfig: cli.tsconfig });

  if (cli.command === "init") {
    const { scaffold } = await import("./commands/init.ts");
    const { created, skipped } = scaffold(process.cwd());
    for (const f of created) console.log(`created ${f}`);
    for (const f of skipped) console.log(`exists, skipped ${f}`);
    return;
  }
  if (cli.command === "ls") {
    const { formatRegistry } = await import("./commands/ls.ts");
    console.log(formatRegistry(await client.discover(), { json: cli.json }));
    return;
  }
  if (cli.command === "check") {
    const { formatDiagnostics } = await import("./commands/check.ts");
    const { text, code } = formatDiagnostics(await client.check());
    console.log(text);
    process.exitCode = code;
    return;
  }
  if (cli.command === "run") {
    // No target → open the interactive picker (browse/search oms, run one with live output).
    // A bare `omkit` lands here too, since `run` is the default command.
    if (!cli.target) {
      const { launchUi } = await import("./commands/ui.tsx");
      launchUi(client);
      return;
    }
    const { resolveOm } = await import("./commands/run.ts");
    const { spawnBare } = await import("./client/runner.ts");
    const registry = await client.discover();
    const omFile = resolveOm(cli.target, registry, process.cwd());
    if (!omFile) {
      const known = registry.oms.map((o) => o.name).join(", ");
      console.error(`no om matches "${cli.target}". Known oms: ${known}`);
      process.exitCode = 1;
      return;
    }
    process.on("SIGINT", () => {}); // let the child tear down; don't die first
    process.exitCode = await spawnBare(omFile, { cwd: path.dirname(omFile) });
    return;
  }
  console.error(`unknown command "${cli.command}"`);
  process.exitCode = 1;
}

/**
 * True when this module is the process entry point — not when a test imports `parseCli`.
 * Compares real paths so it holds even when invoked through the `.bin` symlink (where
 * `process.argv[1]` is the link, not the resolved file).
 */
function isEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) void main();
