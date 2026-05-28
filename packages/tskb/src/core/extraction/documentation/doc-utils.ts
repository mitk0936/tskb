import ts from "typescript";
import type { DocPriority } from "../../../runtime/jsx.js";
import type { ExtractedRegistry } from "../registry.js";

// ─── Internal types ───────────────────────────────────────────────────────────

export type ConstantRefMap = Map<string, { category: string; name: string }>;
export type ConstantValueMap = Map<string, string>;

export interface DocRefs {
  modules: string[];
  terms: string[];
  folders: string[];
  exports: string[];
  files: string[];
  externals: string[];
}

export interface DocMeta {
  explains: string;
  priority: DocPriority;
}

// ─── Ref category dispatch table ─────────────────────────────────────────────

export const REF_CATEGORY_MAP: Record<string, string> = {
  ModuleRef: "Modules",
  TermRef: "Terms",
  FolderRef: "Folders",
  ExportRef: "Exports",
  FileRef: "Files",
  ExternalRef: "Externals",
};

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * First pass over the source file: walks all variable declarations and maps
 * const names to {category, name} by parsing 'ref as tskb.X["y"]' type
 * assertions. Result is passed into JsxExtractor so inline {MyConst}
 * expressions resolve without re-parsing.
 */
export function buildRefMap(sourceFile: ts.SourceFile): ConstantRefMap {
  const map: ConstantRefMap = new Map();

  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isAsExpression(decl.initializer)) {
          const meta = parseTypeAssertion(decl.initializer);
          if (meta) map.set(decl.name.text, meta);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return map;
}

/**
 * First pass over the source file: collects `const X = val as T` bindings
 * where T resolves to a single string-literal type. The literal value is
 * stored in the returned map for inline rendering. Non-literal or non-`val`
 * assertions are ignored.
 */
export function buildValueMap(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
): ConstantValueMap {
  const map: ConstantValueMap = new Map();

  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          ts.isAsExpression(decl.initializer) &&
          ts.isIdentifier(decl.initializer.expression) &&
          decl.initializer.expression.text === "val"
        ) {
          const type = checker.getTypeFromTypeNode(decl.initializer.type);
          if (type.isStringLiteral()) {
            map.set(decl.name.text, type.value);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return map;
}

/**
 * Produces the <a class="tskb-ref"> anchor for a single registry reference.
 * Embeds data-node-id, data-node-type, and data-node-display attributes
 * pre-computed from the registry so tooltips work before the chunk is loaded.
 * Pushes the id into the appropriate refs sub-array.
 */
export function buildRefLink(
  category: string,
  name: string,
  refs: DocRefs,
  registry?: ExtractedRegistry
): string | null {
  const typeMap: Record<string, string> = {
    Folders: "folder",
    Modules: "module",
    Exports: "export",
    Terms: "term",
    Files: "file",
    Externals: "external",
  };
  const nodeType = typeMap[category] ?? "";

  let display: string;
  if (category === "Modules" && registry) {
    display = registry.modules.get(name)?.resolvedPath ?? name;
  } else if (category === "Folders" && registry) {
    display = (registry.folders.get(name)?.path ?? name) + "/";
  } else if (category === "Files" && registry) {
    display = registry.files.get(name)?.resolvedPath ?? name;
  } else {
    display = name;
  }

  const link = `<a class="tskb-ref" data-node-id="${escapeAttr(name)}" data-node-type="${nodeType}" data-node-display="${escapeAttr(display)}">${escapeHtml(name)}</a>`;

  switch (category) {
    case "Folders":
      refs.folders.push(name);
      break;
    case "Modules":
      refs.modules.push(name);
      break;
    case "Terms":
      refs.terms.push(name);
      break;
    case "Exports":
      refs.exports.push(name);
      break;
    case "Files":
      refs.files.push(name);
      break;
    case "Externals":
      refs.externals.push(name);
      break;
    default:
      return null;
  }
  return link;
}

/**
 * Looks up a nodeId across all registry maps and returns {nodeType, display}.
 * Used for flow step links so each step anchor carries pre-computed attributes.
 */
export function resolveNodeMeta(
  nodeId: string,
  registry: ExtractedRegistry
): { nodeType: string; display: string } {
  if (registry.modules.has(nodeId))
    return { nodeType: "module", display: registry.modules.get(nodeId)!.resolvedPath ?? nodeId };
  if (registry.folders.has(nodeId))
    return { nodeType: "folder", display: (registry.folders.get(nodeId)!.path ?? nodeId) + "/" };
  if (registry.exports.has(nodeId)) return { nodeType: "export", display: nodeId };
  if (registry.terms.has(nodeId)) return { nodeType: "term", display: nodeId };
  if (registry.files.has(nodeId))
    return { nodeType: "file", display: registry.files.get(nodeId)!.resolvedPath ?? nodeId };
  if (registry.externals.has(nodeId)) return { nodeType: "external", display: nodeId };
  return { nodeType: "", display: nodeId };
}

// ─── AST utilities ────────────────────────────────────────────────────────────

export function findDefaultExport(sourceFile: ts.SourceFile): ts.Expression | null {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      return statement.expression;
    }
  }
  return null;
}

