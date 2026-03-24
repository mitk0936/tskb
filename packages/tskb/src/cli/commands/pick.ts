import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time, jsonOut, plainOut } from "../utils/logger.js";
import {
  resolveNode,
  getNodeEdges,
  findReferencingDocs,
  findParent,
  type NodeEdges,
  type DocRef,
  type ResolvedVia,
} from "../utils/resolve-node.js";

// --- Result types ---

interface FolderPickResult {
  type: "folder";
  resolvedVia: ResolvedVia;
  node: {
    nodeId: string;
    desc: string;
    path?: string;
    packageName?: string;
    structureSummary?: string;
    children?: import("../../core/graph/types.js").FolderNode["children"];
  };
  parent?: { nodeId: string; type: string; desc: string };
  exports: Array<{ nodeId: string; desc: string; path?: string }>;
  importedBy?: Array<{ moduleId: string; desc: string }>;
  referencingDocs: DocRef[];
  relations?: Array<{ from: string; to: string; label?: string }>;
}

interface ModulePickResult {
  type: "module";
  resolvedVia: ResolvedVia;
  node: {
    nodeId: string;
    desc: string;
    typeSignature?: string;
    resolvedPath?: string;
    morphologySummary?: string;
    morphology?: string[];
    importsSummary?: string;
    imports?: Array<{ entry: string; moduleId?: string }>;
  };
  parentFolder?: { nodeId: string; desc: string; path?: string };
  exports: Array<{ nodeId: string; desc: string; typeSignature?: string }>;
  importedBy?: Array<{ moduleId: string; desc: string }>;
  referencingDocs: DocRef[];
  relations?: Array<{ from: string; to: string; label?: string }>;
}

interface ExportPickResult {
  type: "export";
  resolvedVia: ResolvedVia;
  node: {
    nodeId: string;
    desc: string;
    typeSignature?: string;
    resolvedPath?: string;
    morphologySummary?: string;
    morphology?: string[];
  };
  parent?: { nodeId: string; type: string; desc: string; morphologySummary?: string };
  referencingDocs: DocRef[];
  relations?: Array<{ from: string; to: string; label?: string }>;
}

interface TermPickResult {
  type: "term";
  resolvedVia: ResolvedVia;
  node: { nodeId: string; desc: string };
  referencingDocs: DocRef[];
  relations?: Array<{ from: string; to: string; label?: string }>;
}

interface FilePickResult {
  type: "file";
  resolvedVia: ResolvedVia;
  node: {
    nodeId: string;
    desc: string;
    path?: string;
  };
  parentFolder?: { nodeId: string; desc: string; path?: string };
  referencingDocs: DocRef[];
  relations?: Array<{ from: string; to: string; label?: string }>;
}

interface DocPickResult {
  type: "doc";
  resolvedVia: ResolvedVia;
  node: {
    nodeId: string;
    explains: string;
    filePath: string;
    format: string;
    priority: string;
    content: string;
  };
  relations?: Array<{ from: string; to: string; label?: string }>;
}

type PickResult =
  | FolderPickResult
  | ModulePickResult
  | ExportPickResult
  | TermPickResult
  | FilePickResult
  | DocPickResult;

// --- Per-type resolvers ---

type NodeResolver<T extends PickResult = PickResult> = (
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
) => T;

