#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { createOmkitClient, type InspectOptions, type OmkitClient } from "../client/index.ts";

export interface Cli {
  command: string;
  target?: string;
  json: boolean;
  tsconfig: string;
  /** Set by `--help`/`-h` (the `help` command is carried on `command` instead). */
  help: boolean;
  /** The Node inspector, if requested via `--inspect[=port]`. */
  inspect?: InspectOptions;
}

/**
 * Pull the Node-style inspector flag out of argv, returning the options plus the remaining args.
 * Matches Node's own syntax: `--inspect`, `--inspect=PORT` (default port 9229); an explicit port
 * always wins.
 */
function extractInspect(argv: string[]): { inspect?: InspectOptions; rest: string[] } {
  let inspect: InspectOptions | undefined;
  const rest: string[] = [];
  for (const arg of argv) {
    const m = /^--inspect(?:=(\d+))?$/.exec(arg);
    if (!m) {
      rest.push(arg);
      continue;
    }
    const port = m[1] ? Number(m[1]) : (inspect?.port ?? 9229);
    inspect = { port };
  }
  return { inspect, rest };
}

/** Parse argv (without node/script) into a command, an optional target, and flags. */
export function parseCli(argv: string[]): Cli {
  // Inspector flags take an optional `=PORT`, which `parseArgs` can't express — pull them first.
  const { inspect, rest } = extractInspect(argv);
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      json: { type: "boolean", default: false },
      tsconfig: { type: "string", default: "tsconfig.omkit.json" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });
  return {
    command: positionals[0] ?? "run",
    target: positionals[1],
    json: Boolean(values.json),
    tsconfig: values.tsconfig as string,
    help: Boolean(values.help),
    inspect,
  };
}

/**
 * The `check` command: typecheck the project and render the diagnostics. The mapping is trivial
 * (one item per diagnostic) and the policy is local — **any diagnostic fails the command** (exit 1),
 * a clean project reports ok and exits 0.
 */
async function checkCommand(client: OmkitClient): Promise<void> {
  const { renderDiagnostics, withSpinner } = await import("./ui/Report.tsx");
  const diagnostics = await withSpinner("type-checking…", () => client.check());
  const n = diagnostics.length;
  const items = diagnostics.map((d) => ({
    head: `${path.basename(d.file)}:${d.line}`,
    detail: d.message,
  }));
  const title = n === 0 ? "no type errors" : `${n} type error${n === 1 ? "" : "s"}`;
  await renderDiagnostics(
    { kind: n === 0 ? "ok" : "error", title, items },
    n === 0 ? process.stdout : process.stderr
  );
  process.exitCode = n === 0 ? 0 : 1;
}

/** The bin entry: route to a lazily-imported command; owns stdout and the exit code. */
async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));

  // `--help`/`-h` or the `help` command short-circuits everything — no config or client needed.
  if (cli.help || cli.command === "help") {
    const { helpText } = await import("./commands/help.ts");
    console.log(helpText());
    return;
  }

  const inspect = cli.inspect;
  const client = createOmkitClient({ tsconfig: cli.tsconfig, inspect });

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
    await checkCommand(client);
    return;
  }
  if (cli.command === "run") {
    const { runCommand } = await import("./commands/run.ts");
    await runCommand(client, { target: cli.target, inspect: cli.inspect });
    return;
  }
  const { helpText } = await import("./commands/help.ts");
  console.error(`unknown command "${cli.command}"\n`);
  console.error(helpText());
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
