import type { PositionedNode } from "./types";
import type { LaneLayout } from "./layout/lane-engine";
import { NODE_SIZES } from "./layout/lane-engine";
import {
  buildStructureLinks,
  buildRelationLinks,
  type StructureLink,
  type RelationLink,
} from "./components/edges/EdgeRenderer";
import type { GraphStore } from "./store/graph-store";

export type { StructureLink, RelationLink };

export interface RenderState {
  allNodes: PositionedNode[];
  canvasW: number;
  structureLinks: StructureLink[];
  relationLinks: RelationLink[];
  matchIds: Set<string> | null;
}

/**
 * Pure computation: derives everything the renderers need from store + layout + search.
 * No D3, no DOM — fully testable in isolation.
 */
export function computeRenderState(
  store: GraphStore,
  layout: LaneLayout,
  searchQuery: string
): RenderState {
  const allNodes = [...layout.structureNodes, ...layout.docsNodes, ...layout.otherNodes];

  const canvasW = Math.max(4000, Math.max(...allNodes.map((n) => n.x + NODE_SIZES[n.type].w), 0));

  const structureLinks = buildStructureLinks(layout.structureNodes);

  const crossEdges = store.meta?.crossEdges ?? [];
  const relationLinks = buildRelationLinks(allNodes, crossEdges);

  const matchIds = searchQuery
    ? new Set(
        allNodes
          .filter(
            (n) =>
              n.id.toLowerCase().includes(searchQuery) ||
              n.label.toLowerCase().includes(searchQuery) ||
              n.description.toLowerCase().includes(searchQuery)
          )
          .map((n) => n.id)
      )
    : null;

  return { allNodes, canvasW, structureLinks, relationLinks, matchIds };
}
