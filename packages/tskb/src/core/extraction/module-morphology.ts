import ts from "typescript";

export interface ModuleMorphology {
  summary: string; // "1 class, 3 functions, 2 types"
  morphology: string[]; // code stub lines — no \n, each line is its own array element
}

export interface ImportEntry {
  symbol: string; // e.g. "Foo", "* as ns", "*"
  path: string; // raw import path, e.g. "./bar.js"
  typeOnly: boolean; // true for `import type` declarations or inline `type` modifiers
}

export interface ModuleImports {
  imports: string[]; // "symbolName from \"path\"" display entries
  importEntries: ImportEntry[]; // structured entries for programmatic use
  importsSummary: string; // "5 imports from 3 paths"
}

type MemberKind = "class" | "function" | "type" | "interface" | "variable" | "enum";

/**
 * Extract module morphology as a code stub using the TypeScript type checker.
 *
 * Produces a collapsed code representation of all exports — classes with their
 * methods/properties, interfaces with their fields, function signatures, etc.
 * No implementation details are included.
 *
 * @param program - TypeScript program with type checker
 * @param resolvedPath - Absolute path to the source file
 * @returns Morphology with summary and code stub, or null if unavailable
 */
export function extractModuleMorphology(
  program: ts.Program,
  resolvedPath: string
): ModuleMorphology | null {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(resolvedPath);
  if (!sourceFile) return null;

  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return null;

  let exports: ts.Symbol[];
  try {
    exports = checker.getExportsOfModule(moduleSymbol);
  } catch {
    return null;
  }

  if (exports.length === 0) return null;

  const morphology: string[] = [];
  const counts = new Map<MemberKind, number>();
  let hasDefaultExport = false;

  for (const sym of exports) {
    const isDefault = sym.escapedName === "default";
    if (isDefault) hasDefaultExport = true;

    // Resolve aliases (re-exports)
    let resolved = sym;
    if (resolved.flags & ts.SymbolFlags.Alias) {
      try {
        resolved = checker.getAliasedSymbol(resolved);
      } catch {
        // Keep the alias if resolution fails
      }
    }

    const kind = classifySymbol(resolved);
    if (!kind) continue;

    if (!isDefault) {
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }

    try {
      const lines = renderExport(sym.name, kind, resolved, checker, sourceFile, isDefault);
      if (lines) morphology.push(...lines);
    } catch {
      // Best-effort: if rendering fails, add a simple declaration
      morphology.push(`export ${kind === "variable" ? "const" : kind} ${sym.name}`);
    }
  }

  if (morphology.length === 0 && exports.length === 0) return null;

  // Second pass: top-level non-exported declarations
  const exportedNames = new Set(exports.map((s) => s.escapedName as string));
  const internalLines = extractInternalDeclarations(sourceFile, checker, exportedNames, counts);
  if (internalLines.length > 0) {
    morphology.push("// — internal —");
    morphology.push(...internalLines);
  }

  if (morphology.length === 0) return null;

  // Build summary
  const kindOrder: MemberKind[] = ["class", "function", "interface", "type", "enum", "variable"];
  const kindPlurals: Record<MemberKind, string> = {
    class: "classes",
    function: "functions",
    type: "types",
    interface: "interfaces",
    variable: "variables",
    enum: "enums",
  };

  const parts: string[] = [];
  for (const k of kindOrder) {
    const count = counts.get(k);
    if (count) {
      parts.push(`${count} ${count === 1 ? k : kindPlurals[k]}`);
    }
  }
  if (hasDefaultExport) parts.push("1 default export");

  const summary = parts.length > 0 ? parts.join(", ") : `${morphology.length} exports`;

  return { summary, morphology };
}

/**
 * Render a single export symbol as code stub lines.
 * Simple exports return a single-element array.
 * Classes/interfaces return one element per line (header, each member, closing brace).
 */
