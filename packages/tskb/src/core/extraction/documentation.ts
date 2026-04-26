import ts from "typescript";
import path from "node:path";
import type { DocPriority } from "../../runtime/jsx.js";
import type { ExtractedRegistry } from "./registry.js";

/**
 * Extracted documentation data from a single file
 */
export interface ExtractedDoc {
  /** Relative file path from baseDir (tsconfig root), using forward slashes */
  filePath: string;
  format: "tsx";
  /** What this documentation explains (from the Doc explains prop) */
  explains: string;
  /** Importance level - essential docs are included in generated skill/instructions files */
  priority: DocPriority;
  content: string;
  references: {
    modules: string[];
    terms: string[];
    folders: string[];
    exports: string[];
    files: string[];
    externals: string[];
  };
  /** Extracted semantic relations: {from, to, label?} */
  relations?: { from: string; to: string; label?: string }[];
  /** Extracted flows: { name, desc, priority, steps[] } */
  flows?: {
    name: string;
    desc: string;
    priority: import("../../runtime/jsx.js").DocPriority;
    steps: { nodeId: string; label?: string }[];
  }[];
}

/**
 * Extracts documentation from TSX files matched by the glob pattern.
 *
 * Extracts JSX content and finds FolderRef/ModuleRef/TermRef references.
 *
 * @param program - TypeScript program
 * @param filePaths - Set of absolute file paths to process (from glob match)
 * @returns Array of extracted documentation
 */
export function extractDocs(
  program: ts.Program,
  filePaths: Set<string>,
  registry?: ExtractedRegistry
): ExtractedDoc[] {
  const docs: ExtractedDoc[] = [];

  // Normalize file paths for comparison (handle different path separators)
  const normalizedFilePaths = new Set(
    Array.from(filePaths).map((p) => p.replace(/\\/g, "/").toLowerCase())
  );

  for (const sourceFile of program.getSourceFiles()) {
    // Normalize source file path for comparison
    const normalizedSourcePath = sourceFile.fileName.replace(/\\/g, "/").toLowerCase();

    // Only process files that were explicitly matched by the glob pattern
    if (normalizedFilePaths.has(normalizedSourcePath) && sourceFile.fileName.endsWith(".tsx")) {
      const doc = extractFromTsxFile(sourceFile, registry);
      if (doc) {
        docs.push(doc);
      }
    }
  }

  return docs;
}

/**
 * Extract documentation from TSX file (JSX style)
 */
export function extractFromTsxFile(
  sourceFile: ts.SourceFile,
  registry?: ExtractedRegistry
): ExtractedDoc | null {
  const references = {
    modules: [] as string[],
    terms: [] as string[],
    folders: [] as string[],
    exports: [] as string[],
    files: [] as string[],
    externals: [] as string[],
  };

  let content = "";
  const docMeta: { explains: string; priority: DocPriority } = {
    explains: "",
    priority: "supplementary",
  };

  // Build a map of constant declarations to their type assertions
  const constantReferences = buildConstantReferencesMap(sourceFile);

  // Collect relations
  const relations: { from: string; to: string }[] = [];

  // Collect flows
  const flows: {
    name: string;
    desc: string;
    priority: DocPriority;
    steps: { nodeId: string; label?: string }[];
  }[] = [];

  // Find the default export
  const defaultExport = findDefaultExport(sourceFile);
  if (!defaultExport) return null;

  // Extract content and references from JSX, now also collects relations and flows
  content = extractJsxContent(
    defaultExport,
    references,
    constantReferences,
    docMeta,
    relations,
    flows,
    registry
  );

  // Convert absolute path to relative path (for portability across repos/machines)
  const relativePath = path.relative(process.cwd(), sourceFile.fileName).replace(/\\/g, "/");

  return {
    filePath: relativePath,
    format: "tsx",
    explains: docMeta.explains,
    priority: docMeta.priority,
    content,
    references: {
      modules: Array.from(new Set(references.modules)),
      terms: Array.from(new Set(references.terms)),
      folders: Array.from(new Set(references.folders)),
      exports: Array.from(new Set(references.exports)),
      files: Array.from(new Set(references.files)),
      externals: Array.from(new Set(references.externals)),
    },
    relations,
    flows,
  };
}

