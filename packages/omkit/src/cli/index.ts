#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
    command: positionals[0] ?? "ui",
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
    if (!cli.target) {
      console.error("usage: omkit run <om file | om name>");
      process.exitCode = 1;
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
  // "ui" (and bare `omkit`) is delivered in Plan C.
  console.error(`the "${cli.command}" command is not available yet`);
  process.exitCode = 1;
}

// Run main() only when executed as the bin, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
