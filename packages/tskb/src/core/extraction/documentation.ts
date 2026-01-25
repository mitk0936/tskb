import ts from "typescript";

/**
 * Extracted documentation data from a single file
 */
export interface ExtractedDoc {
  filePath: string;
  format: "tsx";
  content: string;
  references: {
    modules: string[];
    terms: string[];
    folders: string[];
    exports: string[];
  };
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
export function extractDocs(program: ts.Program, filePaths: Set<string>): ExtractedDoc[] {
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
      const doc = extractFromTsxFile(sourceFile);
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
function extractFromTsxFile(sourceFile: ts.SourceFile): ExtractedDoc | null {
  const references = {
    modules: [] as string[],
    terms: [] as string[],
    folders: [] as string[],
    exports: [] as string[],
  };

  let content = "";

  // Find the default export
  const defaultExport = findDefaultExport(sourceFile);
  if (!defaultExport) return null;

  // Extract content and references from JSX
  content = extractJsxContent(defaultExport, references);

  return {
    filePath: sourceFile.fileName,
    format: "tsx",
    content,
    references: {
      modules: Array.from(new Set(references.modules)),
      terms: Array.from(new Set(references.terms)),
      folders: Array.from(new Set(references.folders)),
      exports: Array.from(new Set(references.exports)),
    },
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
 * Extract text content and references from JSX tree.
 *
 * JSX TRAVERSAL STRATEGY:
 * We recursively walk the JSX tree (depth-first) and:
 * 1. When we hit <FolderRef name="X" /> -> add "X" to references.folders, append "[Folder: X]" to content
 * 2. When we hit <ModuleRef name="Y" /> -> add "Y" to references.modules, append "[Module: Y]" to content
 * 3. When we hit <TermRef name="Z" /> -> add "Z" to references.terms, append "[Term: Z]" to content
 * 4. When we hit text nodes ("some text") -> append to content
 * 5. For other elements (<Doc>, <H1>, <P>, etc.) -> recurse into children
 *
 * RESULT:
 * - content: Full text representation of the doc (references shown as [Module: X])
 * - references: Arrays of all referenced module/term/folder names
 *
 * This gives us both human-readable text AND the graph edges we need.
 */
function extractJsxContent(
  node: ts.Node,
  references: { modules: string[]; terms: string[]; folders: string[]; exports: string[] }
): string {
  let content = "";

  function visit(n: ts.Node): void {
    // Handle JSX elements
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName;

      if (ts.isIdentifier(tagName)) {
        const name = tagName.text;
        const attributes = ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes;

        // Handle Snippet component specially
        if (name === "Snippet") {
          const codeAttr = getCodeAttribute(attributes);
          if (codeAttr) {
            content += `<snippet>${codeAttr}</snippet>`;
            return;
          }
        }

        // Handle ADR component specially
        if (name === "Adr") {
          const adrMeta = getAdrAttributes(attributes);
          if (adrMeta) {
            content += `<adr ${adrMeta}>`;
            // Process children
            if (ts.isJsxElement(n)) {
              n.children.forEach(visit);
            }
            content += `</adr>`;
            return;
          }
        }

        // Extract references
        if (name === "ModuleRef") {
          const refName = getNameAttribute(attributes);
          if (refName) {
            references.modules.push(refName);
            content += `[Module: ${refName}]`;
            return; // Don't process children
          }
        } else if (name === "TermRef") {
          const refName = getNameAttribute(attributes);
          if (refName) {
            references.terms.push(refName);
            content += `[Term: ${refName}]`;
            return;
          }
        } else if (name === "FolderRef") {
          const refName = getNameAttribute(attributes);
          if (refName) {
            references.folders.push(refName);
            content += `[Folder: ${refName}]`;
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
      // Handle type assertions: {ref as tskb.Folders['Name']}
      else if (ts.isAsExpression(n.expression)) {
        const refContent = extractReferenceFromTypeAssertion(n.expression, references);
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
  references: { modules: string[]; terms: string[]; folders: string[]; exports: string[] }
): string | null {
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

      if (interfaceName === "Folders") {
        references.folders.push(refName);
        return `[Folder: ${refName}]`;
      } else if (interfaceName === "Modules") {
        references.modules.push(refName);
        return `[Module: ${refName}]`;
      } else if (interfaceName === "Terms") {
        references.terms.push(refName);
        return `[Term: ${refName}]`;
      } else if (interfaceName === "Exports") {
        references.exports.push(refName);
        return `[Export: ${refName}]`;
      }
    }
  }

  return null;
}

/**
 * Get the value of a "name" attribute from JSX attributes
 */
function getNameAttribute(attributes: ts.JsxAttributes): string | undefined {
  for (const prop of attributes.properties) {
    if (
      ts.isJsxAttribute(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "name" &&
      prop.initializer &&
      ts.isStringLiteral(prop.initializer)
    ) {
      return prop.initializer.text;
    }
  }
  return undefined;
}

/**
 * Get the code function from a "code" attribute and convert it to string
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
      // Get the source text of the function
      const sourceFile = prop.getSourceFile();
      const codeText = prop.initializer.expression.getText(sourceFile);
      return codeText;
    }
  }
  return undefined;
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