export function parseTypeAssertion(
  assertion: ts.AsExpression
): { category: string; name: string } | null {
  const type = assertion.type;
  if (
    ts.isIndexedAccessTypeNode(type) &&
    ts.isTypeReferenceNode(type.objectType) &&
    ts.isQualifiedName(type.objectType.typeName) &&
    ts.isIdentifier(type.objectType.typeName.left) &&
    type.objectType.typeName.left.text === "tskb" &&
    ts.isIdentifier(type.objectType.typeName.right) &&
    ts.isLiteralTypeNode(type.indexType) &&
    ts.isStringLiteral(type.indexType.literal)
  ) {
    return {
      category: type.objectType.typeName.right.text,
      name: type.indexType.literal.text,
    };
  }
  return null;
}

export function getStringAttribute(attrs: ts.JsxAttributes, attrName: string): string | undefined {
  for (const prop of attrs.properties) {
    if (
      ts.isJsxAttribute(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === attrName &&
      prop.initializer &&
      ts.isStringLiteral(prop.initializer)
    ) {
      return prop.initializer.text;
    }
  }
  return undefined;
}

export function getCodeAttribute(attrs: ts.JsxAttributes): string | undefined {
  for (const prop of attrs.properties) {
    if (
      ts.isJsxAttribute(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "code" &&
      prop.initializer &&
      ts.isJsxExpression(prop.initializer) &&
      prop.initializer.expression
    ) {
      const expr = prop.initializer.expression;
      const sourceFile = prop.getSourceFile();
      if (ts.isArrowFunction(expr) && ts.isBlock(expr.body)) {
        const stmts = expr.body.statements;
        if (stmts.length === 0) return "";
        const raw = sourceFile.text.slice(
          stmts[0].getStart(sourceFile),
          stmts[stmts.length - 1].getEnd()
        );
        return dedent(raw);
      }
      return expr.getText(sourceFile);
    }
  }
  return undefined;
}

export function getAdrAttributes(attrs: ts.JsxAttributes): string | undefined {
  const parts: string[] = [];
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop) || !ts.isIdentifier(prop.name)) continue;
    const key = prop.name.text;
    if (!["id", "title", "status", "date", "deciders"].includes(key)) continue;
    if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
      parts.push(`${key}="${prop.initializer.text}"`);
    } else if (
      prop.initializer &&
      ts.isJsxExpression(prop.initializer) &&
      prop.initializer.expression
    ) {
      const val = prop.initializer.expression.getText(prop.getSourceFile());
      parts.push(`${key}="${val.replace(/"/g, '\\"')}"`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function extractStepNode(
  attrs: ts.JsxAttributes,
  constantRefs: ConstantRefMap
): string | undefined {
  for (const prop of attrs.properties) {
    if (
      !ts.isJsxAttribute(prop) ||
      !ts.isIdentifier(prop.name) ||
      prop.name.text !== "node" ||
      !prop.initializer
    )
      continue;
    if (ts.isStringLiteral(prop.initializer)) return prop.initializer.text;
    if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
      const expr = prop.initializer.expression;
      if (ts.isIdentifier(expr)) return constantRefs.get(expr.text)?.name ?? expr.text;
      if (ts.isAsExpression(expr)) return parseTypeAssertion(expr)?.name;
    }
  }
  return undefined;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function dedent(code: string): string {
  const lines = code.split("\n");
  const indent = lines
    .filter((l) => l.trim().length > 0)
    .reduce((min, l) => Math.min(min, l.match(/^(\s*)/)![1].length), Infinity);
  return lines
    .map((l) => l.slice(indent))
    .join("\n")
    .trim();
}
