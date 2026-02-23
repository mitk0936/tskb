import ts from "typescript";

export interface ModuleMorphology {
  summary: string; // "1 class, 3 functions, 2 types"
  morphology: string[]; // code stub lines — no \n, each line is its own array element
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

  switch (kind) {
    case "function":
      return [renderFunction(name, sym, checker, sourceFile, prefix)];
    case "class":
      return renderClass(name, sym, checker, sourceFile, prefix);
    case "interface":
      return renderInterface(name, sym, checker, sourceFile, prefix);
    case "type":
      return [renderTypeAlias(name, sym, checker, sourceFile, prefix)];
    case "enum":
      return [renderEnum(name, sym, checker, prefix)];
    case "variable":
      return [renderVariable(name, sym, checker, sourceFile, prefix)];
    default:
      return null;
  }
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
      return `${prefix}function ${name}${params}: ${ret}`;
    }
    return `${prefix}function ${name}${sig}`;
  }
  return `${prefix}function ${name}()`;
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

  const type = checker.getDeclaredTypeOfSymbol(sym);

  // Constructor
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
    lines.push(`  constructor(${params})`);
  }

  // Properties and methods from the instance type
  const properties = type.getProperties();
  for (const prop of properties) {
    // Skip private/internal members (starting with _ or #)
    if (prop.name.startsWith("_") || prop.name.startsWith("#")) continue;

    const propType = checker.getTypeOfSymbolAtLocation(prop, sourceFile);
    const callSigs = propType.getCallSignatures();

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
        lines.push(`  ${prop.name}${params}: ${ret}`);
      } else {
        lines.push(`  ${prop.name}${sig}`);
      }
    } else {
      // It's a property
      const typeStr = checker.typeToString(propType);
      lines.push(`  ${prop.name}: ${typeStr}`);
    }
  }

  lines.push("}");
  return lines;
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
        lines.push(`  ${prop.name}${params}: ${ret}`);
      } else {
        lines.push(`  ${prop.name}${sig}`);
      }
    } else {
      const typeStr = checker.typeToString(propType);
      lines.push(`  ${prop.name}: ${typeStr}`);
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
