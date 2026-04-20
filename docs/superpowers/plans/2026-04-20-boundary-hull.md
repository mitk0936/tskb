# Boundary Hull Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw a freeform dashed hull around all visible nodes that belong to the same architectural boundary, with an always-visible label.

**Architecture:** A new `BoundaryRenderer.ts` file computes convex hulls per boundary group using pure D3. Boundary membership is resolved by walking `store.meta.parentOf` from each visible node up to a boundary root (a node with `detail.boundary` set). The hulls are rendered into a new `boundaryLayer` SVG group that sits between the lane background and edge layers in `main.ts`.

**Tech Stack:** D3 v7 (already bundled — `d3.polygonHull`, `d3.line`, `d3.curveBasisClosed`), TypeScript, SVG.

---

## File Map

| File                                                            | Action     | Responsibility                                                          |
| --------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `packages/tskb/explorer-app/src/components/BoundaryRenderer.ts` | **Create** | Hull computation, boundary resolution, D3 rendering                     |
| `packages/tskb/explorer-app/src/main.ts`                        | **Modify** | Add `boundaryLayer` field + call `renderBoundaryGroups()` in `render()` |

---

### Task 1: Create `BoundaryRenderer.ts`

**Files:**

- Create: `packages/tskb/explorer-app/src/components/BoundaryRenderer.ts`

- [ ] **Step 1: Create the file with full implementation**

```ts
import * as d3 from "d3";
import type { PositionedNode } from "../types";
import { NODE_SIZES } from "../layout/lane-engine";

type Layer = d3.Selection<SVGGElement, unknown, null, undefined>;

// ─── Boundary resolution ──────────────────────────────────────────────────────

/**
 * For every visible node, walk up parentOf until a boundary-root node is found
 * (i.e. a node with detail.boundary set). Returns a map of nodeId → boundaryName.
 */
function resolveBoundaries(
  nodes: PositionedNode[],
  parentOf: Record<string, string>
): Map<string, string> {
  // Build boundary-root lookup: nodeId → boundaryName
  const roots = new Map<string, string>();
  for (const n of nodes) {
    const b = n.detail.boundary as string | undefined;
    if (b) roots.set(n.id, b);
  }

  const resolved = new Map<string, string>();
  const cache = new Map<string, string | null>();

  function walk(id: string): string | null {
    if (cache.has(id)) return cache.get(id)!;
    if (roots.has(id)) {
      cache.set(id, roots.get(id)!);
      return roots.get(id)!;
    }
    const parent = parentOf[id];
    if (!parent) {
      cache.set(id, null);
      return null;
    }
    const result = walk(parent);
    cache.set(id, result);
    return result;
  }

  for (const n of nodes) {
    const b = walk(n.id);
    if (b) resolved.set(n.id, b);
  }

  return resolved;
}

// ─── Hull computation ─────────────────────────────────────────────────────────

const PAD = 18; // px to inflate bounding boxes before hull

/** Emit 8 points per node (4 corners + 4 edge midpoints), inflated by PAD. */
function nodePoints(n: PositionedNode): [number, number][] {
  const { w, h } = NODE_SIZES[n.type] ?? NODE_SIZES.module;
  const x0 = n.x - PAD;
  const y0 = n.y - PAD;
  const x1 = n.x + w + PAD;
  const y1 = n.y + h + PAD;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [(x0 + x1) / 2, y0],
    [(x0 + x1) / 2, y1],
    [x0, (y0 + y1) / 2],
    [x1, (y0 + y1) / 2],
  ];
}

/** Simple integer hash of a string — used to seed perturbation. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

/** Seeded pseudo-random in [-1, 1] based on a seed integer + index. */
function seededRand(seed: number, i: number): number {
  const x = Math.sin(seed + i) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1; // [-1, 1]
}

const WOBBLE = 6; // max perturbation in px

/** Compute a smooth closed hull path for a set of nodes. */
function buildHullPath(nodes: PositionedNode[], seed: number): string | null {
  const points: [number, number][] = nodes.flatMap(nodePoints);
  const hull = d3.polygonHull(points);
  if (!hull || hull.length < 3) {
    // Single node fallback: circle
    const n = nodes[0];
    const { w, h } = NODE_SIZES[n.type] ?? NODE_SIZES.module;
    const cx = n.x + w / 2;
    const cy = n.y + h / 2;
    const r = Math.max(w, h) / 2 + PAD + 4;
    return `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0`;
  }

  // Perturb each vertex with a stable offset
  const perturbed = hull.map(
    ([x, y], i) =>
      [x + seededRand(seed, i * 2) * WOBBLE, y + seededRand(seed, i * 2 + 1) * WOBBLE] as [
        number,
        number,
      ]
  );

  const line = d3
    .line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(d3.curveBasisClosed);

  return line(perturbed);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

const STROKE = "#7c3aed";
const FILL = "rgba(124,58,237,0.04)";

interface BoundaryGroup {
  name: string;
  nodes: PositionedNode[];
  path: string;
  labelX: number;
  labelY: number;
}

function buildGroups(nodes: PositionedNode[], parentOf: Record<string, string>): BoundaryGroup[] {
  const resolved = resolveBoundaries(nodes, parentOf);

  // Group nodes by boundary name
  const byBoundary = new Map<string, PositionedNode[]>();
  for (const n of nodes) {
    const b = resolved.get(n.id);
    if (!b) continue;
    if (!byBoundary.has(b)) byBoundary.set(b, []);
    byBoundary.get(b)!.push(n);
  }

  const groups: BoundaryGroup[] = [];
  for (const [name, members] of byBoundary) {
    const seed = hashStr(name);
    const path = buildHullPath(members, seed);
    if (!path) continue;

    // Label: centroid x, topmost y of the group minus a small offset
    const topY = Math.min(...members.map((n) => n.y));
    const cx =
      members.reduce((s, n) => {
        const { w } = NODE_SIZES[n.type] ?? NODE_SIZES.module;
        return s + n.x + w / 2;
      }, 0) / members.length;

    groups.push({ name, nodes: members, path, labelX: cx, labelY: topY - PAD - 6 });
  }

  return groups;
}

/**
 * Render one `<g.boundary-group>` per boundary into `layer`.
 * Called from ExplorerApp.render() after allNodes is assembled.
 */
export function renderBoundaryGroups(
  layer: Layer,
  nodes: PositionedNode[],
  parentOf: Record<string, string>
): void {
  const groups = buildGroups(nodes, parentOf);

  const sel = layer
    .selectAll<SVGGElement, BoundaryGroup>("g.boundary-group")
    .data(groups, (d) => d.name);

  sel.exit().remove();

  const enter = sel
    .enter()
    .append("g")
    .attr("class", "boundary-group")
    .style("pointer-events", "none");

  enter.append("path").attr("class", "boundary-hull");
  const labelG = enter.append("g").attr("class", "boundary-label");
  labelG.append("rect").attr("rx", 3).attr("ry", 3);
  labelG.append("text");

  const merged = enter.merge(sel);

  merged
    .select<SVGPathElement>(".boundary-hull")
    .attr("d", (d) => d.path)
    .attr("fill", FILL)
    .attr("stroke", STROKE)
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "8,5");

  merged.select<SVGGElement>(".boundary-label").each(function (d) {
    const g = d3.select(this);
    const text = g.select<SVGTextElement>("text");
    const rect = g.select<SVGRectElement>("rect");

    text
      .attr("font-size", 10)
      .attr("font-weight", "600")
      .attr("fill", STROKE)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(d.name);

    // Measure text then size the background rect
    const textEl = text.node();
    const textW = textEl ? textEl.getBBox().width : d.name.length * 6;
    const PX = 5;
    const PY = 3;
    const bw = textW + PX * 2;
    const bh = 14;

    rect
      .attr("x", d.labelX - bw / 2)
      .attr("y", d.labelY - bh / 2)
      .attr("width", bw)
      .attr("height", bh)
      .attr("fill", "#ffffff")
      .attr("stroke", STROKE)
      .attr("stroke-width", 0.8);

    text.attr("x", d.labelX).attr("y", d.labelY);

    g.attr("transform", null); // position handled via absolute x/y on children
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/tskb && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/explorer-app/src/components/BoundaryRenderer.ts
git commit -m "feat(explorer): add BoundaryRenderer — hull computation and D3 rendering"
```

