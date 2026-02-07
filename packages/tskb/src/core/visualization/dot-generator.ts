import type { KnowledgeGraph, FolderNode } from "../graph/types.js";

/**
 * Generate a Graphviz DOT file from a knowledge graph.
 *
 * This creates a hierarchical visualization showing:
 * - Folders as nested subgraphs (boxes)
 * - Modules within their folders (ellipses)
 * - Terms as separate cluster (diamonds)
 * - Docs as separate cluster (notes)
 * - Reference relationships as directed edges
 */
export function generateDot(graph: KnowledgeGraph): string {
  const lines: string[] = [];

  // Build folder hierarchy map
  const folderChildren = new Map<string, string[]>();
  const modulesByFolder = new Map<string, string[]>();
  const exportsByFolder = new Map<string, string[]>();
  const exportsByModule = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (edge.type === "contains") {
      if (!folderChildren.has(edge.from)) {
        folderChildren.set(edge.from, []);
      }
      folderChildren.get(edge.from)!.push(edge.to);
    }
    if (edge.type === "belongs-to") {
      const fromNode = graph.nodes.modules[edge.from] || graph.nodes.exports[edge.from];

      if (fromNode?.type === "module") {
        if (!modulesByFolder.has(edge.to)) {
          modulesByFolder.set(edge.to, []);
        }
        modulesByFolder.get(edge.to)!.push(edge.from);
      } else if (fromNode?.type === "export") {
        // Check if export belongs to a module or folder
        const toNode = graph.nodes.modules[edge.to] || graph.nodes.folders[edge.to];

        if (toNode?.type === "module") {
          if (!exportsByModule.has(edge.to)) {
            exportsByModule.set(edge.to, []);
          }
          exportsByModule.get(edge.to)!.push(edge.from);
        } else if (toNode?.type === "folder") {
          if (!exportsByFolder.has(edge.to)) {
            exportsByFolder.set(edge.to, []);
          }
          exportsByFolder.get(edge.to)!.push(edge.from);
        }
      }
    }
  }

  // Header
  lines.push("digraph KnowledgeGraph {");
  lines.push("  rankdir=TB;");
  lines.push("  compound=true;");
  lines.push('  node [fontname="Arial", fontsize=10];');
  lines.push('  edge [fontname="Arial", fontsize=8];');
  lines.push("");

  // Generate folder hierarchy
  const rootFolders = Object.keys(graph.nodes.folders).filter(
    (id) => !graph.edges.some((e) => e.type === "contains" && e.to === id)
  );

  for (const rootId of rootFolders) {
    generateFolderSubgraph(
      rootId,
      graph,
      folderChildren,
      modulesByFolder,
      exportsByFolder,
      exportsByModule,
      lines,
      1
    );
  }

  // Terms (outside folder hierarchy)
  lines.push("  // Terms");
  lines.push('  subgraph "cluster_terms" {');
  lines.push('    label="Terms";');
  lines.push("    style=dashed;");
  lines.push("    color=gray;");
  for (const [id, node] of Object.entries(graph.nodes.terms)) {
    const label = formatLabel(id, node.desc, undefined, "term");
    lines.push(`    "${id}" [label="${label}", shape=diamond, fillcolor="#F0F4C3", style=filled];`);
  }
  lines.push("  }");
  lines.push("");

  // Docs (outside folder hierarchy)
  lines.push("  // Documentation");
  lines.push('  subgraph "cluster_documentation" {');
  lines.push('    label="Documentation";');
  lines.push("    style=dashed;");
  lines.push("    color=gray;");
  for (const [id, node] of Object.entries(graph.nodes.docs)) {
    // Strip HTML tags from content for cleaner visualization
    // Tags are preserved in the JSON for semantic meaning
    const cleanContent = node.content
      .replace(/<[^>]+>/g, "") // Remove all HTML tags
      .substring(0, 100)
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    // Use id (relative path) instead of filePath (absolute path) for portability
    const label = `${id}\\n${cleanContent}...\\n📄 ${id}`;
    lines.push(`    "${id}" [label="${label}", shape=note, fillcolor="#E1BEE7", style=filled];`);
  }
  lines.push("  }");
  lines.push("");

  // Edges
  lines.push("  // Relationships");
  const edgesByType: Record<string, string[]> = {};

  for (const edge of graph.edges) {
    // Skip hierarchy edges as they're shown by subgraph nesting
    if (edge.type === "contains" || edge.type === "belongs-to") continue;

    if (!edgesByType[edge.type]) {
      edgesByType[edge.type] = [];
    }
    edgesByType[edge.type].push(`  "${edge.from}" -> "${edge.to}";`);
  }

  // Group edges by type with different styles
  const edgeStyles: Record<string, string> = {
    references: "[color=grey, style=dashed]",
  };

  for (const [type, edges] of Object.entries(edgesByType)) {
    lines.push(`  // ${type} edges`);
    const style = edgeStyles[type] || "";
    for (const edge of edges) {
      lines.push(edge.replace(";", ` ${style};`));
    }
    lines.push("");
  }

  // Footer
  lines.push("}");

  return lines.join("\n");
}

