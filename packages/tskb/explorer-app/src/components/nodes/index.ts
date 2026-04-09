import {
  BaseNodeRenderer,
  type ExpandHandler,
  type SelectHandler,
  type TraceLinkHandler,
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
  hasChildren: (node: PositionedNode) => boolean
): NodeComponent {
  return new BaseNodeRenderer(onExpand, onSelect, onTraceLinks, hasChildren);
}