function renderExport(
  name: string,
  kind: MemberKind,
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  isDefault: boolean
): string[] | null {
  const prefix = isDefault ? "export default " : "export ";

  let lines: string[] | null;
  switch (kind) {
    case "function":
      lines = [renderFunction(name, sym, checker, sourceFile, prefix)];
      break;
    case "class":
      lines = renderClass(name, sym, checker, sourceFile, prefix);
      break;
    case "interface":
      lines = renderInterface(name, sym, checker, sourceFile, prefix);
      break;
    case "type":
      lines = [renderTypeAlias(name, sym, checker, sourceFile, prefix)];
      break;
    case "enum":
      lines = [renderEnum(name, sym, checker, prefix)];
      break;
    case "variable":
      lines = [renderVariable(name, sym, checker, sourceFile, prefix)];
      break;
    default:
      return null;
  }

  if (lines && lines.length > 0) {
    const range = getDeclarationLineRange(sym, sourceFile);
    if (range !== undefined) {
      lines[0] = `${lines[0]} // :${range}`;
    }
  }

  return lines;
}

/**
 * Get the 1-based line range of a symbol's declaration in the given source file.
 * Returns "start-end" for multi-line declarations, or "start" for single-line.
 */
function getDeclarationLineRange(sym: ts.Symbol, sourceFile: ts.SourceFile): string | undefined {
  const decls = sym.getDeclarations();
  if (!decls) return undefined;

  for (const decl of decls) {
    if (decl.getSourceFile() === sourceFile) {
      return getNodeLineRange(decl, sourceFile);
    }
  }
  return undefined;
}

/**
 * Get the 1-based line range of an AST node in the given source file.
 */
function getNodeLineRange(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  if (node.getSourceFile() !== sourceFile) return undefined;
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return start === end ? `${start}` : `${start}-${end}`;
}

function renderFunction(
  name: string,
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  prefix: string
): string {
  const type = checker.getTypeOfSymbolAtLocation(sym, sourceFile);
  const signatures = type.getCallSignatures();
  if (signatures.length > 0) {
    const sig = checker.signatureToString(
      signatures[0],
      undefined,
      ts.TypeFormatFlags.WriteArrowStyleSignature
    );
    // sig looks like "(x: number) => void", split to get params and return
    const arrowIdx = sig.lastIndexOf(" => ");
    if (arrowIdx >= 0) {
      const params = sig.slice(0, arrowIdx);
      const ret = sig.slice(arrowIdx + 4);
      return `${prefix}function ${name}${params}: ${ret} {}`;
    }
    return `${prefix}function ${name}${sig} {}`;
  }
  return `${prefix}function ${name}() {}`;
}

/**
 * Render a single class member (property or method) as a code stub line.
 */
function renderMember(
  prop: ts.Symbol,
  prefix: string,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  lines: string[]
): void {
  const propType = checker.getTypeOfSymbolAtLocation(prop, sourceFile);
  const callSigs = propType.getCallSignatures();
  const range = getDeclarationLineRange(prop, sourceFile);
  const rangeComment = range ? ` // :${range}` : "";

  if (callSigs.length > 0) {
    // It's a method
    const sig = checker.signatureToString(
      callSigs[0],
      undefined,
      ts.TypeFormatFlags.WriteArrowStyleSignature
    );
    const arrowIdx = sig.lastIndexOf(" => ");
    if (arrowIdx >= 0) {
      const params = sig.slice(0, arrowIdx);
      const ret = sig.slice(arrowIdx + 4);
      lines.push(`  ${prefix}${prop.name}${params}: ${ret} {}${rangeComment}`);
    } else {
      lines.push(`  ${prefix}${prop.name}${sig} {}${rangeComment}`);
    }
  } else {
    // It's a property
    const typeStr = checker.typeToString(propType);
    lines.push(`  ${prefix}${prop.name}: ${typeStr}${rangeComment}`);
  }
}

