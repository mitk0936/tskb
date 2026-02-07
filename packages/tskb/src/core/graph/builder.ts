import type {
  KnowledgeGraph,
  FolderNode,
  ModuleNode,
  TermNode,
  ExportNode,
  DocNode,
  GraphEdge,
} from "./types.js";
import type { ExtractedRegistry } from "../extraction/registry.js";
import type { ExtractedDoc } from "../extraction/documentation.js";
import path from "node:path";
import { REPO_ROOT_FOLDER_NAME } from "../constants.js";

/**
 * Builds a knowledge graph from extracted registry and documentation data.
 *
 * GRAPH STRUCTURE:
 * A knowledge graph has two parts:
 * 1. NODES: The "things" in your system (Folders, Modules, Terms, Docs)
 * 2. EDGES: Relationships between nodes ("doc X references module Y")
 *
 * BUILDING PROCESS:
 * 1. Create nodes from registry:
 *    - Each Folder becomes a FolderNode with { id, desc, path }
 *    - Each Module becomes a ModuleNode with { id, desc, typeSignature }
 *    - Each Term becomes a TermNode with { id, desc }
 *
 * 2. Create nodes from docs:
 *    - Each doc file becomes a DocNode with { id, filePath, content }
 *
 * 3. Create edges from references:
 *    - For each doc, look at its references.modules/terms/folders
 *    - Create an edge: { from: docId, to: moduleId, type: "references" }
 *
 * RESULT:
 * A complete graph that can be queried: "What docs reference Module X?"
 * "What terms are used in Folder Y?", etc.
 *
 * This is what feeds AI tools to understand your architecture.
 *
 * @param registry - Extracted vocabulary (Folders, Modules, Terms)
 * @param docs - Extracted documentation files
 * @param baseDir - Base directory (from tsconfig) to make paths relative to
 * @returns Complete knowledge graph ready for JSON export
 */
export function buildGraph(
  registry: ExtractedRegistry,
  docs: ExtractedDoc[],
  baseDir: string
): KnowledgeGraph {
  const graph: KnowledgeGraph = {
    nodes: {
      folders: {},
      modules: {},
      terms: {},
      exports: {},
      docs: {},
    },
    edges: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
      rootPath: baseDir,
      stats: {
        folderCount: 0,
        moduleCount: 0,
        termCount: 0,
        exportCount: 0,
        docCount: 0,
        edgeCount: 0,
      },
    },
  };

  // Add system root folder node
  addSystemRootFolder(graph, baseDir);

  // Build nodes from registry
  buildFolderNodes(registry, graph);
  buildModuleNodes(registry, graph);
  buildTermNodes(registry, graph);
  buildExportNodes(registry, graph);

  // Build nodes from docs
  buildDocNodes(docs, graph, baseDir);

  // Build edges (relationships)
  buildEdges(docs, graph, baseDir);

  // Build hierarchical edges
  buildFolderHierarchy(graph);
  buildModuleFolderMembership(graph);
  buildExportMembership(graph);

  // Update stats
  updateStats(graph);

  return graph;
}

/**
 * Add system root folder representing the repository root directory.
 * This is automatically injected and represents the base directory from tsconfig.
 */
function addSystemRootFolder(graph: KnowledgeGraph, baseDir: string): void {
  const node: FolderNode = {
    id: REPO_ROOT_FOLDER_NAME,
    type: "folder",
    desc: "The root directory of the repository (automatically added by tskb)",
    path: ".",
    resolvedPath: ".",
    pathExists: true,
  };
  graph.nodes.folders[REPO_ROOT_FOLDER_NAME] = node;
}

/**
 * Create Folder nodes from registry
 */
function buildFolderNodes(registry: ExtractedRegistry, graph: KnowledgeGraph): void {
  for (const [name, data] of registry.folders.entries()) {
    const node: FolderNode = {
      id: name,
      type: "folder",
      desc: data.desc,
      path: data.path,
      resolvedPath: data.resolvedPath,
      pathExists: data.pathExists,
    };
    graph.nodes.folders[name] = node;
  }
}

/**
 * Create Module nodes from registry
 */
function buildModuleNodes(registry: ExtractedRegistry, graph: KnowledgeGraph): void {
  for (const [name, data] of registry.modules.entries()) {
    const node: ModuleNode = {
      id: name,
      type: "module",
      desc: data.desc,
      typeSignature: data.type,
      importPath: data.importPath,
      resolvedPath: data.resolvedPath,
      pathExists: data.pathExists,
    };
    graph.nodes.modules[name] = node;
  }
}

/**
 * Create Term nodes from registry
 */
function buildTermNodes(registry: ExtractedRegistry, graph: KnowledgeGraph): void {
  for (const [name, desc] of registry.terms.entries()) {
    const node: TermNode = {
      id: name,
      type: "term",
      desc,
    };
    graph.nodes.terms[name] = node;
  }
}

/**
 * Create Export nodes from registry
 */
