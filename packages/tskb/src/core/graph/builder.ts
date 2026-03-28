import type {
  KnowledgeGraph,
  FolderNode,
  ModuleNode,
  TermNode,
  ExportNode,
  FileNode,
  ExternalNode,
  FlowNode,
  DocNode,
  GraphEdge,
} from "./types.js";
import type { ExtractedRegistry } from "../extraction/registry.js";
import type { ExtractedDoc } from "../extraction/documentation.js";
import fs from "node:fs";
import path from "node:path";
import { ROOT_FOLDER_NAME } from "../constants.js";

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
      files: {},
      externals: {},
      flows: {},
      docs: {},
    },
    edges: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
      rootPath: path.relative(process.cwd(), baseDir) || ".",
      stats: {
        folderCount: 0,
        moduleCount: 0,
        termCount: 0,
        exportCount: 0,
        fileCount: 0,
        externalCount: 0,
        flowCount: 0,
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
  buildFileNodes(registry, graph);
  buildExternalNodes(registry, graph);

  // Enrich folder children with node IDs from registered folders/modules
  enrichFolderChildren(graph);

  // Detect npm packages (folders with package.json containing a name)
  detectPackageFolders(graph);

  // Build flow nodes from doc-extracted flows
  buildFlowNodes(docs, graph);

  // Build nodes from docs
  buildDocNodes(docs, graph);

  // Build edges (relationships)
  buildEdges(docs, graph);

  // Build hierarchical edges
  buildFolderHierarchy(graph);
  buildModuleFolderMembership(graph);
  buildExportMembership(graph);
  buildFileFolderMembership(graph);

  // Build import edges between modules
  buildModuleImportEdges(graph);

  // Compute edge counts per node
  computeEdgeCounts(graph);

  // Update stats
  updateStats(graph);

  return graph;
}

/**
 * Add system root folder representing the root directory (from tsconfig rootDir).
 * This is automatically injected and represents the base directory from tsconfig.
 */
function addSystemRootFolder(graph: KnowledgeGraph, baseDir: string): void {
  const node: FolderNode = {
    id: ROOT_FOLDER_NAME,
    type: "folder",
    desc: "The root directory (automatically added by tskb)",
    path: path.relative(process.cwd(), baseDir) || ".",
  };
  graph.nodes.folders[ROOT_FOLDER_NAME] = node;
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
      path: data.resolvedPath ?? data.path,
      ...(data.folderSummary
        ? {
            structureSummary: data.folderSummary.summary,
            children: data.folderSummary.children,
          }
        : {}),
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
      resolvedPath: data.resolvedPath,
      ...(data.morphology
        ? {
            morphologySummary: data.morphology.summary,
            morphology: data.morphology.morphology,
          }
        : {}),
      ...(data.imports
        ? {
            importsSummary: data.imports.importsSummary,
            imports: data.imports.imports,
            importEntries: data.imports.importEntries,
          }
        : {}),
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
      resolvedPath: data.resolvedPath,
      ...(data.morphology
        ? {
            morphologySummary: data.morphology.summary,
            morphology: data.morphology.morphology,
          }
        : {}),
    };
    graph.nodes.exports[name] = node;
  }
}

/**
 * Create File nodes from registry
 */
function buildFileNodes(registry: ExtractedRegistry, graph: KnowledgeGraph): void {
  for (const [name, data] of registry.files.entries()) {
    const node: FileNode = {
      id: name,
      type: "file",
      desc: data.desc,
      path: data.resolvedPath ?? data.path,
    };
    graph.nodes.files[name] = node;
  }
}

/**
 * Create External nodes from registry
 */
function buildExternalNodes(registry: ExtractedRegistry, graph: KnowledgeGraph): void {
  for (const [name, data] of registry.externals.entries()) {
    const node: ExternalNode = {
      id: name,
      type: "external",
      desc: data.desc,
      metadata: data.metadata,
    };
    graph.nodes.externals[name] = node;
  }
}

/**
 * Enrich folder children with node IDs by matching child paths against registered folders and modules.
 *
 * For each folder that has children, check if any child folder name corresponds to a registered
 * folder node (by path) or if any child file corresponds to a registered module node (by resolvedPath).
 */
