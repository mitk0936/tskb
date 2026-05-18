export type NodeType =
  | "folder"
  | "module"
  | "export"
  | "doc"
  | "flow"
  | "term"
  | "external"
  | "file";

export type EdgeLinkType = "imports" | "imports-type" | "references" | "related-to" | "flow-step";

export interface ExplorerNode {
  id: string;
  type: NodeType;
  /** Short display name (last segment of id or path) */
  label: string;
  description: string;
  path?: string;
  /** Parent node id (used for tree layout and edge inference) */
  parentId?: string;
  priority?: "essential" | "constraint" | "supplementary";
  edgeCount: number;
  /** Extra key-value fields shown in the detail panel */
  detail: Record<string, string | string[]>;
}

export interface ExplorerLink {
  source: string;
  target: string;
  type: EdgeLinkType;
  label?: string;
}

export const isGhost = (node: ExplorerNode): boolean => node.detail._ghost === "true";
export const hasChildren = (node: ExplorerNode): boolean => node.detail._hasChildren === "true";
export const childCount = (node: ExplorerNode): number =>
  parseInt((node.detail._childCount as string) ?? "0", 10);

/** ExplorerNode with computed SVG x/y after layout */
export interface PositionedNode extends ExplorerNode {
  x: number;
  y: number;
}

// ── Panel view callbacks ───────────────────────────────────────────────────────

export type GetNodeFn = (nodeId: string) => ExplorerNode | undefined;
export type GetRefsForFn = (nodeId: string, kind: "docs" | "flows") => ExplorerNode[];
export type OnNodeRefClick = (nodeId: string) => void;
export type OnNodeHighlightFn = (nodeId: string | null) => void;
export type OnNodePrefetchFn = (nodeId: string) => Promise<void>;

/** Callbacks and lookups supplied by the host so panel views never reach into the rest of the SPA. */
export interface NodeRefHooks {
  getNode: GetNodeFn;
  getRefsFor: GetRefsForFn;
  onNodeRef: OnNodeRefClick;
  onNodeHighlight: OnNodeHighlightFn;
  onNodePrefetch: OnNodePrefetchFn;
}
