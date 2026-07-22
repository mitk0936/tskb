import ts from "typescript";
import path from "node:path";
import type { Registry, DiscoveredOm, DiscoveredAction } from "./registry.ts";

/** Local binding names imported from "omkit" (handles `import { om as run } from "omkit"`). */
interface OmkitNames {
  om?: string;
  step?: string;
  action?: string;
}

/**
 * Statically scan the project described by `tsconfigPath` for runnable oms and inspectable
 * actions. Never throws for user-code problems — type errors become `warnings`, and whatever
 * parsed is still returned (so an editor-in-progress project stays useful).
 */
export function discover(tsconfigPath: string): Registry {
  const oms: DiscoveredOm[] = [];
  const actions: DiscoveredAction[] = [];
  const warnings: string[] = [];

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    warnings.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
    return { oms, actions, warnings };
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

  for (const sf of program.getSourceFiles()) {
    if (!fileSet.has(path.normalize(sf.fileName))) continue;

    for (const d of program.getSemanticDiagnostics(sf)) warnings.push(formatDiagnostic(d));

    const names = omkitImports(sf);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === names.om || node.expression.text === names.step)
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) {
          oms.push({ name: arg.text, file: sf.fileName, line: lineOf(sf, node) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt) || !isExported(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
        const info = actionChain(decl.initializer, names.action);
        if (info) {
          actions.push({
            name: info.name,
            file: sf.fileName,
            exportName: decl.name.text,
            publishesCapability: info.ref,
            events: info.emits,
          });
        }
      }
    }
  }

  return { oms, actions, warnings };
}

/** Collect the local names bound to om/step/action from `import … from "omkit"`. */
function omkitImports(sf: ts.SourceFile): OmkitNames {
  const names: OmkitNames = {};
  for (const stmt of sf.statements) {
    if (!isOmkitImport(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) bindName(names, el);
  }
  return names;
}

/** True for `import … from "omkit"`. */
function isOmkitImport(stmt: ts.Statement): stmt is ts.ImportDeclaration {
  return (
    ts.isImportDeclaration(stmt) &&
    ts.isStringLiteral(stmt.moduleSpecifier) &&
    stmt.moduleSpecifier.text === "omkit"
  );
}

/** Record the local binding for an imported `om` / `step` / `action` specifier. */
function bindName(names: OmkitNames, el: ts.ImportSpecifier): void {
  const imported = (el.propertyName ?? el.name).text;
  if (imported === "om") names.om = el.name.text;
  else if (imported === "step") names.step = el.name.text;
  else if (imported === "action") names.action = el.name.text;
}

/**
 * Walk a builder chain (`action("x").emits<…>().ref<…>().run(fn)`) from the outer call down to
 * the base `action("name")` call, noting whether `.ref` / `.emits` appear. Returns undefined
 * when the chain is not rooted in the local `action` binding with a string-literal name.
 */
function actionChain(
  expr: ts.Node,
  actionName: string | undefined
): { name: string; ref: boolean; emits: boolean } | undefined {
  if (actionName === undefined) return undefined;
  let ref = false;
  let emits = false;
  let node: ts.Node = expr;
  while (ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "ref") ref = true;
      if (method === "emits") emits = true;
      node = node.expression.expression;
      continue;
    }
    if (ts.isIdentifier(node.expression) && node.expression.text === actionName) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) return { name: arg.text, ref, emits };
    }
    return undefined;
  }
  return undefined;
}

function isExported(stmt: ts.VariableStatement): boolean {
  return Boolean(stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function formatDiagnostic(d: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file && d.start !== undefined) {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${path.basename(d.file.fileName)}:${line + 1} ${message}`;
  }
  return message;
}