function enrichFolderChildren(graph: KnowledgeGraph): void {
  // Build path → node lookups
  const folderPathToNode = new Map<string, FolderNode>();
  for (const folder of Object.values(graph.nodes.folders)) {
    if (folder.path) folderPathToNode.set(folder.path, folder);
  }

  const modulePathToNode = new Map<string, ModuleNode>();
  for (const mod of Object.values(graph.nodes.modules)) {
    if (mod.resolvedPath) modulePathToNode.set(mod.resolvedPath, mod);
  }

  for (const folder of Object.values(graph.nodes.folders)) {
    if (!folder.children || !folder.path) continue;

    const basePath = folder.path === "." ? "" : folder.path;

    // Enrich child folders
    for (const child of folder.children.folders) {
      const childPath = basePath ? `${basePath}/${child.name}` : child.name;
      const match = folderPathToNode.get(childPath);
      if (match) {
        child.nodeId = match.id;
        child.desc = match.desc;
      }
    }

    // Enrich child files
    for (const child of folder.children.files) {
      const childPath = basePath ? `${basePath}/${child.name}` : child.name;
      // Try exact match first, then without extension (modules resolve to .ts but file might be listed as-is)
      let match = modulePathToNode.get(childPath);
      if (!match) {
        const base = childPath.replace(/\.[^.]+$/, "");
        for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
          match = modulePathToNode.get(base + ext);
          if (match) break;
        }
      }
      if (match) {
        child.nodeId = match.id;
        child.desc = match.desc;
      }
    }
  }
}

/**
 * Detect folders that are npm package roots by checking for package.json with a name field.
 * Sets the packageName property on matching FolderNodes.
 */
function detectPackageFolders(graph: KnowledgeGraph): void {
  for (const folder of Object.values(graph.nodes.folders)) {
    if (!folder.path) continue;

    const pkgPath = path.resolve(process.cwd(), folder.path, "package.json");
    try {
      const raw = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw);
      if (typeof pkg.name === "string" && pkg.name) {
        folder.packageName = pkg.name;
      }
    } catch {
      // No package.json or invalid — skip
    }
  }
}

/**
 * Create Flow nodes from extracted documentation flows and emit flow-step edges.
 * Flows are defined via <Flow> JSX elements inside docs — they become first-class
 * graph nodes with ordered steps referencing other nodes.
 */
function buildFlowNodes(docs: ExtractedDoc[], graph: KnowledgeGraph): void {
  for (const doc of docs) {
    if (!doc.flows || doc.flows.length === 0) continue;

    for (const flow of doc.flows) {
      const node: FlowNode = {
        id: flow.name,
        type: "flow",
        desc: flow.desc,
        priority: flow.priority,
        steps: flow.steps.map((s, i) => ({
          nodeId: s.nodeId,
          order: i,
          ...(s.label ? { label: s.label } : {}),
        })),
      };
      graph.nodes.flows[flow.name] = node;

      // Create flow-step edges
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        // Verify the step target exists in the graph
        const exists =
          graph.nodes.folders[step.nodeId] ||
          graph.nodes.modules[step.nodeId] ||
          graph.nodes.terms[step.nodeId] ||
          graph.nodes.exports[step.nodeId] ||
          graph.nodes.files[step.nodeId] ||
          graph.nodes.externals[step.nodeId];
        if (exists) {
          graph.edges.push({
            from: flow.name,
            to: step.nodeId,
            type: "flow-step",
            label: step.label,
          });
        } else {
          throw new Error(
            `Unresolved flow step reference "${step.nodeId}" in flow "${flow.name}" (doc "${doc.filePath}"):\n` +
              `  The step references a node that does not exist in the registry.\n` +
              `  Make sure "${step.nodeId}" is declared in a registry interface.`
          );
        }
      }
    }
  }
}

/**
 * Create Doc nodes from extracted documentation
 */