function renderClass(
  name: string,
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  prefix: string
): string[] {
  const lines: string[] = [];
  lines.push(`${prefix}class ${name} {`);

  // Walk the class declaration AST directly so private members are included
  const decls = sym.getDeclarations();
  const classDecl = decls?.find(
    (d): d is ts.ClassDeclaration | ts.ClassExpression =>
      ts.isClassDeclaration(d) || ts.isClassExpression(d)
  );

  if (classDecl) {
    for (const member of classDecl.members) {
      renderClassMember(member, checker, sourceFile, lines);
    }
  } else {
    // Fallback: use type checker (won't include private members)
    const type = checker.getDeclaredTypeOfSymbol(sym);

    const constructSignatures = type.getConstructSignatures();
    if (constructSignatures.length > 0) {
      const sig = constructSignatures[0];
      const params = sig
        .getParameters()
        .map((p) => {
          const paramType = checker.getTypeOfSymbolAtLocation(p, sourceFile);
          return `${p.name}: ${checker.typeToString(paramType)}`;
        })
        .join(", ");
      const ctorDecl = sig.getDeclaration();
      const ctorRange = ctorDecl ? getNodeLineRange(ctorDecl, sourceFile) : undefined;
      const ctorComment = ctorRange ? ` // :${ctorRange}` : "";
      lines.push(`  constructor(${params}) {}${ctorComment}`);
    }

    const properties = type.getProperties();
    for (const prop of properties) {
      renderMember(prop, "", checker, sourceFile, lines);
    }

    const staticType = checker.getTypeOfSymbolAtLocation(sym, sourceFile);
    const staticProps = staticType.getProperties();
    for (const prop of staticProps) {
      if (["prototype", "length", "name", "arguments", "caller"].includes(prop.name)) continue;
      renderMember(prop, "static ", checker, sourceFile, lines);
    }
  }

  lines.push("}");
  return lines;
}

/**
 * Render a class member (constructor, method, property, accessor) from AST.
 * Includes private and protected members with appropriate modifiers.
 */
function renderClassMember(
  member: ts.ClassElement,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  lines: string[]
): void {
  // Skip index signatures and semicolons
  if (ts.isIndexSignatureDeclaration(member) || ts.isSemicolonClassElement(member)) return;

  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
  const modParts: string[] = [];

  if (modifiers) {
    for (const mod of modifiers) {
      switch (mod.kind) {
        case ts.SyntaxKind.PrivateKeyword:
          modParts.push("private");
          break;
        case ts.SyntaxKind.ProtectedKeyword:
          modParts.push("protected");
          break;
        case ts.SyntaxKind.PublicKeyword:
          modParts.push("public");
          break;
        case ts.SyntaxKind.StaticKeyword:
          modParts.push("static");
          break;
        case ts.SyntaxKind.ReadonlyKeyword:
          modParts.push("readonly");
          break;
        case ts.SyntaxKind.AbstractKeyword:
          modParts.push("abstract");
          break;
        case ts.SyntaxKind.OverrideKeyword:
          modParts.push("override");
          break;
      }
    }
  }

  const modStr = modParts.length > 0 ? modParts.join(" ") + " " : "";
  const range = getNodeLineRange(member, sourceFile);
  const rangeComment = range ? ` // :${range}` : "";

  if (ts.isConstructorDeclaration(member)) {
    const params = member.parameters
      .map((p) => {
        const sym = checker.getSymbolAtLocation(p.name);
        if (sym) {
          const paramType = checker.getTypeOfSymbolAtLocation(sym, sourceFile);
          return `${p.name.getText(sourceFile)}: ${checker.typeToString(paramType)}`;
        }
        return p.getText(sourceFile).replace(/\s*=\s*[^,)]+/, ""); // strip default value
      })
      .join(", ");
    lines.push(`  constructor(${params}) {}${rangeComment}`);
    return;
  }

  if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) {
    const memberName = getMemberName(member, sourceFile);
    if (!memberName) return;

    const sym = checker.getSymbolAtLocation(member.name);
    if (sym) {
      const propType = checker.getTypeOfSymbolAtLocation(sym, sourceFile);
      const callSigs = propType.getCallSignatures();
      if (callSigs.length > 0) {
        const sig = checker.signatureToString(
          callSigs[0],
          undefined,
          ts.TypeFormatFlags.WriteArrowStyleSignature
        );
        const arrowIdx = sig.lastIndexOf(" => ");
        if (arrowIdx >= 0) {
          const params = sig.slice(0, arrowIdx);
          const ret = sig.slice(arrowIdx + 4);
          lines.push(`  ${modStr}${memberName}${params}: ${ret} {}${rangeComment}`);
          return;
        }
        lines.push(`  ${modStr}${memberName}${sig} {}${rangeComment}`);
        return;
      }
    }
    lines.push(`  ${modStr}${memberName}() {}${rangeComment}`);
    return;
  }

  if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
    const memberName = getMemberName(member, sourceFile);
    if (!memberName) return;

    const sym = checker.getSymbolAtLocation(member.name);
    if (sym) {
      const propType = checker.getTypeOfSymbolAtLocation(sym, sourceFile);
      const typeStr = checker.typeToString(propType);
      lines.push(`  ${modStr}${memberName}: ${typeStr}${rangeComment}`);
    } else {
      lines.push(`  ${modStr}${memberName}${rangeComment}`);
    }
    return;
  }

  if (ts.isGetAccessorDeclaration(member)) {
    const memberName = getMemberName(member, sourceFile);
    if (!memberName) return;
    const sym = checker.getSymbolAtLocation(member.name);
    const typeStr = sym
      ? checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, sourceFile))
      : "unknown";
    lines.push(`  ${modStr}get ${memberName}(): ${typeStr} {}${rangeComment}`);
    return;
  }

  if (ts.isSetAccessorDeclaration(member)) {
    const memberName = getMemberName(member, sourceFile);
    if (!memberName) return;
    const param = member.parameters[0];
    const paramText = param ? param.getText(sourceFile).replace(/\s*=\s*[^,)]+/, "") : "value";
    lines.push(`  ${modStr}set ${memberName}(${paramText}) {}${rangeComment}`);
    return;
  }
}

