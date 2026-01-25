import ts from "typescript";
import path from "node:path";

/**
 * Registry data extracted from TypeScript declaration merging
 */
export interface ExtractedRegistry {
  folders: Map<string, { desc: string; path?: string; resolvedPath?: string; pathExists: boolean }>;
  modules: Map<
    string,
    {
      desc: string;
      type?: string;
      importPath?: string;
      resolvedPath?: string;
      pathExists: boolean;
    }
  >;
  terms: Map<string, string>; // term name -> description
  exports: Map<
    string,
    {
      desc: string;
      type?: string;
      importPath?: string;
      resolvedPath?: string;
      pathExists: boolean;
    }
  >;
}

/**
 * Extracts the vocabulary (Folders, Modules, Terms) from the TypeScript type system.
 *
 * This uses the TypeScript compiler API to resolve the global `tskb` namespace
 * and extract all declaration-merged interfaces.
 *
 * @param program - TypeScript program containing the source files
 * @param baseDir - Base directory for resolving and storing relative paths (typically tsconfig rootDir)
 * @param tsconfigPath - Path to tsconfig.json (for reading additional config if needed)
 * @returns Extracted registry data
 */
export function extractRegistry(
  program: ts.Program,
  baseDir: string,
  tsconfigPath: string
): ExtractedRegistry {
  const checker = program.getTypeChecker();
  const registry: ExtractedRegistry = {
    folders: new Map(),
    modules: new Map(),
    terms: new Map(),
    exports: new Map(),
  };

  // Use the provided baseDir for all path resolution
  const baseUrl = baseDir;

  // Find all source files that might contain tskb declarations
  for (const sourceFile of program.getSourceFiles()) {
    // Skip node_modules and lib files
    if (sourceFile.isDeclarationFile && sourceFile.fileName.includes("node_modules")) {
      continue;
    }

    // Look for global namespace declarations
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isModuleDeclaration(node) && node.name.text === "global") {
        extractFromGlobalNamespace(node, checker, registry, sourceFile, baseDir, baseUrl);
      }
    });
  }

  return registry;
}

/**
 * Extract tskb interfaces from a global namespace declaration.
 *
 * WHAT WE'RE DOING:
 * Once we find `declare global { ... }`, we need to look inside for `namespace tskb`.
 * The AST structure is: ModuleDeclaration -> ModuleBlock -> statements[]
 *
 * We iterate through all statements looking for another ModuleDeclaration named "tskb".
 */
function extractFromGlobalNamespace(
  globalNode: ts.ModuleDeclaration,
  checker: ts.TypeChecker,
  registry: ExtractedRegistry,
  sourceFile: ts.SourceFile,
  tsconfigDir: string,
  baseUrl: string
): void {
  if (!globalNode.body || !ts.isModuleBlock(globalNode.body)) return;

  // Look for `namespace tskb`
  for (const statement of globalNode.body.statements) {
    if (
      ts.isModuleDeclaration(statement) &&
      ts.isIdentifier(statement.name) &&
      statement.name.text === "tskb"
    ) {
      extractFromTskbNamespace(statement, checker, registry, sourceFile, tsconfigDir, baseUrl);
    }
  }
}

/**
 * Extract Folders, Modules, Terms from the tskb namespace
 */
function extractFromTskbNamespace(
  tskbNode: ts.ModuleDeclaration,
  checker: ts.TypeChecker,
  registry: ExtractedRegistry,
  sourceFile: ts.SourceFile,
  tsconfigDir: string,
  baseUrl: string
): void {
  if (!tskbNode.body || !ts.isModuleBlock(tskbNode.body)) return;

  for (const statement of tskbNode.body.statements) {
    if (!ts.isInterfaceDeclaration(statement)) continue;

    const interfaceName = statement.name.text;

    if (interfaceName === "Folders") {
      extractFolders(statement, checker, registry, sourceFile, tsconfigDir, baseUrl);
    } else if (interfaceName === "Modules") {
      extractModules(statement, checker, registry, sourceFile, tsconfigDir, baseUrl);
    } else if (interfaceName === "Terms") {
      extractTerms(statement, checker, registry, sourceFile);
    } else if (interfaceName == "Exports") {
      extractExports(statement, checker, registry, sourceFile, tsconfigDir, baseUrl);
    }
  }
}