function buildDocNodes(docs: ExtractedDoc[], graph: KnowledgeGraph): void {
  for (const doc of docs) {
    // doc.filePath is already relative from extraction, use it directly as both id and filePath
    const id = doc.filePath;

    const node: DocNode = {
      id,
      type: "doc",
      explains: doc.explains,
      priority: doc.priority,
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
 * If doc references a non-existent node, we throw an error to catch broken references early.
 *
 * FUTURE EDGE TYPES:
 * Could add more relationship types:
 * - "belongs-to": Module belongs to Context (if we annotate that)
 * - "related-to": Doc is related to another Doc
 * - "implements": Module implements an interface
 *
 * Right now we just do "references" which is the most important.
 */
function buildEdges(docs: ExtractedDoc[], graph: KnowledgeGraph): void {
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
      } else {
        throw new Error(
          `Unresolved module reference "${moduleName}" in doc "${docId}":\n` +
            `  The doc references a module that does not exist in the registry.\n` +
            `  Make sure "${moduleName}" is declared in a \`namespace tskb { interface Modules { ... } }\` block.`
        );
      }
    }

    for (const termName of doc.references.terms) {
      if (graph.nodes.terms[termName]) {
        graph.edges.push({
          from: docId,
          to: termName,
          type: "references",
        });
      } else {
        throw new Error(
          `Unresolved term reference "${termName}" in doc "${docId}":\n` +
            `  The doc references a term that does not exist in the registry.\n` +
            `  Make sure "${termName}" is declared in a \`namespace tskb { interface Terms { ... } }\` block.`
        );
      }
    }

    for (const folderName of doc.references.folders) {
      if (graph.nodes.folders[folderName]) {
        graph.edges.push({
          from: docId,
          to: folderName,
          type: "references",
        });
      } else {
        throw new Error(
          `Unresolved folder reference "${folderName}" in doc "${docId}":\n` +
            `  The doc references a folder that does not exist in the registry.\n` +
            `  Make sure "${folderName}" is declared in a \`namespace tskb { interface Folders { ... } }\` block.`
        );
      }
    }

    for (const exportName of doc.references.exports) {
      if (graph.nodes.exports[exportName]) {
        graph.edges.push({
          from: docId,
          to: exportName,
          type: "references",
        });
      } else {
        throw new Error(
          `Unresolved export reference "${exportName}" in doc "${docId}":\n` +
            `  The doc references an export that does not exist in the registry.\n` +
            `  Make sure "${exportName}" is declared in a \`namespace tskb { interface Exports { ... } }\` block.`
        );
      }
    }

    for (const fileName of doc.references.files) {
      if (graph.nodes.files[fileName]) {
        graph.edges.push({
          from: docId,
          to: fileName,
          type: "references",
        });
      } else {
        throw new Error(
          `Unresolved file reference "${fileName}" in doc "${docId}":\n` +
            `  The doc references a file that does not exist in the registry.\n` +
            `  Make sure "${fileName}" is declared in a \`namespace tskb { interface Files { ... } }\` block.`
        );
      }
    }

    for (const externalName of doc.references.externals) {
      if (graph.nodes.externals[externalName]) {
        graph.edges.push({
          from: docId,
          to: externalName,
          type: "references",
        });
      } else {
        throw new Error(
          `Unresolved external reference "${externalName}" in doc "${docId}":\n` +
            `  The doc references an external that does not exist in the registry.\n` +
            `  Make sure "${externalName}" is declared in a \`namespace tskb { interface Externals { ... } }\` block.`
        );
      }
    }

    // Emit "related-to" edges for each relation in doc.relations
    if (doc.relations && Array.isArray(doc.relations)) {
      for (const rel of doc.relations) {
        // Only emit if both nodes exist
        const fromExists =
          graph.nodes.terms[rel.from] ||
          graph.nodes.modules[rel.from] ||
          graph.nodes.folders[rel.from] ||
          graph.nodes.exports[rel.from] ||
          graph.nodes.files[rel.from] ||
          graph.nodes.externals[rel.from];
        const toExists =
          graph.nodes.terms[rel.to] ||
          graph.nodes.modules[rel.to] ||
          graph.nodes.folders[rel.to] ||
          graph.nodes.exports[rel.to] ||
          graph.nodes.files[rel.to] ||
          graph.nodes.externals[rel.to];
        if (fromExists && toExists) {
          const edge: any = {
            from: rel.from,
            to: rel.to,
            type: "related-to",
          };
          if (rel.label) edge.label = rel.label;
          graph.edges.push(edge);
        } else {
          // Optionally, warn or throw if either node is missing
          // throw new Error(`Unresolved node in Relation: from="${rel.from}" to="${rel.to}" in doc "${docId}"`);
        }
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
      if (!folder.path) continue;

      // Both paths are already relative to baseDir, just check prefix
      // Normalize to forward slashes for consistent comparison
      const folderPath = folder.path.replace(/\\/g, "/");
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
        if (!folder.path) continue;

        const folderPath = folder.path.replace(/\\/g, "/");

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
 * Build file-to-folder membership based on resolved paths.
 *
 * If a file's path falls within a folder's path, that file belongs to that folder.
 */
function buildFileFolderMembership(graph: KnowledgeGraph): void {
  const files = Object.values(graph.nodes.files);
  const folders = Object.values(graph.nodes.folders);

  for (const file of files) {
    if (!file.path) continue;

    let bestFolder: FolderNode | null = null;
    let bestFolderPathLength = 0;

    for (const folder of folders) {
      if (!folder.path) continue;

      const folderPath = folder.path.replace(/\\/g, "/");
      const filePath = file.path.replace(/\\/g, "/");

      const isFileInFolder =
        filePath.startsWith(folderPath + "/") || filePath.startsWith(folderPath);

      if (isFileInFolder) {
        if (folderPath.length > bestFolderPathLength) {
          bestFolder = folder;
          bestFolderPathLength = folderPath.length;
        }
      }
    }

    if (bestFolder) {
      graph.edges.push({
        from: file.id,
        to: bestFolder.id,
        type: "belongs-to",
      });
    }
  }
}

/**
 * Build import edges between modules.
 *
 * For each module that has imports, resolve the import paths relative to the
 * module's own resolvedPath. If the resolved path matches another module's
 * resolvedPath, create an "imports" edge: importingModule -> importedModule.
 */
function buildModuleImportEdges(graph: KnowledgeGraph): void {
  const modules = Object.values(graph.nodes.modules);

  // Build a lookup: normalized resolvedPath (without extension) -> module ID
  const pathToModuleId = new Map<string, string>();
  for (const mod of modules) {
    if (mod.resolvedPath) {
      const normalized = stripExtension(mod.resolvedPath.replace(/\\/g, "/"));
      pathToModuleId.set(normalized, mod.id);
    }
  }

  // Build a lookup: packageName -> folder ID for bare specifier resolution
  const packageNameToFolderId = new Map<string, string>();
  for (const folder of Object.values(graph.nodes.folders)) {
    if (folder.packageName) {
      packageNameToFolderId.set(folder.packageName, folder.id);
    }
  }

  for (const mod of modules) {
    if (!mod.importEntries || !mod.resolvedPath) continue;

    const moduleDir = path.posix.dirname(mod.resolvedPath.replace(/\\/g, "/"));
    const seen = new Set<string>(); // avoid duplicate edges to same target

    for (const entry of mod.importEntries) {
      if (entry.path.startsWith("./") || entry.path.startsWith("../")) {
        // Resolve relative imports to modules
        const resolved = path.posix.normalize(path.posix.join(moduleDir, entry.path));
        const normalizedResolved = stripExtension(resolved);

        const targetId = pathToModuleId.get(normalizedResolved);
        if (targetId && targetId !== mod.id && !seen.has(targetId)) {
          seen.add(targetId);
          graph.edges.push({
            from: mod.id,
            to: targetId,
            type: "imports",
          });
        }
      } else {
        // Bare specifier — check if it matches a registered package name
        // e.g. "tskb" or "tskb/runtime/jsx" both match package "tskb"
        const specifier = entry.path;
        for (const [pkgName, folderId] of packageNameToFolderId) {
          if (specifier === pkgName || specifier.startsWith(pkgName + "/")) {
            if (folderId !== mod.id && !seen.has(folderId)) {
              seen.add(folderId);
              graph.edges.push({
                from: mod.id,
                to: folderId,
                type: "imports",
              });
            }
            break;
          }
        }
      }
    }
  }
}

/**
 * Strip file extension from a path using path utilities.
 */
function stripExtension(filePath: string): string {
  const ext = path.posix.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
}

/**
 * Count edges per node and store on each node as edgeCount.
 */
function computeEdgeCounts(graph: KnowledgeGraph): void {
  const counts = new Map<string, number>();
  for (const edge of graph.edges) {
    counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  for (const dict of Object.values(graph.nodes)) {
    for (const node of Object.values(dict)) {
      const count = counts.get(node.id);
      if (count) {
        (node as import("./types.js").GraphNode).edgeCount = count;
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
  graph.metadata.stats.fileCount = Object.keys(graph.nodes.files).length;
  graph.metadata.stats.externalCount = Object.keys(graph.nodes.externals).length;
  graph.metadata.stats.flowCount = Object.keys(graph.nodes.flows).length;
  graph.metadata.stats.docCount = Object.keys(graph.nodes.docs).length;
  graph.metadata.stats.edgeCount = graph.edges.length;
}