function getMemberName(
  member: ts.ClassElement | ts.TypeElement,
  sourceFile: ts.SourceFile
): string | undefined {
  if (!member.name) return undefined;
  return member.name.getText(sourceFile);
}

function renderInterface(
  name: string,
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  prefix: string
): string[] {
  const type = checker.getDeclaredTypeOfSymbol(sym);
  const properties = type.getProperties();

  if (properties.length === 0) {
    return [`${prefix}interface ${name} {}`];
  }

  const lines: string[] = [];
  lines.push(`${prefix}interface ${name} {`);

  for (const prop of properties) {
    const propType = checker.getTypeOfSymbolAtLocation(prop, sourceFile);
    const callSigs = propType.getCallSignatures();
    const range = getDeclarationLineRange(prop, sourceFile);
    const rangeComment = range ? ` // :${range}` : "";

    if (callSigs.length > 0) {
      const sig = checker.signatureToString(
        callSigs[0],
        undefined,
        ts.TypeFormatFlags.WriteArrowStyleSignature
      );
      const arrowIdx = sig.lastIndexOf(" => ");
      if (arrowIdx >= 0) {
        const params = sig.slice(0, arrowIdx);
        const ret = sig.slice(arrowIdx + 4);
        lines.push(`  ${prop.name}${params}: ${ret}${rangeComment}`);
      } else {
        lines.push(`  ${prop.name}${sig}${rangeComment}`);
      }
    } else {
      const typeStr = checker.typeToString(propType);
      lines.push(`  ${prop.name}: ${typeStr}${rangeComment}`);
    }
  }

  lines.push("}");
  return lines;
}

function renderTypeAlias(
  name: string,
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  prefix: string
): string {
  // Try to get the type alias declaration to show the original definition
  const decls = sym.getDeclarations();
  if (decls) {
    for (const decl of decls) {
      if (ts.isTypeAliasDeclaration(decl) && decl.type) {
        const typeText = decl.type.getText(sourceFile);
        if (typeText.length <= 120) {
          return `${prefix}type ${name} = ${typeText}`;
        }
        return `${prefix}type ${name} = ${typeText.slice(0, 117)}...`;
      }
    }
  }

  // Fallback: use checker
  const type = checker.getDeclaredTypeOfSymbol(sym);
  const typeStr = checker.typeToString(type);
  return `${prefix}type ${name} = ${typeStr.length > 120 ? typeStr.slice(0, 117) + "..." : typeStr}`;
}

function renderEnum(name: string, sym: ts.Symbol, checker: ts.TypeChecker, prefix: string): string {
  const enumType = checker.getDeclaredTypeOfSymbol(sym);

  if (enumType.isUnion()) {
    const memberNames = enumType.types
      .map((t) => {
        const s = t.getSymbol();
        return s ? s.name : undefined;
      })
      .filter(Boolean);
    if (memberNames.length > 0 && memberNames.length <= 10) {
      return `${prefix}enum ${name} { ${memberNames.join(", ")} }`;
    }
    if (memberNames.length > 10) {
      return `${prefix}enum ${name} { ${memberNames.slice(0, 10).join(", ")}, ... }`;
    }
  }

  return `${prefix}enum ${name} { ... }`;
}