/**
 * Generate a folder subgraph with nested folders and modules
 */
function generateFolderSubgraph(
  folderId: string,
  graph: KnowledgeGraph,
  folderChildren: Map<string, string[]>,
  modulesByFolder: Map<string, string[]>,
  exportsByFolder: Map<string, string[]>,
  exportsByModule: Map<string, string[]>,
  lines: string[],
  depth: number
): void {
  const folder = graph.nodes.folders[folderId];
  if (!folder) return;

  const indent = "  ".repeat(depth);
  const clusterId = `cluster_${folderId.replace(/\./g, "_").replace(/-/g, "_")}`;

  lines.push(`${indent}subgraph "${clusterId}" {`);
  lines.push(`${indent}  label="${folderId}";`);
  lines.push(`${indent}  style=filled;`);
  lines.push(`${indent}  fillcolor="#E3F2FD";`);
  lines.push(`${indent}  color="#1976D2";`);
  lines.push("");

  // Add folder node itself
  const folderLabel = formatLabel(folderId, folder.desc, folder.path, "folder");
  lines.push(
    `${indent}  "${folderId}" [label="${folderLabel}", shape=box, fillcolor="#BBDEFB", style=filled];`
  );
  lines.push("");

  // Add modules that belong to this folder
  const modules = modulesByFolder.get(folderId) || [];
  if (modules.length > 0) {
    lines.push(`${indent}  // Modules in ${folderId}`);
    for (const moduleId of modules) {
      const module = graph.nodes.modules[moduleId];
      if (module) {
        const label = formatLabel(moduleId, module.desc, module.resolvedPath, "module");
        lines.push(
          `${indent}  "${moduleId}" [label="${label}", shape=ellipse, fillcolor="#FFF9C4", style=filled];`
        );

        // Add exports that belong to this module
        const moduleExports = exportsByModule.get(moduleId) || [];
        for (const exportId of moduleExports) {
          const exp = graph.nodes.exports[exportId];
          if (exp) {
            const exportLabel = formatLabel(exportId, exp.desc, exp.resolvedPath, "export");
            lines.push(
              `${indent}    "${exportId}" [label="${exportLabel}", shape=component, fillcolor="#C5E1A5", style=filled];`
            );
          }
        }
      }
    }
    lines.push("");
  }

  // Add exports that belong directly to this folder (no module)
  const folderExports = exportsByFolder.get(folderId) || [];
  if (folderExports.length > 0) {
    lines.push(`${indent}  // Exports in ${folderId}`);
    for (const exportId of folderExports) {
      const exp = graph.nodes.exports[exportId];
      if (exp) {
        const label = formatLabel(exportId, exp.desc, exp.resolvedPath, "export");
        lines.push(
          `${indent}  "${exportId}" [label="${label}", shape=component, fillcolor="#C5E1A5", style=filled];`
        );
      }
    }
    lines.push("");
  }

  // Recursively add child folders
  const children = folderChildren.get(folderId) || [];
  for (const childId of children) {
    generateFolderSubgraph(
      childId,
      graph,
      folderChildren,
      modulesByFolder,
      exportsByFolder,
      exportsByModule,
      lines,
      depth + 1
    );
  }

  lines.push(`${indent}}`);
  lines.push("");
}

/**
 * Format a node label with ID, description, and optional path
 */
function formatLabel(
  id: string,
  desc: string,
  path?: string,
  type?: "folder" | "module" | "term" | "export"
): string {
  // Escape quotes and newlines
  const escapedDesc = desc.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const escapedPath = path ? path.replace(/"/g, '\\"') : "";

  // Format with type syntax - escape inner quotes for DOT format
  const typeName = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
  const typePrefix = type ? `${typeName}\\<\\"${id}\\"\\>\\n` : `${id}\\n`;

  if (escapedPath) {
    return `${typePrefix}${escapedDesc}\\n📁 ${escapedPath}`;
  }
  return `${typePrefix}${escapedDesc}`;
}