/**
 * Extract all Folders from the Folders interface.
 *
 * INTERFACE PARSING:
 * Given:
 * ```ts
 * interface Folders {
 *   Auth: Folder<{ desc: "Authentication", path: "/auth" }>;
 *   Billing: Folder<{ desc: "Payment system" }>;
 * }
 * ```
 *
 * We iterate through each property signature (Auth, Billing, etc.):
 * 1. Get the property name ("Auth")
 * 2. Get the type node (Folder<{...}>)
 * 3. Call extractFolderType to pull out desc and path literals
 * 4. Store in registry.folders Map: "Auth" -> { desc, path }
 */
function extractFolders(
  interfaceNode: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  registry: ExtractedRegistry,
  sourceFile: ts.SourceFile,
  tsconfigDir: string,
  baseUrl: string
): void {
  for (const member of interfaceNode.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)))
      continue;

    const folderName = member.name.text;
    const type = member.type;

    if (!type) continue;

    // Extract Folder<{ desc: "...", path: "..." }>
    const folderData = extractFolderType(type, checker);
    if (!folderData) {
      // Invalid Folder definition - throw descriptive error
      const typeText = type.getText();
      throw new Error(
        `Invalid Folder definition for "${folderName}" in ${sourceFile.fileName}:\n` +
          `  Expected: Folder<{ desc: string; path: string }>\n` +
          `  Received: ${typeText}\n` +
          `  All properties in the Folders interface must use the Folder<...> helper type.`
      );
    }

    if (folderData) {
      // Resolve and validate path if present
      let resolvedPath: string | undefined;
      let pathExists = false;

      if (folderData.path) {
        // Strip leading slash from path (folders use "/path" convention)
        // Also strip trailing slash for consistent checking
        let normalizedPath = folderData.path.startsWith("/")
          ? folderData.path.slice(1)
          : folderData.path;
        normalizedPath = normalizedPath.replace(/\/$/, "");

        // Try to resolve path from baseUrl (tsconfig baseUrl/rootDir)
        const absoluteFromBaseUrl = path.resolve(baseUrl, normalizedPath);

        const fileExistsCheck = ts.sys.fileExists(absoluteFromBaseUrl);
        const dirExistsCheck = ts.sys.directoryExists(absoluteFromBaseUrl);

        if (fileExistsCheck || dirExistsCheck) {
          // Store as relative path from baseUrl
          resolvedPath = path.relative(baseUrl, absoluteFromBaseUrl).replace(/\\/g, "/");
          pathExists = true;
        } else {
          // Try relative to the source file where Folder was declared
          const sourceFileDir = path.dirname(sourceFile.fileName);
          const absoluteFromSourceFile = path.resolve(sourceFileDir, normalizedPath);
          if (
            ts.sys.fileExists(absoluteFromSourceFile) ||
            ts.sys.directoryExists(absoluteFromSourceFile)
          ) {
            // Store as relative path from baseUrl
            resolvedPath = path.relative(baseUrl, absoluteFromSourceFile).replace(/\\/g, "/");
            pathExists = true;
          } else {
            // Path doesn't exist - throw error
            throw new Error(
              `Folder path not found for "${folderName}" in ${sourceFile.fileName}:\n` +
                `  Specified path: "${folderData.path}"\n` +
                `  Tried resolving from:\n` +
                `    - Repository root (${baseUrl}): ${absoluteFromBaseUrl}\n` +
                `    - Source file directory (${sourceFileDir}): ${absoluteFromSourceFile}\n` +
                `  Neither path exists. Please check the path is correct.`
            );
          }
        }
      }

      registry.folders.set(folderName, {
        ...folderData,
        resolvedPath,
        pathExists,
      });
    }
  }
}