/**
 * Find the default export statement
 */
function findDefaultExport(sourceFile: ts.SourceFile): ts.Expression | null {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      return statement.expression;
    }
  }
  return null;
}

/**
 * Build a map of constant variable names to their type assertion metadata.
 * This handles cases like: const CliIndexModule = ref as tskb.Modules["cli.index"];
 */
export function buildConstantReferencesMap(
  sourceFile: ts.SourceFile
): Map<string, { category: string; name: string }> {
  const map = new Map<string, { category: string; name: string }>();

  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          ts.isAsExpression(declaration.initializer)
        ) {
          const varName = declaration.name.text;
          const metadata = extractTypeAssertionMetadata(declaration.initializer);
          if (metadata) {
            map.set(varName, metadata);
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
 * Extract category and name from a type assertion like: ref as tskb.Modules["cli.index"]
 */
function extractTypeAssertionMetadata(
  assertion: ts.AsExpression
): { category: string; name: string } | null {
  const type = assertion.type;

  // Check for indexed access type: tskb.Folders['Name']
  if (ts.isIndexedAccessTypeNode(type)) {
    const objType = type.objectType;
    const indexType = type.indexType;

    // Ensure it's tskb.X['...'] pattern
    if (
      ts.isTypeReferenceNode(objType) &&
      ts.isQualifiedName(objType.typeName) &&
      ts.isIdentifier(objType.typeName.left) &&
      objType.typeName.left.text === "tskb" &&
      ts.isIdentifier(objType.typeName.right) &&
      ts.isLiteralTypeNode(indexType) &&
      ts.isStringLiteral(indexType.literal)
    ) {
      const interfaceName = objType.typeName.right.text;
      const refName = indexType.literal.text;

      return { category: interfaceName, name: refName };
    }
  }

  return null;
}

/**
 * Extract text content and references from JSX tree.
 *
 * JSX TRAVERSAL STRATEGY:
 * We recursively walk the JSX tree (depth-first) and:
 * 1. When we hit <FolderRef name="X" /> -> add "X" to references.folders, append "<nodeId: X>" to content
 * 2. When we hit <ModuleRef name="Y" /> -> add "Y" to references.modules, append "<nodeId: Y>" to content
 * 3. When we hit <TermRef name="Z" /> -> add "Z" to references.terms, append "<nodeId: Z>" to content
 * 4. When we hit text nodes ("some text") -> append to content
 * 5. For other elements (<Doc>, <H1>, <P>, etc.) -> recurse into children
 *
 * RESULT:
 * - content: Full text representation of the doc (references shown as <nodeId: X>)
 * - references: Arrays of all referenced module/term/folder names
 *
 * This gives us both human-readable text AND the graph edges we need.
 */
export function extractJsxContent(
  node: ts.Node,
  references: {
    modules: string[];
    terms: string[];
    folders: string[];
    exports: string[];
    files: string[];
    externals: string[];
  },
  constantReferences: Map<string, { category: string; name: string }>,
  docMeta: { explains: string; priority: DocPriority },
  relations?: { from: string; to: string; label?: string }[],
  flows?: {
    name: string;
    desc: string;
    priority: DocPriority;
    steps: { nodeId: string; label?: string }[];
  }[],
  registry?: ExtractedRegistry
): string {
  let content = "";

  function visit(n: ts.Node): void {
    // Handle JSX elements
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName;

      if (ts.isIdentifier(tagName)) {
        const name = tagName.text;
        const attributes = ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes;

        // Extract explains and priority from <Doc explains="..." priority="...">
        if (name === "Doc") {
          const explains = getStringAttribute(attributes, "explains");
          if (explains) {
            docMeta.explains = explains;
          }
          const priority = getStringAttribute(attributes, "priority");
          if (
            priority === "essential" ||
            priority === "constraint" ||
            priority === "supplementary"
          ) {
            docMeta.priority = priority;
          }
        }

        // Handle structural elements — wrap children in proper HTML tags
        if (name === "H1" || name === "H2" || name === "H3") {
          const tag = name.toLowerCase() as "h1" | "h2" | "h3";
          content += `<${tag}>`;
          if (ts.isJsxElement(n)) n.children.forEach(visit);
          content += `</${tag}>`;
          return;
        }
        if (name === "P") {
          content += `<p>`;
          if (ts.isJsxElement(n)) n.children.forEach(visit);
          content += `</p>`;
          return;
        }
        if (name === "List") {
          content += `<ul>`;
          if (ts.isJsxElement(n)) n.children.forEach(visit);
          content += `</ul>`;
          return;
        }
        if (name === "Li") {
          content += `<li>`;
          if (ts.isJsxElement(n)) n.children.forEach(visit);
          content += `</li>`;
          return;
        }

        // Handle Snippet component specially
        if (name === "Snippet") {
          const codeAttr = getCodeAttribute(attributes);
          if (codeAttr) {
            content += `<pre class="tskb-snippet"><code>${escapeHtml(codeAttr)}</code></pre>`;
            return;
          }
        }

        // Handle Relation component: extract from/to attributes (string or expression)
        if (name === "Relation" && relations) {
          let fromVal: string | undefined;
          let toVal: string | undefined;
          let labelVal: string | undefined;
          for (const prop of attributes.properties) {
            if (ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name)) {
              if (prop.name.text === "from" && prop.initializer) {
                if (ts.isStringLiteral(prop.initializer)) {
                  fromVal = prop.initializer.text;
                } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
                  fromVal = jsxExpressionToString(prop.initializer.expression, constantReferences);
                }
              } else if (prop.name.text === "to" && prop.initializer) {
                if (ts.isStringLiteral(prop.initializer)) {
                  toVal = prop.initializer.text;
                } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
                  toVal = jsxExpressionToString(prop.initializer.expression, constantReferences);
                }
              } else if (prop.name.text === "label" && prop.initializer) {
                if (ts.isStringLiteral(prop.initializer)) {
                  labelVal = prop.initializer.text;
                } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
                  labelVal = jsxExpressionToString(prop.initializer.expression, constantReferences);
                }
              }
            }
          }
          // Defensive: trim quotes and whitespace from resolved names
          if (typeof fromVal === "string") fromVal = fromVal.replace(/^['"]|['"]$/g, "").trim();
          if (typeof toVal === "string") toVal = toVal.replace(/^['"]|['"]$/g, "").trim();
          if (typeof labelVal === "string") labelVal = labelVal.trim();
          if (fromVal && toVal) {
            relations.push(
              labelVal
                ? { from: fromVal, to: toVal, label: labelVal }
                : { from: fromVal, to: toVal }
            );
          }
          // Emit as a hidden span carrying relation data
          const labelAttr = labelVal ? ` data-label="${escapeAttr(labelVal)}"` : "";
          content += `<span class="tskb-relation" data-from="${escapeAttr(fromVal ?? "")}" data-to="${escapeAttr(toVal ?? "")}"${labelAttr}></span>`;
          return;
        }
        // Helper to stringify JSX expressions for Relation extraction
        // Enhanced: resolve identifiers using constantReferences for Relation extraction
        function jsxExpressionToString(
          expr: ts.Expression,
          constantReferences?: Map<string, { category: string; name: string }>
        ): string | undefined {
          if (ts.isStringLiteral(expr)) return expr.text;
          if (ts.isIdentifier(expr)) {
            if (constantReferences) {
              const ref = constantReferences.get(expr.text);
              if (ref) return ref.name;
            }
            return expr.text;
          }
          if (ts.isAsExpression(expr)) {
            // Try to extract the name from type assertion: ref as tskb.Modules["MyModule"]
            if (ts.isIdentifier(expr.expression)) {
              if (constantReferences) {
                const ref = constantReferences.get(expr.expression.text);
                if (ref) return ref.name;
              }
              return expr.expression.text;
            }
            if (ts.isPropertyAccessExpression(expr.expression)) return expr.expression.name.text;
            // Could add more cases as needed
          }
          // Fallback: print the expression as source
          return expr.getText();
        }

        // Handle Flow component: extract name, desc, and validate + extract Step children
        if (name === "Flow" && flows && ts.isJsxElement(n)) {
          const flowName = getStringAttribute(attributes, "name");
          const flowDesc = getStringAttribute(attributes, "desc");
          const flowPriority = getStringAttribute(attributes, "priority");
          const resolvedPriority: DocPriority =
            flowPriority === "essential" || flowPriority === "constraint"
              ? flowPriority
              : "supplementary";
          if (flowName && flowDesc) {
            const steps: { nodeId: string; label?: string }[] = [];
            for (const child of n.children) {
              // Skip whitespace text nodes
              if (ts.isJsxText(child)) {
                if (child.text.trim()) {
                  throw new Error(
                    `<Flow name="${flowName}"> contains text content. Flows may only contain <Step> elements.`
                  );
                }
                continue;
              }
              // Validate: only <Step> elements allowed
              if (
                ts.isJsxSelfClosingElement(child) &&
                ts.isIdentifier(child.tagName) &&
                child.tagName.text === "Step"
              ) {
                const stepNodeId = extractStepNode(child.attributes, constantReferences);
                const stepLabel = getStringAttribute(child.attributes, "label");
                if (stepNodeId) {
                  steps.push(
                    stepLabel ? { nodeId: stepNodeId, label: stepLabel } : { nodeId: stepNodeId }
                  );
                }
              } else if (
                ts.isJsxElement(child) &&
                ts.isIdentifier(child.openingElement.tagName) &&
                child.openingElement.tagName.text === "Step"
              ) {
                const stepNodeId = extractStepNode(
                  child.openingElement.attributes,
                  constantReferences
                );
                const stepLabel = getStringAttribute(child.openingElement.attributes, "label");
                if (stepNodeId) {
                  steps.push(
                    stepLabel ? { nodeId: stepNodeId, label: stepLabel } : { nodeId: stepNodeId }
                  );
                }
              } else {
                const childName =
                  ts.isJsxSelfClosingElement(child) && ts.isIdentifier(child.tagName)
                    ? child.tagName.text
                    : ts.isJsxElement(child) && ts.isIdentifier(child.openingElement.tagName)
                      ? child.openingElement.tagName.text
                      : "unknown";
                throw new Error(
                  `<Flow name="${flowName}"> contains a non-<Step> child: <${childName}>. Flows may only contain <Step> elements.`
                );
              }
            }
            flows.push({ name: flowName, desc: flowDesc, priority: resolvedPriority, steps });
            // Emit flow as HTML with step links
            const stepItems = steps
              .map((s) => {
                const label = s.label ? ` — ${escapeHtml(s.label)}` : "";
                const { nodeType, display } = registry
                  ? resolveNodeMeta(s.nodeId, registry)
                  : { nodeType: "", display: s.nodeId };
                const typeAttr = nodeType ? ` data-node-type="${escapeAttr(nodeType)}"` : "";
                const displayAttr = ` data-node-display="${escapeAttr(display)}"`;
                return `<li><a class="tskb-ref" data-node-id="${escapeAttr(s.nodeId)}"${typeAttr}${displayAttr}>${escapeHtml(s.nodeId)}</a>${label}</li>`;
              })
              .join("");
            content += `<div class="tskb-flow"><p class="tskb-flow-desc">${escapeHtml(flowDesc)}</p><ol>${stepItems}</ol></div>`;
          }
          return;
        }

        // Handle ADR component specially
        if (name === "Adr") {
          const adrMeta = getAdrAttributes(attributes);
          if (adrMeta) {
            content += `<section class="tskb-adr" ${adrMeta}>`;
            if (ts.isJsxElement(n)) {
              n.children.forEach(visit);
            }
            content += `</section>`;
            return;
          }
        }

        // Extract references
        const refCategoryMap: Record<string, string> = {
          ModuleRef: "Modules",
          TermRef: "Terms",
          FolderRef: "Folders",
          ExportRef: "Exports",
          FileRef: "Files",
          ExternalRef: "Externals",
        };
        if (name in refCategoryMap) {
          const refName = getNameAttribute(attributes);
          if (refName) {
            const refContent = createReferenceContent(
              refCategoryMap[name],
              refName,
              references,
              registry
            );
            if (refContent) content += refContent;
            return;
          }
        }
      }

      // Process children for other elements
      if (ts.isJsxElement(n)) {
        n.children.forEach(visit);
      }
    }
    // Handle text nodes
    else if (ts.isJsxText(n)) {
      const text = n.text.trim();
      if (text) {
        content += text + " ";
      }
    }
    // Handle JSX expressions
    else if (ts.isJsxExpression(n) && n.expression) {
      if (ts.isStringLiteral(n.expression)) {
        content += n.expression.text + " ";
      }
      // Handle identifier references to constants: {CliIndexModule}
      else if (ts.isIdentifier(n.expression)) {
        const varName = n.expression.text;
        const refMetadata = constantReferences.get(varName);
        if (refMetadata) {
          const refContent = createReferenceContent(
            refMetadata.category,
            refMetadata.name,
            references,
            registry
          );
          if (refContent) {
            content += refContent;
          }
        } else {
          // Not a primitive — likely a type-checked variable referencing a graph node
          content += `{${varName}} `;
        }
      }
      // Handle type assertions: {ref as tskb.Folders['Name']}
      else if (ts.isAsExpression(n.expression)) {
        const refContent = extractReferenceFromTypeAssertion(n.expression, references, registry);
        if (refContent) {
          content += refContent;
        }
      }
    }
    // Recursively visit other nodes
    else {
      ts.forEachChild(n, visit);
    }
  }

  visit(node);
  return content.trim();
}

/**
 * Extract references from type assertions like: {ref as tskb.Folders['Name']}
 */
function extractReferenceFromTypeAssertion(
  assertion: ts.AsExpression,
  references: {
    modules: string[];
    terms: string[];
    folders: string[];
    exports: string[];
    files: string[];
    externals: string[];
  },
  registry?: ExtractedRegistry
): string | null {
  const metadata = extractTypeAssertionMetadata(assertion);
  if (metadata) {
    return createReferenceContent(metadata.category, metadata.name, references, registry);
  }
  return null;
}

/**
 * Create reference content and add to the appropriate references array
 */
export function createReferenceContent(
  category: string,
  name: string,
  references: {
    modules: string[];
    terms: string[];
    folders: string[];
    exports: string[];
    files: string[];
    externals: string[];
  },
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

  // Pre-compute display text using registry data so wireRefLinks works
  // even when the chunk containing this node hasn't been loaded yet.
  let display: string;
  if (category === "Modules" && registry) {
    display = registry.modules.get(name)?.resolvedPath ?? name;
  } else if (category === "Folders" && registry) {
    display = (registry.folders.get(name)?.path ?? name) + "/";
  } else if (category === "Files" && registry) {
    display = registry.files.get(name)?.resolvedPath ?? name;
  } else {
    // Exports, Terms, Externals: use the name as-is
    display = name;
  }

  const nodeLink = `<a class="tskb-ref" data-node-id="${escapeAttr(name)}" data-node-type="${nodeType}" data-node-display="${escapeAttr(display)}">${escapeHtml(name)}</a>`;
  if (category === "Folders") {
    references.folders.push(name);
    return nodeLink;
  } else if (category === "Modules") {
    references.modules.push(name);
    return nodeLink;
  } else if (category === "Terms") {
    references.terms.push(name);
    return nodeLink;
  } else if (category === "Exports") {
    references.exports.push(name);
    return nodeLink;
  } else if (category === "Files") {
    references.files.push(name);
    return nodeLink;
  } else if (category === "Externals") {
    references.externals.push(name);
    return nodeLink;
  }
  return null;
}

/**
 * Get the value of a string attribute from JSX attributes by name
 */
function getStringAttribute(attributes: ts.JsxAttributes, attrName: string): string | undefined {
  for (const prop of attributes.properties) {
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

/**
 * Get the value of a "name" attribute from JSX attributes
 */
function getNameAttribute(attributes: ts.JsxAttributes): string | undefined {
  return getStringAttribute(attributes, "name");
}

/**
 * Get the code function from a "code" attribute and convert it to string.
 * Strips the arrow-function wrapper so only the body statements are returned.
 */
function getCodeAttribute(attributes: ts.JsxAttributes): string | undefined {
  for (const prop of attributes.properties) {
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

/**
 * Extract ADR metadata attributes (id, title, status, date, deciders)
 */
function getAdrAttributes(attributes: ts.JsxAttributes): string | undefined {
  const attrs: string[] = [];

  for (const prop of attributes.properties) {
    if (ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name)) {
      const attrName = prop.name.text;

      if (["id", "title", "status", "date", "deciders"].includes(attrName)) {
        if (prop.initializer && ts.isStringLiteral(prop.initializer)) {
          attrs.push(`${attrName}="${prop.initializer.text}"`);
        } else if (
          prop.initializer &&
          ts.isJsxExpression(prop.initializer) &&
          prop.initializer.expression
        ) {
          const sourceFile = prop.getSourceFile();
          const value = prop.initializer.expression.getText(sourceFile);
          attrs.push(`${attrName}="${value.replace(/"/g, '\\"')}"`);
        }
      }
    }
  }

  return attrs.length > 0 ? attrs.join(" ") : undefined;
}

/**
 * Extract the node ID from a Step's `node` attribute.
 * Handles both expression references ({MyConst}) and string literals.
 */
function extractStepNode(
  attributes: ts.JsxAttributes,
  constantReferences: Map<string, { category: string; name: string }>
): string | undefined {
  for (const prop of attributes.properties) {
    if (
      ts.isJsxAttribute(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "node" &&
      prop.initializer
    ) {
      if (ts.isStringLiteral(prop.initializer)) {
        return prop.initializer.text;
      }
      if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
        const expr = prop.initializer.expression;
        if (ts.isIdentifier(expr)) {
          const ref = constantReferences.get(expr.text);
          if (ref) return ref.name;
          return expr.text;
        }
        if (ts.isAsExpression(expr)) {
          const metadata = extractTypeAssertionMetadata(expr);
          if (metadata) return metadata.name;
        }
      }
    }
  }
  return undefined;
}

/**
 * Resolve a node's type string and display text from the registry.
 * Used for flow step links and any other place where the category is unknown.
 */
export function resolveNodeMeta(
  nodeId: string,
  registry: ExtractedRegistry
): { nodeType: string; display: string } {
  if (registry.modules.has(nodeId)) {
    return { nodeType: "module", display: registry.modules.get(nodeId)!.resolvedPath ?? nodeId };
  }
  if (registry.folders.has(nodeId)) {
    return { nodeType: "folder", display: (registry.folders.get(nodeId)!.path ?? nodeId) + "/" };
  }
  if (registry.exports.has(nodeId)) {
    return { nodeType: "export", display: nodeId };
  }
  if (registry.terms.has(nodeId)) {
    return { nodeType: "term", display: nodeId };
  }
  if (registry.files.has(nodeId)) {
    return { nodeType: "file", display: registry.files.get(nodeId)!.resolvedPath ?? nodeId };
  }
  if (registry.externals.has(nodeId)) {
    return { nodeType: "external", display: nodeId };
  }
  return { nodeType: "", display: nodeId };
}

/**
 * Escape text for safe HTML insertion.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape text for use in HTML attribute values (double-quoted).
 */
function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