function resolveFolder(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): FolderPickResult {
  const folder = node as import("../../core/graph/types.js").FolderNode;

  const parent = findParent(edges, graph);

  // Collect exports that belong directly to this folder (not via a module)
  const exports: FolderPickResult["exports"] = [];
  // Collect modules that import this folder (as a package)
  const importedBy: FolderPickResult["importedBy"] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const exp = graph.nodes.exports[edge.from];
      if (exp) {
        exports.push({ nodeId: edge.from, desc: exp.desc, path: exp.resolvedPath });
      }
    }
    if (edge.type === "imports") {
      const importer = graph.nodes.modules[edge.from];
      if (importer) {
        importedBy.push({ moduleId: edge.from, desc: importer.desc });
      }
    }
  }

  return {
    type: "folder",
    resolvedVia: "id", // placeholder, caller overwrites
    node: {
      nodeId: id,
      desc: folder.desc,
      path: folder.path,
      ...(folder.packageName ? { packageName: folder.packageName } : {}),
      ...(folder.structureSummary ? { structureSummary: folder.structureSummary } : {}),
      ...(folder.children ? { children: folder.children } : {}),
    },
    parent,
    exports,
    ...(importedBy.length > 0 ? { importedBy } : {}),
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveModule(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): ModulePickResult {
  const mod = node as import("../../core/graph/types.js").ModuleNode;

  // parent folder
  const parentEdge = edges.outgoing.find((e) => e.type === "belongs-to");
  let parentFolder: ModulePickResult["parentFolder"];
  if (parentEdge) {
    const folder = graph.nodes.folders[parentEdge.to];
    if (folder) parentFolder = { nodeId: parentEdge.to, desc: folder.desc, path: folder.path };
  }

  // exports that belong to this module
  const exps: ModulePickResult["exports"] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const exp = graph.nodes.exports[edge.from];
      if (exp) exps.push({ nodeId: edge.from, desc: exp.desc, typeSignature: exp.typeSignature });
    }
  }

  // modules that import this module (incoming import edges)
  const importedBy: ModulePickResult["importedBy"] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "imports") {
      const importer = graph.nodes.modules[edge.from];
      if (importer) {
        importedBy.push({ moduleId: edge.from, desc: importer.desc });
      }
    }
  }

  return {
    type: "module",
    resolvedVia: "id",
    node: {
      nodeId: id,
      desc: mod.desc,
      typeSignature: mod.typeSignature,
      resolvedPath: mod.resolvedPath,
      ...(mod.morphologySummary ? { morphologySummary: mod.morphologySummary } : {}),
      ...(mod.morphology ? { morphology: mod.morphology } : {}),
      ...(mod.importsSummary ? { importsSummary: mod.importsSummary } : {}),
      ...(mod.imports
        ? { imports: enrichImportsWithModuleIds(mod.imports, mod.resolvedPath, edges, graph) }
        : {}),
    },
    parentFolder,
    exports: exps,
    ...(importedBy.length > 0 ? { importedBy } : {}),
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveExport(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): ExportPickResult {
  const exp = node as import("../../core/graph/types.js").ExportNode;

  // Find parent and include morphologySummary if parent is a module
  const parent = findParent(edges, graph);
  if (parent) {
    const parentModule = graph.nodes.modules[parent.nodeId];
    if (parentModule?.morphologySummary) {
      parent.morphologySummary = parentModule.morphologySummary;
    }
  }

  return {
    type: "export",
    resolvedVia: "id",
    node: {
      nodeId: id,
      desc: exp.desc,
      typeSignature: exp.typeSignature,
      resolvedPath: exp.resolvedPath,
      ...(exp.morphologySummary ? { morphologySummary: exp.morphologySummary } : {}),
      ...(exp.morphology ? { morphology: exp.morphology } : {}),
    },
    parent,
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveTerm(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): TermPickResult {
  const term = node as import("../../core/graph/types.js").TermNode;

  return {
    type: "term",
    resolvedVia: "id",
    node: { nodeId: id, desc: term.desc },
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveFile(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): FilePickResult {
  const file = node as import("../../core/graph/types.js").FileNode;

  // parent folder
  const parentEdge = edges.outgoing.find((e) => e.type === "belongs-to");
  let parentFolder: FilePickResult["parentFolder"];
  if (parentEdge) {
    const folder = graph.nodes.folders[parentEdge.to];
    if (folder) parentFolder = { nodeId: parentEdge.to, desc: folder.desc, path: folder.path };
  }

  return {
    type: "file",
    resolvedVia: "id",
    node: {
      nodeId: id,
      desc: file.desc,
      path: file.path,
    },
    parentFolder,
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveDoc(
  id: string,
  node: AnyNode,
  _edges: NodeEdges,
  _graph: KnowledgeGraph
): DocPickResult {
  const doc = node as import("../../core/graph/types.js").DocNode;

  return {
    type: "doc",
    resolvedVia: "id",
    node: {
      nodeId: id,
      explains: doc.explains,
      filePath: doc.filePath,
      format: doc.format,
      priority: doc.priority,
      content: doc.content,
    },
  };
}

/**
 * Enrich raw import entries with moduleId when the import target is a known module in the graph.
 * Uses "imports" edges to find which modules this module imports from, then maps import paths
 * to their target module IDs.
 */
function enrichImportsWithModuleIds(
  imports: string[],
  moduleResolvedPath: string | undefined,
  edges: NodeEdges,
  graph: KnowledgeGraph
): Array<{ entry: string; moduleId?: string }> {
  // Collect target node IDs from "imports" edges (can be modules or folders)
  const importTargetIds = new Set<string>();
  for (const edge of edges.outgoing) {
    if (edge.type === "imports") {
      importTargetIds.add(edge.to);
    }
  }

  if (importTargetIds.size === 0) {
    return imports.map((entry) => ({ entry }));
  }

  // Build normalized resolvedPath (without extension) -> moduleId lookup
  const pathToModuleId = new Map<string, string>();
  for (const targetId of importTargetIds) {
    const mod = graph.nodes.modules[targetId];
    if (mod?.resolvedPath) {
      const normalized = stripExt(mod.resolvedPath.replace(/\\/g, "/"));
      pathToModuleId.set(normalized, targetId);
    }
  }

  // Build packageName -> folderId lookup for bare specifier resolution
  const packageNameToFolderId = new Map<string, string>();
  for (const targetId of importTargetIds) {
    const folder = graph.nodes.folders[targetId];
    if (folder?.packageName) {
      packageNameToFolderId.set(folder.packageName, targetId);
    }
  }

  const moduleDir = moduleResolvedPath
    ? path.posix.dirname(moduleResolvedPath.replace(/\\/g, "/"))
    : undefined;

  return imports.map((entry) => {
    const fromIdx = entry.lastIndexOf(' from "');
    if (fromIdx === -1) return { entry };

    const importPath = entry.slice(fromIdx + 7, -1);

    // Resolve relative paths against the module's directory
    if (moduleDir && (importPath.startsWith("./") || importPath.startsWith("../"))) {
      const resolved = stripExt(path.posix.normalize(path.posix.join(moduleDir, importPath)));
      const moduleId = pathToModuleId.get(resolved);
      if (moduleId) return { entry, moduleId };
    } else {
      // Bare specifier — check if it matches a registered package
      for (const [pkgName, folderId] of packageNameToFolderId) {
        if (importPath === pkgName || importPath.startsWith(pkgName + "/")) {
          return { entry, moduleId: folderId };
        }
      }
    }

    return { entry };
  });
}

function stripExt(filePath: string): string {
  const ext = path.posix.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
}

const resolvers: Record<string, NodeResolver> = {
  folder: resolveFolder as NodeResolver,
  module: resolveModule as NodeResolver,
  export: resolveExport as NodeResolver,
  term: resolveTerm as NodeResolver,
  file: resolveFile as NodeResolver,
  doc: resolveDoc as NodeResolver,
};

// --- Public API ---

export async function pick(
  identifier: string,
  optimized: boolean = false,
  plain: boolean = false
): Promise<void> {
  const loadDone = time("Loading graph");
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);
  loadDone();

  const resolveDone = time("Resolving node");
  const resolved = resolveNode(graph, identifier);

  if (!resolved) {
    console.log(
      JSON.stringify(
        {
          error: "Node not found in graph",
          identifier,
          suggestion:
            "Use a valid node ID (folder, module, export, file, term, doc) or a filesystem path. Run `tskb ls` to see available folders.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const resolver = resolvers[resolved.node.type];
  if (!resolver) {
    console.log(
      JSON.stringify(
        { error: "No resolver for node type", type: resolved.node.type, identifier },
        null,
        2
      )
    );
    process.exit(1);
  }

  const edges = getNodeEdges(graph.edges, resolved.id);
  const result = resolver(resolved.id, resolved.node, edges, graph);
  result.resolvedVia = resolved.resolvedVia;

  // Add relations: all related-to edges where this node is from or to
  result.relations = graph.edges
    .filter((e) => e.type === "related-to" && (e.from === resolved.id || e.to === resolved.id))
    .map((e) => ({ from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}) }));

  resolveDone();

  verbose(
    `   Resolved "${identifier}" via ${resolved.resolvedVia} → ${resolved.node.type} "${resolved.id}"`
  );

  if (plain) {
    plainOut(formatPickPlain(result));
  } else {
    jsonOut(result, optimized);
  }
}

// --- Plain text formatting ---

function formatDocs(docs: DocRef[]): string[] {
  if (docs.length === 0) return [];
  const lines = ["  docs:"];
  for (const d of docs) {
    lines.push(`    id: ${d.nodeId} [${d.priority}] — ${d.explains}`);
  }
  return lines;
}

function formatRelations(
  relations?: Array<{ from: string; to: string; label?: string }>
): string[] {
  if (!relations || relations.length === 0) return [];
  const lines = ["  relations:"];
  for (const r of relations) {
    const label = r.label ? ` (${r.label})` : "";
    lines.push(`    ${r.from} → ${r.to}${label}`);
  }
  return lines;
}

function formatModulePlain(result: ModulePickResult): string[] {
  const { node } = result;
  const lines: string[] = [
    `id: ${node.nodeId} (module)`,
    `  ${node.desc}`,
    `  path: ${node.resolvedPath ?? ""}`,
  ];

  // Module summary: imports then exports, like zoomed-out code
  // Show only library imports and those with tskb references; summarize the rest
  if (node.imports && node.imports.length > 0) {
    const tskbImports = node.imports.filter((imp) => imp.moduleId);
    const libraryImports = node.imports.filter(
      (imp) => !imp.moduleId && !imp.entry.includes('from "./') && !imp.entry.includes('from "../')
    );
    const localSkipped = node.imports.length - tskbImports.length - libraryImports.length;

    if (tskbImports.length > 0 || libraryImports.length > 0) {
      lines.push("");
      for (const imp of [...tskbImports, ...libraryImports]) {
        const target = imp.moduleId ? ` → ${imp.moduleId}` : "";
        lines.push(`  import ${imp.entry}${target}`);
      }
      if (localSkipped > 0) {
        lines.push(`  (${localSkipped} local import${localSkipped !== 1 ? "s" : ""} omitted)`);
      }
    } else if (node.importsSummary) {
      lines.push("");
      lines.push(`  ${node.importsSummary}`);
    }
  }

  if (result.exports.length > 0) {
    lines.push("");
    for (const exp of result.exports) {
      lines.push(`  export ${exp.nodeId} — ${exp.desc}`);
    }
  }

  // Morphology (actual signatures) — collapse interfaces to `{ ... }` at module level
  if (node.morphology && node.morphology.length > 0) {
    lines.push("");
    let i = 0;
    while (i < node.morphology.length) {
      const line = node.morphology[i];
      if (
        /^export\s+(default\s+)?interface\s+/.test(line) &&
        /\{\s*(\/\/.*)?$/.test(line.trimEnd())
      ) {
        // Collapse interface: show name with { ... }
        const lineComment = line.match(/(\/\/ :.*)$/)?.[1] ?? "";
        const name = line.replace(/\s*\{(\s*\/\/.*)?$/, "");
        lines.push(`  ${name} { ... } ${lineComment}`.trimEnd());
        i++;
        while (i < node.morphology.length && node.morphology[i] !== "}") i++;
        if (i < node.morphology.length) i++; // skip closing }
      } else {
        lines.push(`  ${line}`);
        i++;
      }
    }
  }

  if (result.parentFolder) {
    lines.push("");
    lines.push(`  parent: id: ${result.parentFolder.nodeId} — ${result.parentFolder.desc}`);
  }

  if (result.importedBy && result.importedBy.length > 0) {
    lines.push("  importedBy:");
    for (const ib of result.importedBy) {
      lines.push(`    id: ${ib.moduleId} — ${ib.desc}`);
    }
  }

  lines.push(...formatDocs(result.referencingDocs));
  lines.push(...formatRelations(result.relations));

  return lines;
}

function formatFolderPlain(result: FolderPickResult): string[] {
  const { node } = result;
  const meta: string[] = [];
  if (node.path) meta.push(`path: ${node.path}`);
  if (node.structureSummary) meta.push(node.structureSummary);
  if (node.packageName) meta.push(`package: ${node.packageName}`);

  const lines: string[] = [`id: ${node.nodeId} (folder)`, `  ${node.desc}`];
  if (meta.length > 0) lines.push(`  ${meta.join(" | ")}`);

  if (result.parent) {
    lines.push(
      `  parent: id: ${result.parent.nodeId} (${result.parent.type}) — ${result.parent.desc}`
    );
  }

  if (node.children) {
    lines.push("  children:");
    for (const f of node.children.folders) {
      const label = f.nodeId ? `id: ${f.nodeId} — ${f.desc}` : f.name;
      lines.push(`    [folder] ${label}`);
    }
    for (const f of node.children.files) {
      const label = f.nodeId ? `id: ${f.nodeId} — ${f.desc}` : f.name;
      lines.push(`    [file] ${label}`);
    }
  }

  if (result.exports.length > 0) {
    lines.push("  exports:");
    for (const exp of result.exports) {
      lines.push(`    id: ${exp.nodeId} — ${exp.desc}`);
    }
  }

  if (result.importedBy && result.importedBy.length > 0) {
    lines.push("  importedBy:");
    for (const ib of result.importedBy) {
      lines.push(`    id: ${ib.moduleId} — ${ib.desc}`);
    }
  }

  lines.push(...formatDocs(result.referencingDocs));
  lines.push(...formatRelations(result.relations));

  return lines;
}

function formatExportPlain(result: ExportPickResult): string[] {
  const { node } = result;
  const lines: string[] = [
    `id: ${node.nodeId} (export)`,
    `  ${node.desc}`,
    `  path: ${node.resolvedPath ?? ""}`,
  ];

  if (node.morphology && node.morphology.length > 0) {
    lines.push("");
    for (const m of node.morphology) {
      lines.push(`  ${m}`);
    }
  }

  if (result.parent) {
    const parentMeta = result.parent.morphologySummary
      ? ` | ${result.parent.morphologySummary}`
      : "";
    lines.push("");
    lines.push(
      `  parent: id: ${result.parent.nodeId} (${result.parent.type}) — ${result.parent.desc}${parentMeta}`
    );
  }

  lines.push(...formatDocs(result.referencingDocs));
  lines.push(...formatRelations(result.relations));

  return lines;
}

function formatTermPlain(result: TermPickResult): string[] {
  const lines: string[] = [`id: ${result.node.nodeId} (term)`, `  ${result.node.desc}`];

  lines.push(...formatDocs(result.referencingDocs));
  lines.push(...formatRelations(result.relations));

  return lines;
}

function formatFilePlain(result: FilePickResult): string[] {
  const lines: string[] = [`id: ${result.node.nodeId} (file)`, `  ${result.node.desc}`];
  if (result.node.path) lines.push(`  path: ${result.node.path}`);

  if (result.parentFolder) {
    lines.push(`  parent: id: ${result.parentFolder.nodeId} — ${result.parentFolder.desc}`);
  }

  lines.push(...formatDocs(result.referencingDocs));
  lines.push(...formatRelations(result.relations));

  return lines;
}

function formatDocPlain(result: DocPickResult): string[] {
  const lines: string[] = [
    `id: ${result.node.nodeId} (doc, ${result.node.priority})`,
    `  ${result.node.explains}`,
    `  file: ${result.node.filePath}`,
    "",
    result.node.content,
  ];

  lines.push(...formatRelations(result.relations));

  return lines;
}

function formatPickPlain(result: PickResult): string {
  const nodeId = result.type === "doc" ? result.node.nodeId : result.node.nodeId;
  const header = `Pick: "${nodeId}" → ${result.type} (resolved via ${result.resolvedVia})`;

  let lines: string[];
  switch (result.type) {
    case "module":
      lines = formatModulePlain(result);
      break;
    case "folder":
      lines = formatFolderPlain(result);
      break;
    case "export":
      lines = formatExportPlain(result);
      break;
    case "term":
      lines = formatTermPlain(result);
      break;
    case "file":
      lines = formatFilePlain(result);
      break;
    case "doc":
      lines = formatDocPlain(result);
      break;
  }
  return [header, "", ...lines].join("\n").trimEnd();
}