/**
 * Extract desc and path from Folder<{ ... }> type.
 *
 * THE TRICK: We're reading literal string values from type definitions.
 * Given: Folder<{ desc: "Auth management", path: "/auth" }>
 *
 * We need to:
 * 1. Check it's a TypeReferenceNode (generic type)
 * 2. Get the first type argument (the object literal)
 * 3. Walk the object's properties
 * 4. For each property, if it's a literal type (string), extract the actual string value
 *
 * TypeScript represents `desc: "Auth management"` as:
 * PropertySignature -> LiteralTypeNode -> StringLiteral -> .text = "Auth management"
 */
function extractFolderType(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): { desc: string; path?: string } | null {
  // Handle Folder<{ desc: "...", path: "..." }>
  if (!ts.isTypeReferenceNode(typeNode)) return null;

  const typeArgs = typeNode.typeArguments;
  if (!typeArgs || typeArgs.length === 0) return null;

  const objectType = typeArgs[0];
  if (!ts.isTypeLiteralNode(objectType)) return null;

  let desc = "";
  let path: string | undefined;

  for (const member of objectType.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)))
      continue;

    const propName = member.name.text;
    const propType = member.type;

    if (propName === "desc" && propType && ts.isLiteralTypeNode(propType)) {
      desc = (propType.literal as ts.StringLiteral).text;
    } else if (propName === "path" && propType && ts.isLiteralTypeNode(propType)) {
      path = (propType.literal as ts.StringLiteral).text;
    }
  }

  return desc ? { desc, path } : null;
}

/**
 * Extract all Modules from the Modules interface.
 *
 * SAME PATTERN AS FOLDERS:
 * Given:
 * ```ts
 * interface Modules {
 *   AuthService: Module<{ desc: "Handles auth", type: typeof import("@/auth") }>;
 * }
 * ```
 *
 * Extract module name + desc + type (typeof import) and resolve import paths.
 */
function extractModules(
  interfaceNode: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  registry: ExtractedRegistry,
  sourceFile: ts.SourceFile,
  tsconfigDir: string,
  baseUrl: string
): void {
  for (const member of interfaceNode.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)))
      continue;

    const moduleName = member.name.text;
    const type = member.type;

    if (!type) continue;

    const moduleData = extractModuleType(type, checker);
    if (!moduleData) {
      const typeText = type.getText();
      throw new Error(
        `Invalid Module definition for "${moduleName}" in ${sourceFile.fileName}:\n` +
          `  Expected: Module<{ desc: string; type: typeof import("...") }>\n` +
          `  Received: ${typeText}\n` +
          `  All properties in the Modules interface must use the Module<...> helper type with a valid import path.\n` +
          `  The 'type' field must be 'typeof import("path/to/module")' - plain types like 'any' are not allowed.\n` +
          `  If you want to use Export<...>, define it in an 'interface Exports' instead.`
      );
    }

    if (moduleData) {
      // Resolve and validate import path if present
      let resolvedPath: string | undefined;
      let pathExists = false;

      if (moduleData.importPath) {
        // Try to resolve from baseUrl (tsconfig baseUrl) first
        const absoluteFromBaseUrl = resolveModulePath(moduleData.importPath, baseUrl);

        if (absoluteFromBaseUrl) {
          const checkBaseUrl = checkPathExists(absoluteFromBaseUrl);

          if (checkBaseUrl.exists) {
            // Store as relative path from baseUrl
            resolvedPath = path.relative(baseUrl, checkBaseUrl.actualPath).replace(/\\/g, "/");
            pathExists = true;
          } else {
            // Try relative to the source file where Module was declared
            const sourceFileDir = path.dirname(sourceFile.fileName);
            const absoluteFromSourceFile = resolveModulePath(moduleData.importPath, sourceFileDir);

            if (absoluteFromSourceFile) {
              const checkSourceFile = checkPathExists(absoluteFromSourceFile);

              if (checkSourceFile.exists) {
                // Store as relative path from baseUrl
                resolvedPath = path
                  .relative(baseUrl, checkSourceFile.actualPath)
                  .replace(/\\/g, "/");
                pathExists = true;
              } else {
                // Path doesn't exist, store relative to baseUrl
                resolvedPath = path.relative(baseUrl, absoluteFromBaseUrl).replace(/\\/g, "/");
              }
            }
          }
        }
      }

      registry.modules.set(moduleName, {
        ...moduleData,
        resolvedPath,
        pathExists,
      });
    }
  }
}

