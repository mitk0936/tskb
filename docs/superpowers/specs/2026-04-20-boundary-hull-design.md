# Boundary Group Hull Visualization

**Date:** 2026-04-20  
**Status:** Approved

## Goal

Draw a freeform dashed outline around all visible nodes that belong to the same architectural boundary, with a visible label. The shape adapts as nodes expand/collapse.

## Data Model

`boundary` is declared only on the **top-level folder** of a boundary (e.g. `packages/tskb` has `boundary: "package"`). All descendants — sub-folders, modules, exports — implicitly share that boundary.

`store.meta.parentOf` is a `Record<string, string>` (nodeId → parentId) already baked into the meta chunk. Walking up this map from any visible node reaches the boundary root.

## Boundary Resolution Algorithm

At render time, given `allNodes: PositionedNode[]` and `store.meta`:

1. **Find boundary roots**: scan `allNodes` for nodes where `detail.boundary` is set. Build `boundaryRoots: Map<nodeId, boundaryName>`.
2. **Resolve each node**: for every visible node, walk up `parentOf` until a boundary root is found or the chain ends. Cache results in `resolvedBoundary: Map<nodeId, boundaryName>`. Include the boundary root node itself.
3. **Group**: collect `PositionedNode[]` per boundary name.
4. **Skip**: if a group has 0 visible nodes, draw nothing.

## Shape Construction (pure D3)

For each boundary group:

1. **Point cloud**: for each node in the group, emit 8 points — 4 corners + 4 edge midpoints of its bounding box (`x, y, w, h`) — inflated outward by **18px padding**.
2. **Convex hull**: `d3.polygonHull(points)` → ordered vertex array.
3. **Stable perturbation**: perturb each hull vertex by ±6px using a seeded pseudo-random derived from a hash of the boundary name. Same seed every render — shape does not jitter.
4. **Smooth path**: `d3.line().curve(d3.curveBasisClosed)(perturbedVertices)` → SVG path string.

If `d3.polygonHull` returns null (fewer than 3 points, e.g. a single node), fall back to a circle of radius `max(w,h)/2 + 22px` centered on the node.

## Visual Style

| Property         | Value                                                |
| ---------------- | ---------------------------------------------------- |
| Stroke color     | `#7c3aed` (violet — matches existing boundary badge) |
| Stroke width     | `1.5px`                                              |
| Stroke dasharray | `8, 5`                                               |
| Fill             | `rgba(124, 58, 237, 0.04)`                           |
| Pointer events   | `none` (shape is non-interactive)                    |

## Label

- Always visible; positioned **above the topmost hull point**, horizontally centered on the hull's x centroid.
- Text: boundary name (e.g. `package`, `spa`), 10px, `#7c3aed`, font-weight 600.
- Background: white rect with 3px horizontal padding, 2px vertical padding, rx 3 — ensures readability over lane background bands.
- Rendered as a `<g>` with `<rect>` + `<text>` stacked.

## SVG Layer

A `boundaryLayer` group inserted in `main.ts` between `laneBgLayer` and `edgeLayer`:

```
laneBgLayer   ← lane background bands
boundaryLayer ← boundary hull shapes + labels  ← NEW
edgeLayer     ← import/relation edges
nodeLayer     ← node cards
```

## New File

`packages/tskb/explorer-app/src/components/BoundaryRenderer.ts`

Exports one function:

```ts
export function renderBoundaryGroups(
  layer: d3.Selection<SVGGElement, unknown, null, undefined>,
  nodes: PositionedNode[],
  parentOf: Record<string, string>
): void;
```

Called from `ExplorerApp.render()` after `allNodes` is assembled.

## Files Changed

| File                                              | Change                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `explorer-app/src/components/BoundaryRenderer.ts` | New file — hull computation + D3 rendering                       |
| `explorer-app/src/main.ts`                        | Add `boundaryLayer`, call `renderBoundaryGroups()` in `render()` |

No changes to chunk types, transform, or graph pipeline — boundary data is already flowing through.
