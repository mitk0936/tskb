import fs from "node:fs";
import path from "node:path";
import { renderDiagnostics, withSpinner } from "../ui/Report.tsx";
import type { Registry } from "../../client/registry.ts";
import type { OmkitClient, InspectOptions } from "../../client/index.ts";

/**
 * Report an actionable "nothing to run" panel when discovery finds no oms. Names the config file
 * omkit actually read (absolute, so the tsconfig.omkit.json-vs-tsconfig.json confusion goes away),
 * lists any config warnings (e.g. TypeScript's "no inputs found" with the offending globs), and
 * points at the usual cause: an `include` that doesn't reach the om files.
 */
export function reportNoOms(tsconfig: string, registry: Registry): Promise<void> {
  return renderDiagnostics({
    kind: "warning",
    title: "no oms found",
    subtitle: `config: ${path.resolve(tsconfig)}`,
    items: registry.warnings.map((w) => ({ head: "", detail: w })),
    hint:
      "Check the config's `include` — it must reach your om files, and a glob only recurses " +
      'with `**` (e.g. "src/**/*.ts", not "src/*.ts").',
  });
}

/**
 * Resolve a `run` argument to an absolute om file: an existing file path (relative to `cwd`)
 * wins; otherwise match a discovered om by name. Returns undefined when nothing matches.
 */
export function resolveOm(
  arg: string,
  registry: { oms: { name: string; file: string }[] },
  cwd: string
): string | undefined {
  const asPath = path.resolve(cwd, arg);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) return asPath;
  return registry.oms.find((o) => o.name === arg)?.file;
}

/**
 * Tell the user where the inspector will be. The om runs in a forked child, so the inspector is on
 * that child — never on the omkit process. In the interactive picker the child (and the port) only
 * exists once an om is chosen; a bare run forks it immediately.
 */
function announceInspect(inspect: InspectOptions, interactive: boolean): void {
  const p = inspect.port;
  const run = interactive ? "the om you pick runs" : "the om runs";
  console.log(
    `omkit: ${run} in a forked child with the inspector on :${p} — attach a debugger to that child, not to omkit itself (--inspect).`
  );
}

/**
 * The `run` command. With no target, open the interactive picker (a bare `omkit` lands here too,
 * since `run` is the default command); otherwise resolve the target om and run it bare, inheriting
 * the terminal. Reaches the engine only through the {@link OmkitClient} interface. Sets
 * `process.exitCode` on failure or from the child's exit code.
 */
export async function runCommand(
  client: OmkitClient,
  opts: { target?: string; inspect?: InspectOptions }
): Promise<void> {
  const { target, inspect } = opts;
  if (!target) {
    // Announce before Ink takes the terminal, so the notice isn't swallowed by the live UI —
    // the supervised child's own inspector banner goes to a piped stream nobody sees. launchUi is
    // lazy-loaded to keep the run.ts↔ui.tsx dependency out of module init (ui.tsx imports reportNoOms).
    if (inspect) announceInspect(inspect, true);
    const { launchUi } = await import("./ui.tsx");
    await launchUi(client);
    return;
  }
  const registry = await withSpinner("discovering…", () => client.discover());
  if (registry.oms.length === 0) {
    await reportNoOms(client.tsconfig, registry);
    process.exitCode = 1;
    return;
  }
  const omFile = resolveOm(target, registry, process.cwd());
  if (!omFile) {
    const known = registry.oms.map((o) => o.name).join(", ");
    console.error(`no om matches "${target}". Known oms: ${known}`);
    process.exitCode = 1;
    return;
  }
  if (inspect) announceInspect(inspect, false);
  process.on("SIGINT", () => {}); // let the child tear down; don't die first
  process.exitCode = await client.runBare(omFile, { cwd: path.dirname(omFile) });
}
