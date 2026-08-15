import path from "node:path";
import { fileURLToPath } from "node:url";
import { omHash } from "../foundation/ids.ts";
import { fsSafe } from "../foundation/fsSafe.ts";

/**
 * The name the host om runs under: `<action>@<hash8 of the action's defining file>`.
 *
 * Shared by the host (which passes it to `om(...)`) and the server (which has to predict
 * the resulting folder before the run exists). One function so the two cannot drift —
 * they are the same rule applied from opposite sides of a fork.
 */
export function hostOmName(action: string, actionFile: string): string {
  return `${action}@${omHash(action, actionFile)}`;
}

/**
 * Absolute path of the shipped action host, with the extension this build actually uses —
 * `.ts` under tsx and vitest, `.js` once compiled. `rewriteRelativeImportExtensions`
 * rewrites import specifiers; this path is data (a fork target), so it does not.
 */
export function hostFile(): string {
  const here = fileURLToPath(import.meta.url);
  return path.join(path.dirname(here), `action-host${path.extname(here)}`);
}

/**
 * Where a hosted action's runs land: `<fsSafe(hostName)>-<hash8>`.
 *
 * Derived rather than observed, because `start_om` has to answer before the child has
 * created anything. It reproduces `RunFolder.name()` exactly — including `fsSafe`, which
 * collapses the `@` to a `-`, so the folder reads `seed-a1b2c3d4-<hash8>`. A test pins
 * this against a real run: if the derivation ever drifts from the runtime, it fails.
 */
export function hostFolderName(action: string, actionFile: string): string {
  const hostName = hostOmName(action, actionFile);
  return `${fsSafe(hostName)}-${omHash(hostName, hostFile())}`;
}
