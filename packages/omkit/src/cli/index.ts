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
    const { withSpinner } = await import("./ui/Report.tsx");
    const registry = await withSpinner("discovering…", () => client.discover());
    console.log(formatRegistry(registry, { json: cli.json }));
    return;
  }
  if (cli.command === "check") {
    const { checkReport } = await import("./commands/check.ts");
    const { renderDiagnostics, withSpinner } = await import("./ui/Report.tsx");
    const diagnostics = await withSpinner("type-checking…", () => client.check());
    const { title, items, code } = checkReport(diagnostics);
    // Type errors fail the command (exit 1); a clean project reports ok and exits 0.
    await renderDiagnostics(
      { kind: code === 0 ? "ok" : "error", title, items },
      code === 0 ? process.stdout : process.stderr
    );
    process.exitCode = code;
    return;
  }
  if (cli.command === "run") {
    // No target → open the interactive picker (browse/search oms, run one with live output).
    // A bare `omkit` lands here too, since `run` is the default command.
    if (!cli.target) {
      const { launchUi } = await import("./commands/ui.tsx");
      await launchUi(client, cli.tsconfig);
      return;
    }
    const { resolveOm, reportNoOms } = await import("./commands/run.ts");
    const { spawnBare } = await import("./client/runner.ts");
    const { withSpinner } = await import("./ui/Report.tsx");
    const registry = await withSpinner("discovering…", () => client.discover());
    if (registry.oms.length === 0) {
      await reportNoOms(cli.tsconfig, registry);
      process.exitCode = 1;
      return;
    }
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

/** Print a fatal error to stderr in one consistent shape, just before the process exits non-zero. */
function reportFatal(err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`\nomkit: ${detail}\n`);
}

if (isEntryPoint()) {
  // Nothing should fail silently. A fatal anywhere — a bad config, an uncaught throw, or a rejected
  // promise in the interactive app — prints and crashes the CLI with a non-zero exit code.
  //
  // The controlled path (a rejection from `main`, e.g. a bad tsconfig) gets the pretty Ink panel;
  // the last-resort sync handlers stay plain, since the process may be mid-crash and can't await.
  process.on("uncaughtException", (err) => {
    reportFatal(err);
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    reportFatal(err);
    process.exit(1);
  });
  main().catch(async (err) => {
    const { renderDiagnostics } = await import("./ui/Report.tsx");
    const message = err instanceof Error ? err.message : String(err);
    // Keep the panel clean by default (a bad tsconfig needs no stack); set OMKIT_DEBUG for the trace.
    const stack =
      process.env.OMKIT_DEBUG && err instanceof Error && err.stack
        ? err.stack.split("\n").slice(1).join("\n")
        : undefined;
    await renderDiagnostics({ kind: "error", title: message, hint: stack });
    process.exit(1);
  });
}