function buildExportNodes(registry: ExtractedRegistry, graph: KnowledgeGraph): void {
  for (const [name, data] of registry.exports.entries()) {
    const node: ExportNode = {
      id: name,
      type: "export",
      desc: data.desc,
      typeSignature: data.type,
      importPath: data.importPath,
      resolvedPath: data.resolvedPath,
      pathExists: data.pathExists,
    };
    graph.nodes.exports[name] = node;
  }
}

/**
 * Create Doc nodes from extracted documentation
 */
function buildDocNodes(docs: ExtractedDoc[], graph: KnowledgeGraph, baseDir: string): void {
  for (const doc of docs) {
    // doc.filePath is already relative from extraction, use it directly as both id and filePath
    const id = doc.filePath;

    const node: DocNode = {
      id,
      type: "doc",
      filePath: doc.filePath, // Now relative, not absolute
      content: doc.content,
      format: doc.format,
    };

    graph.nodes.docs[id] = node;
  }
}

/**
 * Build edges (relationships) between nodes.
 *
 * CREATING GRAPH RELATIONSHIPS:
 * We have all the nodes, now we connect them based on references.
 *
 * For each doc file:
 * - Look at doc.references.modules = ["AuthService", "PaymentAPI"]
 * - For each module name, create edge: doc -> module (type: "references")
 * - Same for terms and contexts
 *
 * VALIDATION:
 * We only create edges if the target node actually exists in the graph.
 * If doc references "NonExistentModule", we skip it (could log a warning).
 *
 * FUTURE EDGE TYPES:
 * Could add more relationship types:
 * - "belongs-to": Module belongs to Context (if we annotate that)
 * - "related-to": Doc is related to another Doc
 * - "implements": Module implements an interface
 *
 * Right now we just do "references" which is the most important.
 */
function buildEdges(docs: ExtractedDoc[], graph: KnowledgeGraph, baseDir: string): void {
  for (const doc of docs) {
    // doc.filePath is already relative from extraction
    const docId = doc.filePath;

    // Create "references" edges from doc to modules/terms/contexts
    for (const moduleName of doc.references.modules) {
      if (graph.nodes.modules[moduleName]) {
        graph.edges.push({
          from: docId,
          to: moduleName,
          type: "references",
        });
      }
    }

    for (const termName of doc.references.terms) {
      if (graph.nodes.terms[termName]) {
        graph.edges.push({
          from: docId,
          to: termName,
          type: "references",
        });
      }
    }

    for (const folderName of doc.references.folders) {
      if (graph.nodes.folders[folderName]) {
        graph.edges.push({
          from: docId,
          to: folderName,
          type: "references",
        });
      }
    }

    for (const exportName of doc.references.exports) {
      if (graph.nodes.exports[exportName]) {
        graph.edges.push({
          from: docId,
          to: exportName,
          type: "references",
        });
      }
    }
  }
}

/**
 * Build folder hierarchy based on path nesting.
 *
 * HIERARCHICAL STRUCTURE:
 * Folders with nested paths create parent-child relationships.
 * For example:
 * - "/electron-layers" contains "/electron-layers/main"
 * - "/electron-layers/main" contains "/electron-layers/main/features/auth"
 *
 * This creates a tree structure that can be traversed:
 * "Show me all folders under ElectronLayers"
 * "What's the full path from Root to BoardCommunication?"
 *
 * ALGORITHM:
 * For each pair of folders, if childPath starts with parentPath + '/',
 * create a "contains" edge from parent to child.
 */
function buildFolderHierarchy(graph: KnowledgeGraph): void {
  const folders = Object.values(graph.nodes.folders);

  for (const child of folders) {
    if (!child.path) continue;

    // Find the most specific parent (longest matching path)
    let bestParent: FolderNode | null = null;
    let bestParentPathLength = 0;

    for (const parent of folders) {
      if (!parent.path || parent.id === child.id) continue;

      // Use path.relative to check if child is within parent
      const relativePath = path.posix.relative(parent.path, child.path);

      // If relative path doesn't start with '..' and isn't empty, child is within parent
      const isChildOfParent =
        relativePath && !relativePath.startsWith("..") && relativePath !== ".";

      if (isChildOfParent) {
        // Use the longest matching parent (most specific)
        if (parent.path.length > bestParentPathLength) {
          bestParent = parent;
          bestParentPathLength = parent.path.length;
        }
      }
    }

    // Create edge from parent to child
    if (bestParent) {
      graph.edges.push({
        from: bestParent.id,
        to: child.id,
        type: "contains",
      });
    }
  }
}

/**
 * Build module-to-folder membership based on resolved paths.
 *
 * MODULE OWNERSHIP:
 * If a module's resolvedPath falls within a folder's resolvedPath,
 * that module belongs to that folder.
 *
 * For example:
 * - Module at "electron-layers/main/src/features/auth/AuthService.ts"
 * - Folder at "electron-layers/main/features/auth"
 * - Creates "belongs-to" edge: AuthService -> Auth folder
 *
 * This answers:
 * "What modules are part of the Auth folder?"
 * "Is this module in the right place?"
 *
 * ALGORITHM:
 * For each module with a resolvedPath, find the most specific folder
 * whose resolvedPath is a prefix of the module's path.
 */