/**
 * Extract desc and type from Module<{ ... }> type.
 *
 * EXTRACTS IMPORT PATHS:
 * We're looking for: Module<{ desc: "...", type: typeof import("...") }>
 * The import path can be:
 * - Relative: "./auth" or "../services/auth"
 * - Absolute from tsconfig paths: "@/auth" or "@electron-main/auth"
 * Walk the type arguments -> object literal -> property values.
 */
function extractModuleType(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): { desc: string; type?: string; importPath?: string } | null {
  if (!ts.isTypeReferenceNode(typeNode)) return null;

  const typeArgs = typeNode.typeArguments;
  if (!typeArgs || typeArgs.length === 0) return null;

  const objectType = typeArgs[0];
  if (!ts.isTypeLiteralNode(objectType)) return null;

  let desc = "";
  let typeSignature: string | undefined;
  let importPath: string | undefined;

  for (const member of objectType.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)))
      continue;

    const propName = member.name.text;
    const propType = member.type;

    if (propName === "desc" && propType && ts.isLiteralTypeNode(propType)) {
      desc = (propType.literal as ts.StringLiteral).text;
    } else if (propName === "type" && propType) {
      // Get the full type text
      typeSignature = propType.getText();

      // Try to extract import path from typeof import("...")
      importPath = extractImportPath(propType);

      // Enforce that modules must have import paths
      if (!importPath) {
        return null; // Invalid module - will trigger error in extractModules
      }
    }
  }

  return desc && importPath ? { desc, type: typeSignature, importPath } : null;
}

/**
 * Extract all Terms from the Terms interface.
 *
 * SIMPLER STRUCTURE:
 * Terms just map to string descriptions, no complex generics:
 * ```ts
 * interface Terms {
 *   JWT: Term<"JSON Web Token">;
 *   OAuth: Term<"Open Authorization 2.0">;
 * }
 * ```
 *
 * We extract: termName -> description string.
 */
function extractTerms(
  interfaceNode: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  registry: ExtractedRegistry,
  sourceFile: ts.SourceFile
): void {
  for (const member of interfaceNode.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)))
      continue;

    const termName = member.name.text;
    const type = member.type;

    if (!type) continue;

    const desc = extractTermType(type);
    if (!desc) {
      const typeText = type.getText();
      throw new Error(
        `Invalid Term definition for "${termName}" in ${sourceFile.fileName}:\n` +
          `  Expected: string literal type (e.g., "description text")\n` +
          `  Received: ${typeText}\n` +
          `  All properties in the Terms interface must be string literals.`
      );
    }

    if (desc) {
      registry.terms.set(termName, desc);
    }
  }
}

/**
 * Extract description from Term<"..."> type
 */
function extractTermType(typeNode: ts.TypeNode): string | null {
  if (!ts.isTypeReferenceNode(typeNode)) return null;

  const typeArgs = typeNode.typeArguments;
  if (!typeArgs || typeArgs.length === 0) return null;

  const descType = typeArgs[0];
  if (ts.isLiteralTypeNode(descType) && ts.isStringLiteral(descType.literal)) {
    return descType.literal.text;
  }

  return null;
}

