import fs from "node:fs";
import path from "node:path";

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
