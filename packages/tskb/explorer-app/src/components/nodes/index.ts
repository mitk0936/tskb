import {
  BaseNodeRenderer,
  type ExpandHandler,
  type SelectHandler,
  type TraceLinkHandler,
  type CodePreviewHandler,
  type IsExpandedFn,
  type RelationHandlers,
  type NodeComponent,
} from "./base";
import type { PositionedNode } from "../../types";

/**
 * Factory: returns a NodeComponent for the given handlers.
 *
 * MVP: all node types share BaseNodeRenderer.
 * To customise a type, create a subclass and add a case here.
 */
export function createNodeRenderer(
  onExpand: ExpandHandler,
  onSelect: SelectHandler,
  onTraceLinks: TraceLinkHandler,
  hasChildren: (node: PositionedNode) => boolean,
  isExpanded: (node: PositionedNode) => boolean,
  onCodePreview?: CodePreviewHandler,
  relations?: RelationHandlers
): NodeComponent {
  return new BaseNodeRenderer(
    onExpand,
    onSelect,
    onTraceLinks,
    hasChildren,
    isExpanded,
    onCodePreview,
    relations
  );
}
