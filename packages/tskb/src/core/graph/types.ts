/**
 * Graph structure types for the knowledge base.
 *
 * The graph consists of:
 * - Nodes: Folders, Modules, Terms, and Documentation files
 * - Edges: Relationships between nodes (references, belongs-to, etc.)
 */

import type { DocPriority } from "../../runtime/jsx.js";
import type { FolderChildren } from "../extraction/folder-summary.js";
import type { ImportEntry } from "../extraction/module-morphology.js";

export interface GraphNode {
  id: string;
  type: "folder" | "module" | "term" | "export" | "doc" | "file" | "external";
  /**
   * Number of edges connected to this node (computed during build)
   */
  edgeCount?: number;
}

export interface FolderNode extends GraphNode {
  type: "folder";
  desc: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  path?: string;
  /**
   * npm package name from package.json, if this folder is a package root
   */
  packageName?: string;
  /**
   * Auto-generated filesystem summary, e.g. "3 folders, 7 files"
   */
  structureSummary?: string;
  /**
   * Filesystem children (folder and file names)
   */
  children?: FolderChildren;
}

export interface ModuleNode extends GraphNode {
  type: "module";
  desc: string;
  /**
   * The module's type signature (if available from typeof import)
   */
  typeSignature?: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  resolvedPath?: string;
  /**
   * Auto-generated export summary, e.g. "1 class, 3 functions, 2 types"
   */
  morphologySummary?: string;
  /**
   * Code stub lines showing exported API shape (classes with methods/props, function signatures, etc.)
   */
  morphology?: string[];
  /**
   * Auto-generated import summary, e.g. "5 imports from 3 paths"
   */
  importsSummary?: string;
  /**
   * Import entries as "symbolName from \"path\"" strings for search
   */
  imports?: string[];
  /**
   * Structured import entries with symbol and path for programmatic use
   */
  importEntries?: ImportEntry[];
}

export interface TermNode extends GraphNode {
  type: "term";
  desc: string;
}

export interface ExportNode extends GraphNode {
  type: "export";
  desc: string;
  /**
   * The export's type signature (if available from typeof import)
   */
  typeSignature?: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  resolvedPath?: string;
  /**
   * Auto-generated summary of the export's kind, e.g. "1 function" or "1 class"
   */
  morphologySummary?: string;
  /**
   * Code stub lines showing the export's API shape (signature, class members, interface fields, etc.)
   */
  morphology?: string[];
}

export interface FileNode extends GraphNode {
  type: "file";
  desc: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  path?: string;
}

export interface ExternalNode extends GraphNode {
  type: "external";
  desc: string;
  /**
   * Free-form key-value metadata (url, kind, version, etc.)
   */
  metadata: Record<string, string>;
}

export interface DocNode extends GraphNode {
  type: "doc";
  /**
   * What this documentation explains
   */
  explains: string;
  /**
   * Importance level - essential docs appear in generated skill/instructions files
   */
  priority: DocPriority;
  /**
   * File path relative to project root
   */
  filePath: string;
  /**
   * Full text content of the documentation
   */
  content: string;
  /**
   * Format of the doc file
   */
  format: "ts" | "tsx";
}

export type AnyNode =
  | FolderNode
  | ModuleNode
  | TermNode
  | ExportNode
  | FileNode
  | ExternalNode
  | DocNode;

/**
 * Edge types representing relationships in the knowledge graph
 */
export type EdgeType =
  | "references" // Doc references a Folder/Module/Term/Export
  | "belongs-to" // Module/Export belongs to a Folder or Module
  | "contains" // Folder contains another Folder (path hierarchy)
  | "imports" // Module imports from another Module
  | "related-to"; // General relationship

export interface GraphEdge {
  from: string; // Source node ID
  to: string; // Target node ID
  type: EdgeType;
  label?: string; // Optional label for related-to edges
}

/**
 * Complete knowledge graph structure
 */
export interface KnowledgeGraph {
  /**
   * All nodes in the graph, keyed by ID
   */
  nodes: {
    folders: Record<string, FolderNode>;
    modules: Record<string, ModuleNode>;
    terms: Record<string, TermNode>;
    exports: Record<string, ExportNode>;
    files: Record<string, FileNode>;
    externals: Record<string, ExternalNode>;
    docs: Record<string, DocNode>;
  };
  /**
   * All edges (relationships) in the graph
   */
  edges: GraphEdge[];
  /**
   * Metadata about the graph
   */
  metadata: {
    generatedAt: string;
    version: string;
    /**
     * Path to the root directory relative to where the build was run (from tsconfig rootDir or tsconfig directory)
     */
    rootPath: string;
    stats: {
      folderCount: number;
      moduleCount: number;
      termCount: number;
      exportCount: number;
      fileCount: number;
      externalCount: number;
      docCount: number;
      edgeCount: number;
    };
  };
}