/**
 * Extract all Exports from the Exports interface.
 *
 * SAME PATTERN AS MODULES:
 * Given:
 * ```ts
 * interface Exports {
 *   API_BASE_URL: Export<{ desc: "Base URL constant", type: typeof import("@/config/constants").API_BASE_URL }>;
 *   useAuth: Export<{ desc: "Auth hook", type: typeof import("@/hooks/useAuth").useAuth }>;
 * }
 * ```
 *
 * Extract export name + desc + type (typeof import) and resolve import paths.
 */
function extractExports(
  interfaceNode: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  registry: ExtractedRegistry,
  sourceFile: ts.SourceFile,
  tsconfigDir: string,
  baseUrl: string
): void {
  for (const member of interfaceNode.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)))
      continue;

    const exportName = member.name.text;
    const type = member.type;

    if (!type) continue;

    const exportData = extractExportType(type, checker);
    if (!exportData) {
      const typeText = type.getText();
      throw new Error(
        `Invalid Export definition for "${exportName}" in ${sourceFile.fileName}:\n` +
          `  Expected: Export<{ desc: string; type: unknown }>\n` +
          `  Received: ${typeText}\n` +
          `  All properties in the Exports interface must use the Export<...> helper type.`
      );
    }

    if (exportData) {
      // Resolve and validate import path if present
      let resolvedPath: string | undefined;
      let pathExists = false;

      if (exportData.importPath) {
        // Try to resolve from baseUrl (tsconfig baseUrl) first
        const absoluteFromBaseUrl = resolveModulePath(exportData.importPath, baseUrl);

        if (absoluteFromBaseUrl) {
          const checkBaseUrl = checkPathExists(absoluteFromBaseUrl);

          if (checkBaseUrl.exists) {
            // Store as relative path from baseUrl
            resolvedPath = path.relative(baseUrl, checkBaseUrl.actualPath).replace(/\\/g, "/");
            pathExists = true;
          } else {
            // Try relative to the source file where Export was declared
            const sourceFileDir = path.dirname(sourceFile.fileName);
            const absoluteFromSourceFile = resolveModulePath(exportData.importPath, sourceFileDir);

            if (absoluteFromSourceFile) {
              const checkSourceFile = checkPathExists(absoluteFromSourceFile);

              if (checkSourceFile.exists) {
                // Store as relative path from baseUrl
                resolvedPath = path
                  .relative(baseUrl, checkSourceFile.actualPath)
                  .replace(/\\/g, "/");
                pathExists = true;
              } else {
                // Path doesn't exist, store relative to baseUrl
                resolvedPath = path.relative(baseUrl, absoluteFromBaseUrl).replace(/\\/g, "/");
              }
            }
          }
        }
      }

      registry.exports.set(exportName, {
        ...exportData,
        resolvedPath,
        pathExists,
      });
    }
  }
}

/**
 * Extract desc and type from Export<{ ... }> type.
 *
 * EXTRACTS IMPORT PATHS:
 * We're looking for: Export<{ desc: "...", type: typeof import("...").exportName }>
 * The import path can be:
 * - Relative: "./auth" or "../services/auth"
 * - Absolute from tsconfig paths: "@/auth" or "@electron-main/auth"
 * Walk the type arguments -> object literal -> property values.
 */
function extractExportType(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): { desc: string; type?: string; importPath?: string } | null {
  if (!ts.isTypeReferenceNode(typeNode)) return null;

  const typeArgs = typeNode.typeArguments;
  if (!typeArgs || typeArgs.length === 0) return null;

  const objectType = typeArgs[0];
  if (!ts.isTypeLiteralNode(objectType)) return null;

  let desc = "";
  let typeSignature: string | undefined;
  let importPath: string | undefined;

  for (const member of objectType.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)))
      continue;

    const propName = member.name.text;
    const propType = member.type;

    if (propName === "desc" && propType && ts.isLiteralTypeNode(propType)) {
      desc = (propType.literal as ts.StringLiteral).text;
    } else if (propName === "type" && propType) {
      // Get the full type text
      typeSignature = propType.getText();

      // Try to extract import path from typeof import("...")
      importPath = extractImportPath(propType);
    }
  }

  return desc ? { desc, type: typeSignature, importPath } : null;
}

