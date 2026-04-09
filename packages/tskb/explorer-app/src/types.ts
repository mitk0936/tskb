export type NodeType =
  | "folder"
  | "module"
  | "export"
  | "doc"
  | "flow"
  | "term"
  | "external"
  | "file";

export type EdgeLinkType = "imports" | "references" | "related-to" | "flow-step";

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

/** ExplorerNode with computed SVG x/y after layout */
export interface PositionedNode extends ExplorerNode {
  x: number;
  y: number;
}