function renderVariable(
  name: string,
  sym: ts.Symbol,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  prefix: string
): string {
  const type = checker.getTypeOfSymbolAtLocation(sym, sourceFile);
  const typeStr = checker.typeToString(type);
  if (typeStr && typeStr !== "any" && typeStr.length <= 120) {
    return `${prefix}const ${name}: ${typeStr}`;
  }
  if (typeStr && typeStr.length > 120) {
    return `${prefix}const ${name}: ${typeStr.slice(0, 117)}...`;
  }
  return `${prefix}const ${name}`;
}

/**
 * Extract morphology for a single named export from a module file.
 *
 * Finds the specified export symbol by name and produces a code stub
 * and summary for just that export.
 *
 * @param program - TypeScript program with type checker
 * @param resolvedPath - Absolute path to the source file
 * @param exportName - Name of the export to extract morphology for
 * @returns Morphology with summary and code stub, or null if unavailable
 */
export function extractExportMorphology(
  program: ts.Program,
  resolvedPath: string,
  exportName: string
): ModuleMorphology | null {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(resolvedPath);
  if (!sourceFile) return null;

  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return null;

  let exports: ts.Symbol[];
  try {
    exports = checker.getExportsOfModule(moduleSymbol);
  } catch {
    return null;
  }

  // Find the specific export by name
  const sym = exports.find((s) => s.escapedName === exportName);
  if (!sym) return null;

  // Resolve aliases (re-exports)
  let resolved = sym;
  if (resolved.flags & ts.SymbolFlags.Alias) {
    try {
      resolved = checker.getAliasedSymbol(resolved);
    } catch {
      // Keep the alias if resolution fails
    }
  }

  const kind = classifySymbol(resolved);
  if (!kind) return null;

  try {
    const lines = renderExport(sym.name, kind, resolved, checker, sourceFile, false);
    if (!lines || lines.length === 0) return null;

    const summary = `1 ${kind}`;
    return { summary, morphology: lines };
  } catch {
    return null;
  }
}

/**
 * Extract import statements from a module file using AST traversal.
 *
 * Walks the source file for `ts.ImportDeclaration` nodes and captures
 * each imported symbol and its source path as `"symbolName from \"path\""`.
 *
 * @param program - TypeScript program
 * @param resolvedPath - Absolute path to the source file
 * @returns Import data with entries and summary, or null if no imports found
 */
export function extractModuleImports(
  program: ts.Program,
  resolvedPath: string
): ModuleImports | null {
  const sourceFile = program.getSourceFile(resolvedPath);
  if (!sourceFile) return null;

  const imports: string[] = [];
  const importEntries: ImportEntry[] = [];
  const paths = new Set<string>();

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isImportDeclaration(node)) return;

    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) return;

    const importPath = moduleSpecifier.text;
    paths.add(importPath);

    const importClause = node.importClause;
    if (!importClause) {
      // Side-effect import: import "path"
      imports.push(`* from "${importPath}"`);
      importEntries.push({ symbol: "*", path: importPath, typeOnly: false });
      return;
    }

    // `import type ...` makes the entire declaration type-only
    const declarationTypeOnly = importClause.isTypeOnly;

    // Default import: import Foo from "path"
    if (importClause.name) {
      const symbol = importClause.name.text;
      imports.push(`${symbol} from "${importPath}"`);
      importEntries.push({ symbol, path: importPath, typeOnly: declarationTypeOnly });
    }

    // Named imports: import { a, b } from "path"
    const namedBindings = importClause.namedBindings;
    if (namedBindings) {
      if (ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const symbol = element.name.text;
          imports.push(`${symbol} from "${importPath}"`);
          // inline `type` modifier: import { type Foo, Bar }
          importEntries.push({
            symbol,
            path: importPath,
            typeOnly: declarationTypeOnly || element.isTypeOnly,
          });
        }
      } else if (ts.isNamespaceImport(namedBindings)) {
        // Namespace import: import * as ns from "path"
        const symbol = `* as ${namedBindings.name.text}`;
        imports.push(`${symbol} from "${importPath}"`);
        importEntries.push({ symbol, path: importPath, typeOnly: declarationTypeOnly });
      }
    }
  });

  if (imports.length === 0) return null;

  const importsSummary = `${imports.length} import${imports.length !== 1 ? "s" : ""} from ${paths.size} path${paths.size !== 1 ? "s" : ""}`;

  return { imports, importEntries, importsSummary };
}

