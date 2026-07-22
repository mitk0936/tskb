import path from "node:path";
import type { Diagnostic } from "../client/types.ts";

/** Format typecheck diagnostics into terminal text plus a process exit code. */
export function formatDiagnostics(diagnostics: Diagnostic[]): { text: string; code: number } {
  if (diagnostics.length === 0) {
    return { text: "no type errors", code: 0 };
  }
  const lines = diagnostics.map((d) => `${path.basename(d.file)}:${d.line}  ${d.message}`);
  lines.push("");
  lines.push(`${diagnostics.length} error${diagnostics.length === 1 ? "" : "s"}`);
  return { text: lines.join("\n"), code: 1 };
}