---

### Task 2: Wire into `main.ts`

**Files:**

- Modify: `packages/tskb/explorer-app/src/main.ts`

- [ ] **Step 1: Add import at the top of `main.ts`**

After the existing imports (around line 12), add:

```ts
import { renderBoundaryGroups } from "./components/BoundaryRenderer";
```

- [ ] **Step 2: Add `boundaryLayer` field**

In the `// Canvas layers — assigned during mount()` block (around line 42), add:

```ts
private boundaryLayer!: Layer;
```

- [ ] **Step 3: Insert `boundaryLayer` into the SVG stack in `setupCanvas()`**

In `setupCanvas()`, the layer creation block currently reads:

```ts
this.laneBgLayer = zoomLayer.append("g").attr("class", "lane-bg-layer") as unknown as Layer;
this.edgeLayer = zoomLayer.append("g").attr("class", "edge-layer") as unknown as Layer;
```

Insert `boundaryLayer` between them:

```ts
this.laneBgLayer = zoomLayer.append("g").attr("class", "lane-bg-layer") as unknown as Layer;
this.boundaryLayer = zoomLayer.append("g").attr("class", "boundary-layer") as unknown as Layer;
this.edgeLayer = zoomLayer.append("g").attr("class", "edge-layer") as unknown as Layer;
```

- [ ] **Step 4: Call `renderBoundaryGroups()` in `render()`**

In `render()`, after the `renderLaneBands` call and before `renderStructureEdges` (around line 215):

```ts
renderLaneBands(this.laneBgLayer, layout, CANVAS_W);
renderBoundaryGroups(this.boundaryLayer, allNodes, this.store.meta.parentOf ?? {});
renderStructureEdges(this.edgeLayer, buildStructureLinks(layout.structureNodes));
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd packages/tskb && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Build and smoke-test**

```bash
cd packages/tskb && npm run build:explorer
```

Expected: clean Vite build, no errors.

Open the explorer (`tskb explore` or the dev server) and verify:

- Violet dashed hulls appear around folders that belong to a declared boundary
- Sub-folders and modules inside an expanded boundary folder are enclosed in the same hull
- The boundary name label is visible above the hull
- Clicking/hovering nodes still works (hull has `pointer-events: none`)

- [ ] **Step 7: Commit**

```bash
git add packages/tskb/explorer-app/src/main.ts
git commit -m "feat(explorer): render boundary group hulls in explorer canvas"
```
