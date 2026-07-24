import fs from "node:fs";
import path from "node:path";
import { renderDiagnostics } from "../ui/Report.tsx";
import type { Registry } from "../client/registry.ts";

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