function buildModuleFolderMembership(graph: KnowledgeGraph): void {
  const modules = Object.values(graph.nodes.modules);
  const folders = Object.values(graph.nodes.folders);

  for (const module of modules) {
    if (!module.resolvedPath) continue;

    // Find the most specific folder (longest matching path)
    let bestFolder: FolderNode | null = null;
    let bestFolderPathLength = 0;

    for (const folder of folders) {
      if (!folder.resolvedPath) continue;

      // Both paths are already relative to baseDir, just check prefix
      // Normalize to forward slashes for consistent comparison
      const folderPath = folder.resolvedPath.replace(/\\/g, "/");
      const modulePath = module.resolvedPath.replace(/\\/g, "/");

      // Check if module path starts with folder path
      const isModuleInFolder =
        modulePath.startsWith(folderPath + "/") || modulePath.startsWith(folderPath);

      if (isModuleInFolder) {
        // Use the longest matching folder (most specific)
        if (folderPath.length > bestFolderPathLength) {
          bestFolder = folder;
          bestFolderPathLength = folderPath.length;
        }
      }
    }

    // Create edge from module to folder
    if (bestFolder) {
      graph.edges.push({
        from: module.id,
        to: bestFolder.id,
        type: "belongs-to",
      });
    }
  }
}

/**
 * Build export membership - connect exports to their parent module or folder.
 *
 * EXPORT OWNERSHIP:
 * Exports can belong to:
 * 1. A Module - if the export's resolvedPath matches a module's resolvedPath
 * 2. A Folder - if the export's path falls within a folder's path (but no matching module)
 *
 * This creates a three-level hierarchy:
 * Folder -> Module -> Export
 * or
 * Folder -> Export (if no module is defined for that file)
 *
 * ALGORITHM:
 * For each export with a resolvedPath:
 * 1. First try to find a matching module (same file)
 * 2. If no module, find the most specific folder containing it
 */
function buildExportMembership(graph: KnowledgeGraph): void {
  const exports = Object.values(graph.nodes.exports);
  const modules = Object.values(graph.nodes.modules);
  const folders = Object.values(graph.nodes.folders);

  for (const exp of exports) {
    if (!exp.resolvedPath) continue;

    // Normalize path for comparison
    const exportPath = exp.resolvedPath.replace(/\\/g, "/");

    // First, try to find a matching module (same file)
    let foundModule = false;
    for (const module of modules) {
      if (!module.resolvedPath) continue;

      const modulePath = module.resolvedPath.replace(/\\/g, "/");

      // Check if they're from the same file (handle .ts/.tsx/.js variations)
      const exportBase = exportPath.replace(/\.(ts|tsx|js|jsx)$/, "");
      const moduleBase = modulePath.replace(/\.(ts|tsx|js|jsx)$/, "");

      if (exportBase === moduleBase) {
        graph.edges.push({
          from: exp.id,
          to: module.id,
          type: "belongs-to",
        });
        foundModule = true;
        break;
      }
    }

    // If no module found, try to find the most specific folder
    if (!foundModule) {
      let bestFolder: FolderNode | null = null;
      let bestFolderPathLength = 0;

      for (const folder of folders) {
        if (!folder.resolvedPath) continue;

        const folderPath = folder.resolvedPath.replace(/\\/g, "/");

        // Check if export path starts with folder path
        const isExportInFolder =
          exportPath.startsWith(folderPath + "/") || exportPath.startsWith(folderPath);

        if (isExportInFolder) {
          // Use the longest matching folder (most specific)
          if (folderPath.length > bestFolderPathLength) {
            bestFolder = folder;
            bestFolderPathLength = folderPath.length;
          }
        }
      }

      // Create edge from export to folder
      if (bestFolder) {
        graph.edges.push({
          from: exp.id,
          to: bestFolder.id,
          type: "belongs-to",
        });
      }
    }
  }
}

/**
 * Update graph statistics
 */
function updateStats(graph: KnowledgeGraph): void {
  graph.metadata.stats.folderCount = Object.keys(graph.nodes.folders).length;
  graph.metadata.stats.moduleCount = Object.keys(graph.nodes.modules).length;
  graph.metadata.stats.termCount = Object.keys(graph.nodes.terms).length;
  graph.metadata.stats.exportCount = Object.keys(graph.nodes.exports).length;
  graph.metadata.stats.docCount = Object.keys(graph.nodes.docs).length;
  graph.metadata.stats.edgeCount = graph.edges.length;
}

/**
 * Normalize file path to use as node ID
 * Converts absolute paths to relative from the base directory
 */
function normalizeFilePath(filePath: string, baseDir: string): string {
  // Make path relative to base directory and use forward slashes
  const relativePath = path.relative(baseDir, filePath);
  return relativePath.replace(/\\/g, "/");
}
