/**
 * Graph structure types for the knowledge base.
 *
 * The graph consists of:
 * - Nodes: Folders, Modules, Terms, and Documentation files
 * - Edges: Relationships between nodes (references, belongs-to, etc.)
 */

export interface GraphNode {
  id: string;
  type: "folder" | "module" | "term" | "export" | "doc";
}

export interface FolderNode extends GraphNode {
  type: "folder";
  desc: string;
  path?: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  resolvedPath?: string;
  /**
   * Whether the resolved path actually exists on disk
   */
  pathExists?: boolean;
}

export interface ModuleNode extends GraphNode {
  type: "module";
  desc: string;
  /**
   * The module's type signature (if available from typeof import)
   */
  typeSignature?: string;
  /**
   * Import path from typeof import("...")
   */
  importPath?: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  resolvedPath?: string;
  /**
   * Whether the resolved path actually exists on disk
   */
  pathExists?: boolean;
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
   * Import path from typeof import("...")
   */
  importPath?: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  resolvedPath?: string;
  /**
   * Whether the resolved path actually exists on disk
   */
  pathExists?: boolean;
}

export interface DocNode extends GraphNode {
  type: "doc";
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

export type AnyNode = FolderNode | ModuleNode | TermNode | ExportNode | DocNode;

/**
 * Edge types representing relationships in the knowledge graph
 */
export type EdgeType =
  | "references" // Doc references a Folder/Module/Term/Export
  | "belongs-to" // Module/Export belongs to a Folder or Module
  | "contains" // Folder contains another Folder (path hierarchy)
  | "related-to"; // General relationship

export interface GraphEdge {
  from: string; // Source node ID
  to: string; // Target node ID
  type: EdgeType;
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
     * Absolute path to the root directory (from tsconfig rootDir or tsconfig directory)
     */
    rootPath: string;
    stats: {
      folderCount: number;
      moduleCount: number;
      termCount: number;
      exportCount: number;
      docCount: number;
      edgeCount: number;
    };
  };
}