/**
 * Extract import path from typeof import("...") expression.
 *
 * PARSING IMPORT TYPES:
 * TypeScript represents `typeof import("@/auth")` as a TypeQueryNode.
 * We need to walk the AST to find the ImportTypeNode within it.
 *
 * @param typeNode - The type node that might contain an import
 * @returns The import path string, or undefined
 */
function extractImportPath(typeNode: ts.TypeNode): string | undefined {
  let importPath: string | undefined;

  // Walk the type node tree looking for ImportTypeNode
  function visit(node: ts.Node): void {
    if (ts.isImportTypeNode(node)) {
      const argument = node.argument;

      // The argument is a LiteralTypeNode with a StringLiteral
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        importPath = argument.literal.text;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(typeNode);
  return importPath;
}

/**
 * Resolve a module path (which might be relative or use tsconfig path aliases).
 *
 * RESOLUTION STRATEGY:
 * 1. If path starts with . or .., resolve as relative path
 * 2. If path starts with @, try common tsconfig patterns:
 *    - @/ -> src/
 *    - @electron-main/ -> electron-layers/main/src/
 *    - @electron-renderer/ -> electron-layers/renderer/src/
 * 3. Otherwise return as-is and let existence check determine validity
 *
 * @param importPath - The import path from typeof import("...")
 * @param baseDir - Base directory to resolve from
 * @returns Resolved absolute path, or undefined if can't resolve
 */
function resolveModulePath(importPath: string, baseDir: string): string | undefined {
  // Handle relative paths
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    return path.resolve(baseDir, importPath);
  }

  // Handle tsconfig path aliases (common patterns in this codebase)
  if (importPath.startsWith("@/")) {
    // @/ typically maps to src/
    const withoutAlias = importPath.replace("@/", "src/");
    return path.resolve(baseDir, withoutAlias);
  }

  if (importPath.startsWith("@electron-main/")) {
    const withoutAlias = importPath.replace("@electron-main/", "electron-layers/main/src/");
    return path.resolve(baseDir, withoutAlias);
  }

  if (importPath.startsWith("@electron-renderer/")) {
    const withoutAlias = importPath.replace("@electron-renderer/", "electron-layers/renderer/src/");
    return path.resolve(baseDir, withoutAlias);
  }

  // For other paths (node_modules, etc.), try resolving from baseDir
  return path.resolve(baseDir, importPath);
}

/**
 * Check if a file or directory exists, trying multiple extensions for files.
 *
 * EXTENSION RESOLUTION:
 * For import paths like "@electron-main/main.js", the actual file might be:
 * - main.js (as specified)
 * - main.ts (TypeScript source)
 * - main.tsx (TypeScript with JSX)
 * - main/ (directory with index file)
 *
 * This function tries all common variations.
 *
 * @param absolutePath - The absolute path to check
 * @returns Object with { exists: boolean, actualPath: string }
 */
function checkPathExists(absolutePath: string): {
  exists: boolean;
  actualPath: string;
} {
  // Check if it exists as-is (file or directory)
  if (ts.sys.fileExists(absolutePath) || ts.sys.directoryExists(absolutePath)) {
    return { exists: true, actualPath: absolutePath };
  }

  // If it has an extension, try replacing with TypeScript extensions
  const ext = path.extname(absolutePath);
  if (ext) {
    const basePath = absolutePath.slice(0, -ext.length);
    const tsExtensions = [".ts", ".tsx", ".mts", ".cts"];

    for (const tsExt of tsExtensions) {
      const tsPath = basePath + tsExt;
      if (ts.sys.fileExists(tsPath)) {
        return { exists: true, actualPath: tsPath };
      }
    }
  }

  // Try as a directory
  if (ts.sys.directoryExists(absolutePath)) {
    return { exists: true, actualPath: absolutePath };
  }

  return { exists: false, actualPath: absolutePath };
}
