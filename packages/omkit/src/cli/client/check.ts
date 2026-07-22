import ts from "typescript";
import path from "node:path";
import type { Diagnostic } from "./types.ts";

/** Typecheck the project (`tsc --noEmit`) and return per-file diagnostics. */
export function runCheck(tsconfigPath: string): Diagnostic[] {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    return [{ file: tsconfigPath, line: 0, message: msg(configFile.error) }];
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  const fileSet = new Set(parsed.fileNames.map((f) => path.normalize(f)));
  const out: Diagnostic[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!fileSet.has(path.normalize(sf.fileName))) continue;
    for (const d of [
      ...program.getSyntacticDiagnostics(sf),
      ...program.getSemanticDiagnostics(sf),
    ]) {
      const line = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      out.push({ file: sf.fileName, line, message: msg(d) });
    }
  }
  return out;
}

function msg(d: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(d.messageText, "\n");
}