/**
 * Walk top-level source file statements and render any non-exported declarations —
 * functions, classes, interfaces, type aliases, enums, and variable declarations
 * that were not already captured by getExportsOfModule().
 *
 * Rendered lines are appended using the same render helpers as the export pass,
 * but without the `export` prefix. Counts map is updated in place.
 */
function extractInternalDeclarations(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  exportedNames: Set<string>,
  counts: Map<MemberKind, number>
): string[] {
  const lines: string[] = [];

  for (const stmt of sourceFile.statements) {
    // Skip anything with an export modifier — already handled by getExportsOfModule
    const modFlags = ts.canHaveModifiers(stmt)
      ? ts.getCombinedModifierFlags(stmt as ts.Declaration)
      : 0;
    if (modFlags & ts.ModifierFlags.Export) continue;

    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const name = stmt.name.text;
      if (exportedNames.has(name)) continue;
      const sym = checker.getSymbolAtLocation(stmt.name);
      if (!sym) continue;
      counts.set("function", (counts.get("function") || 0) + 1);
      const line = renderFunction(name, sym, checker, sourceFile, "");
      const range = getNodeLineRange(stmt, sourceFile);
      lines.push(range ? `${line} // :${range}` : line);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      const name = stmt.name.text;
      if (exportedNames.has(name)) continue;
      const sym = checker.getSymbolAtLocation(stmt.name);
      if (!sym) continue;
      counts.set("class", (counts.get("class") || 0) + 1);
      const rendered = renderClass(name, sym, checker, sourceFile, "");
      const range = getNodeLineRange(stmt, sourceFile);
      if (rendered.length > 0) {
        rendered[0] = range ? `${rendered[0]} // :${range}` : rendered[0];
        lines.push(...rendered);
      }
    } else if (ts.isInterfaceDeclaration(stmt)) {
      const name = stmt.name.text;
      if (exportedNames.has(name)) continue;
      const sym = checker.getSymbolAtLocation(stmt.name);
      if (!sym) continue;
      counts.set("interface", (counts.get("interface") || 0) + 1);
      const rendered = renderInterface(name, sym, checker, sourceFile, "");
      const range = getNodeLineRange(stmt, sourceFile);
      if (rendered.length > 0) {
        rendered[0] = range ? `${rendered[0]} // :${range}` : rendered[0];
        lines.push(...rendered);
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      const name = stmt.name.text;
      if (exportedNames.has(name)) continue;
      const sym = checker.getSymbolAtLocation(stmt.name);
      if (!sym) continue;
      counts.set("type", (counts.get("type") || 0) + 1);
      const line = renderTypeAlias(name, sym, checker, sourceFile, "");
      const range = getNodeLineRange(stmt, sourceFile);
      lines.push(range ? `${line} // :${range}` : line);
    } else if (ts.isEnumDeclaration(stmt)) {
      const name = stmt.name.text;
      if (exportedNames.has(name)) continue;
      const sym = checker.getSymbolAtLocation(stmt.name);
      if (!sym) continue;
      counts.set("enum", (counts.get("enum") || 0) + 1);
      const line = renderEnum(name, sym, checker, "");
      const range = getNodeLineRange(stmt, sourceFile);
      lines.push(range ? `${line} // :${range}` : line);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        if (exportedNames.has(name)) continue;
        const sym = checker.getSymbolAtLocation(decl.name);
        if (!sym) continue;
        counts.set("variable", (counts.get("variable") || 0) + 1);
        const line = renderVariable(name, sym, checker, sourceFile, "");
        const range = getNodeLineRange(decl, sourceFile);
        lines.push(range ? `${line} // :${range}` : line);
      }
    }
  }

  return lines;
}

/**
 * Classify a symbol into a MemberKind based on its flags.
 */
function classifySymbol(sym: ts.Symbol): MemberKind | null {
  const flags = sym.flags;

  if (flags & ts.SymbolFlags.Class) return "class";
  if (flags & ts.SymbolFlags.Function) return "function";
  if (flags & ts.SymbolFlags.Interface) return "interface";
  if (flags & ts.SymbolFlags.TypeAlias) return "type";
  if (flags & ts.SymbolFlags.Enum) return "enum";
  if (flags & ts.SymbolFlags.Variable) return "variable";
  if (flags & ts.SymbolFlags.Method) return "function";

  return null;
}
