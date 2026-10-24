import ts from "typescript";
import path from "node:path";
import type { Diagnostic } from "./types.ts";
import { checkedProgram } from "./tsCache.ts";

/** Typecheck the project (`tsc --noEmit`) and return per-file diagnostics. */
export function runCheck(tsconfigPath: string): Diagnostic[] {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    return [{ file: tsconfigPath, line: 0, message: msg(configFile.error) }];
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.resolve(path.dirname(tsconfigPath))
  );
  const checked = checkedProgram(parsed, tsconfigPath);
  const program = checked.program;
  const canonical = (f: string): string =>
    ts.sys.useCaseSensitiveFileNames ? path.normalize(f) : path.normalize(f).toLowerCase();
  const fileSet = new Set(parsed.fileNames.map((f) => canonical(f)));
  const out: Diagnostic[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!fileSet.has(canonical(sf.fileName))) continue;
    for (const d of [...program.getSyntacticDiagnostics(sf), ...checked.semanticDiagnostics(sf)]) {
      const line = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      out.push({ file: sf.fileName, line, message: msg(d) });
    }
  }
  checked.save();
  return out;
}

function msg(d: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(d.messageText, "\n");
}
