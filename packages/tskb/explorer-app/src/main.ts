import * as d3 from "d3";
import { ChunkLoader } from "./graph/loader";
import { GraphStore } from "./store/graph-store";
import { computeLayout, NODE_SIZES } from "./layout/lane-engine";
import { NODE_COLORS } from "./components/nodes/base";
import { createNodeRenderer } from "./components/nodes/index";
import {
  renderStructureEdges,
  renderLaneBands,
  renderRelationEdges,
  renderRelationEndpoints,
} from "./components/edges/EdgeRenderer";
import { computeRenderState, type StructureLink, type RelationLink } from "./render-state";
import {
  showGlobalSpinner,
  hideGlobalSpinner,
  showNodeSpinner,
  removeNodeSpinner,
} from "./ui/Spinner";
import { mountCodeTooltip, toggleCodeTooltip, updateCodeTooltipTransform } from "./ui/CodeTooltip";
import { mountNodeTooltip, updateNodeTooltipTransform } from "./ui/NodeTooltip";
import { mountDomTooltip } from "./ui/DomTooltip";
import { showToast } from "./ui/Toast";
import { DocPanel } from "./ui/DocPanel";
import { panelRouter, RefsView } from "./router";
import type { NodeRefHooks } from "./types";
import type { PositionedNode, ExplorerNode } from "./types";
import { hasChildren } from "./types";
import type { NodeComponent } from "./components/nodes/base";
import { renderBoundaryGroups, applyBoundaryLabelTransforms } from "./components/BoundaryRenderer";
import type { LaneLayout } from "./layout/lane-engine";

type Layer = d3.Selection<SVGGElement, unknown, null, undefined>;

/** Below this zoom level, panel-link navigation zooms in so the target is legible. */
const READABLE_ZOOM_THRESHOLD = 0.6;
/** Zoom level applied when panel-link navigation triggers a zoom-up. */
const READABLE_ZOOM = 0.85;

/**
 * Top-level SPA controller. Owns the D3 canvas, UI state, and the render loop.
 * Call `mount()` once on page load.
 */
export class ExplorerApp {
  private readonly loader = new ChunkLoader();
  private readonly store = new GraphStore();

  private readonly router = panelRouter;
  private nodeRefHelperHooks!: NodeRefHooks;

  // Reverse-lookup maps: nodeId → ids of docs/flows that reference it (built from crossEdges)
  private docsOf = new Map<string, string[]>();
  private flowsOf = new Map<string, string[]>();

  // UI state — expanded set and selected node live here, not in the store
  private expanded = new Set<string>();
  private selected: PositionedNode | null = null;
  private searchQuery = "";
  private zoomK = 1;

  // Layout cache — invalidated on structural changes, reused for search-only re-renders
  private cachedLayout: LaneLayout | null = null;
  private layoutDirty = true;

  // Canvas layers — assigned during mount()
  private svgEl!: SVGSVGElement;
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private laneBgLayer!: Layer;
  private boundaryLayer!: Layer;
  private edgeLayer!: Layer;
  private relationEdgeLayer!: Layer;
  private nodeLayer!: Layer;
  private relationEndLayer!: Layer;
  private renderer!: NodeComponent;

  async mount(): Promise<void> {
    this.setupCanvas();
    this.setupTooltips();
    this.setupRenderer();
    this.nodeRefHelperHooks = {
      getNode: (nodeId: string) => this.findNode(nodeId),
      getRefsFor: (nodeId: string, kind: "docs" | "flows") => this.getRefsFor(nodeId, kind),
      onNodeRef: (nodeId: string) => this.navigateToNode(nodeId),
      onNodeHighlight: (nodeId: string | null) => this.onNodeHighlight(nodeId),
      onNodePrefetch: (nodeId: string) => this.prefetchNodeChunk(nodeId),
    };
    // The DocPanel registers itself as a Router listener on construction; the
    // listener closure keeps the instance alive for the SPA's lifetime.
    new DocPanel(this.router);
    this.router.registerView(RefsView, this.nodeRefHelperHooks);
    this.router.init({ syncHash: true });
    this.setupSearch();
    this.store.subscribe(() => {
      this.layoutDirty = true;
      this.render();
    });
    await this.loadInitialData();
  }

  // ── Setup phase ─────────────────────────────────────────────────────────────

  private setupCanvas(): void {
    this.svgEl = document.getElementById("canvas") as unknown as SVGSVGElement;
    const svg = d3.select<SVGSVGElement, unknown>(this.svgEl);

    const zoomLayer = svg.append("g").attr("class", "zoom-layer");
    this.laneBgLayer = zoomLayer.append("g").attr("class", "lane-bg-layer") as unknown as Layer;
    this.boundaryLayer = zoomLayer.append("g").attr("class", "boundary-layer") as unknown as Layer;
    this.edgeLayer = zoomLayer.append("g").attr("class", "edge-layer") as unknown as Layer;
    this.relationEdgeLayer = zoomLayer
      .append("g")
      .attr("class", "relation-edge-layer") as unknown as Layer;
    this.nodeLayer = zoomLayer.append("g").attr("class", "node-layer") as unknown as Layer;
    this.relationEndLayer = zoomLayer
      .append("g")
      .attr("class", "relation-end-layer") as unknown as Layer;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
        const { k, x, y } = event.transform;
        this.zoomK = k;
        const rect = this.svgEl.getBoundingClientRect();
        updateCodeTooltipTransform({ k, x, y }, rect);
        updateNodeTooltipTransform({ k, x, y }, rect);
        applyBoundaryLabelTransforms(this.boundaryLayer, k);
      });

    svg.call(zoom).on("dblclick.zoom", null);
    svg.call(zoom.translateBy, 20, 20);

    this.svg = svg;
    this.zoom = zoom;
  }

  private setupTooltips(): void {
    mountNodeTooltip(this.svgEl);
    mountCodeTooltip(this.svgEl);
    mountDomTooltip();
  }

  private setupRenderer(): void {
    const isExpanded = (node: PositionedNode) => this.expanded.has(node.id);

    this.renderer = createNodeRenderer(
      (node) => this.onExpand(node),
      (node) => this.onSelect(node),
      (node) => this.onTraceLinks(node),
      hasChildren,
      isExpanded,
      (node) => {
        const code = node.detail.code as string[];
        const importLines = Array.isArray(node.detail.importLines)
          ? (node.detail.importLines as string[])
          : undefined;
        const { w } = NODE_SIZES[node.type] ?? NODE_SIZES.module;
        const language = node.detail.fileType as string | undefined;
        void toggleCodeTooltip(
          node.id,
          code,
          node.path ?? node.id,
          node.x + w / 2,
          node.y,
          importLines,
          language
        );
      },
      (node, chip) => this.onChipClick(node, chip),
      (nodeId) => this.docsOf.get(nodeId) ?? [],
      (nodeId) => this.flowsOf.get(nodeId) ?? []
    );
  }

  private setupSearch(): void {
    const searchInput = document.getElementById("search-input") as HTMLInputElement;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.toLowerCase().trim();
      this.render();
    });
  }

  private buildRefMaps(meta: import("./graph/chunk-types").MetaChunk): void {
    this.docsOf.clear();
    this.flowsOf.clear();
    for (const edge of meta.crossEdges) {
      if (edge.type === "references") {
        const list = this.docsOf.get(edge.target) ?? [];
        list.push(edge.source);
        this.docsOf.set(edge.target, list);
      } else if (edge.type === "flow-step") {
        const list = this.flowsOf.get(edge.target) ?? [];
        list.push(edge.source);
        this.flowsOf.set(edge.target, list);
      }
    }
  }

  private async loadInitialData(): Promise<void> {
    showGlobalSpinner();
    try {
      const meta = await this.loader.load("meta");
      this.buildRefMaps(meta); // populate maps before render() fires
      this.store.loadMeta(meta);
      // If the page loaded with a deep-link hash, the active view first
      // rendered with placeholder data — refresh now that meta is loaded.
      this.router.refresh();
    } catch (e) {
      console.error("Failed to load meta chunk:", e);
      hideGlobalSpinner();
      showToast("⚠ Failed to load graph (meta.json)", "error");
      return;
    }
    hideGlobalSpinner();
  }

  // ── Render loop ──────────────────────────────────────────────────────────────

  private render(): void {
    if (!this.store.meta) return;
    const t0 = performance.now();
    console.log("[render] start");

    if (this.layoutDirty || !this.cachedLayout) {
      const t = performance.now();
      this.cachedLayout = computeLayout(this.store, this.expanded);
      this.layoutDirty = false;
      console.log(`[render] computeLayout (${(performance.now() - t).toFixed(1)}ms)`);
    }

    let t = performance.now();
    const { allNodes, canvasW, structureLinks, relationLinks, matchIds } = computeRenderState(
      this.store,
      this.cachedLayout,
      this.searchQuery
    );
    console.log(
      `[render] computeRenderState — ${allNodes.length} nodes, ${structureLinks.length} struct, ${relationLinks.length} relation (${(performance.now() - t).toFixed(1)}ms)`
    );

    // Stats bar — show every node type that has at least one entry
    const stats = this.store.meta.metadata.stats;
    const STAT_LABELS: Array<[string, string, string]> = [
      ["folderCount", "folder", "folders"],
      ["moduleCount", "module", "modules"],
      ["fileCount", "file", "files"],
      ["exportCount", "export", "exports"],
      ["termCount", "term", "terms"],
      ["externalCount", "external", "externals"],
      ["flowCount", "flow", "flows"],
      ["docCount", "doc", "docs"],
      ["edgeCount", "edge", "edges"],
    ];
    document.getElementById("stats")!.textContent = STAT_LABELS.map(([key, sing, plur]) => {
      const n = stats[key] ?? 0;
      return `${n} ${n === 1 ? sing : plur}`;
    }).join(" · ");

    t = performance.now();
    renderLaneBands(this.laneBgLayer, this.cachedLayout, canvasW);
    console.log(`[render] renderLaneBands (${(performance.now() - t).toFixed(1)}ms)`);

    t = performance.now();
    renderBoundaryGroups(this.boundaryLayer, allNodes, this.store.meta.parentOf ?? {}, this.zoomK);
    console.log(`[render] renderBoundaryGroups (${(performance.now() - t).toFixed(1)}ms)`);

    t = performance.now();
    renderStructureEdges(this.edgeLayer, structureLinks);
    console.log(`[render] renderStructureEdges (${(performance.now() - t).toFixed(1)}ms)`);

    t = performance.now();
    renderRelationEdges(this.relationEdgeLayer, relationLinks);
    console.log(`[render] renderRelationEdges (${(performance.now() - t).toFixed(1)}ms)`);

    t = performance.now();
    renderRelationEndpoints(this.relationEndLayer, relationLinks);
    console.log(`[render] renderRelationEndpoints (${(performance.now() - t).toFixed(1)}ms)`);

    t = performance.now();
    console.log(`[render] D3 nodes… (${(performance.now() - t0).toFixed(1)}ms total so far)`);

    // Node enter / update / exit
    const groups = this.nodeLayer
      .selectAll<SVGGElement, PositionedNode>("g.node")
      .data(allNodes, (d) => d.id);

    groups
      .exit()
      .transition()
      .duration(140)
      .ease(d3.easeQuadIn)
      .style("opacity", "0")
      .attr("transform", (d) => `translate(${d.x},${d.y + 8})`)
      .remove();

    const entered = groups
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y - 10})`)
      .style("opacity", "0");
    this.renderer.enter(entered);

    const merged = entered.merge(groups);
    this.renderer.update(merged);

    merged
      .transition()
      .duration(220)
      .ease(d3.easeCubicOut)
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("opacity", (d) => (matchIds && !matchIds.has(d.id) ? "0.15" : "1"));

    // Search dimming
    this.edgeLayer
      .selectAll<SVGPathElement, StructureLink>("path.struct-link")
      .transition("search")
      .duration(220)
      .style("opacity", (d) =>
        matchIds && !matchIds.has(d.sourceId) && !matchIds.has(d.targetId) ? "0.08" : "1"
      );
    this.relationEdgeLayer
      .selectAll<SVGGElement, RelationLink>("g.relation-link")
      .transition("search")
      .duration(220)
      .style("opacity", (d) =>
        matchIds && !matchIds.has(d.source.id) && !matchIds.has(d.target.id) ? "0.08" : "1"
      );
    this.relationEndLayer
      .selectAll<SVGGElement, RelationLink>("g.relation-endpoint")
      .transition("search")
      .duration(220)
      .style("opacity", (d) =>
        matchIds && !matchIds.has(d.source.id) && !matchIds.has(d.target.id) ? "0.08" : "1"
      );
  }

  // ── Interaction handlers ─────────────────────────────────────────────────────

  private async onExpand(node: PositionedNode): Promise<void> {
    if (node.type === "folder") {
      if (this.expanded.has(node.id)) {
        this.expanded.delete(node.id);
        this.collapseDescendants(node.id);
        this.layoutDirty = true;
        this.render();
        this.scrollToNode(node.id);
      } else {
        if (!this.store.folderChunks.has(node.id)) {
          const spinnerEl = showNodeSpinner(this.nodeLayer.node()!, node.x + 190, node.y + 38);
          try {
            const chunk = await this.loader.load("folder", node.id);
            this.store.loadFolderChunk(chunk); // triggers subscriber → layoutDirty + render
          } catch (e) {
            console.error("Failed to load chunk for", node.id, e);
            showToast(`⚠ Failed to load ${node.label}`, "error");
            return;
          } finally {
            removeNodeSpinner(spinnerEl);
          }
        }
        this.expanded.add(node.id);
        this.layoutDirty = true;
        this.render();
        this.scrollToNode(node.id);
      }
    } else if (node.type === "module") {
      if (this.expanded.has(node.id)) {
        this.expanded.delete(node.id);
      } else {
        this.expanded.add(node.id);
      }
      this.layoutDirty = true;
      this.render();
      this.scrollToNode(node.id);
    }
  }

  /**
   * Expands all ancestor folders/modules needed to make each node in nodeIds visible.
   * Folder chunks are loaded on demand; a final render() is called when done.
   */
  private async expandToReveal(nodeIds: string[], anchorId?: string): Promise<void> {
    if (!this.store.meta) return;
    const { parentOf, folderIds } = this.store.meta;
    const folderSet = new Set(folderIds);

    const toExpand = new Set<string>();
    const visited = new Set<string>();
    for (const nodeId of nodeIds) {
      let current = parentOf[nodeId];
      while (current && !visited.has(current)) {
        visited.add(current);
        toExpand.add(current);
        current = parentOf[current];
      }
    }

    const foldersToLoad = new Set([...toExpand].filter((id) => folderSet.has(id)));
    await this.fetchAndStoreFolders(foldersToLoad);
    for (const id of toExpand) this.expanded.add(id);

    this.layoutDirty = true;
    this.render();

    if (anchorId) {
      this.scrollToNode(anchorId, true);
    }
  }

  /**
   * Silently loads the folder chunks needed to resolve a node by id.
   * Does NOT expand folders on the canvas or trigger a layout re-render.
   * Used for doc-panel tooltip prefetch on hover.
   */
  private async prefetchNodeChunk(nodeId: string): Promise<void> {
    if (!this.store.meta) return;
    const { parentOf, folderIds } = this.store.meta;
    const folderSet = new Set(folderIds);
    const toLoad = new Set<string>();
    const visited = new Set<string>();
    let current: string | undefined = parentOf[nodeId];
    while (current && !visited.has(current)) {
      visited.add(current);
      if (folderSet.has(current) && !this.store.folderChunks.has(current)) toLoad.add(current);
      current = parentOf[current];
    }
    if (!toLoad.size) return;
    const results = await Promise.all(
      [...toLoad].map((id) => this.loader.load("folder", id).catch(() => null))
    );
    const chunks = results.filter((c) => c !== null);
    const failed = results.length - chunks.length;
    if (failed > 0) {
      showToast(`⚠ Failed to prefetch ${failed} folder chunk${failed === 1 ? "" : "s"}`, "error");
    }
    // Write directly to avoid triggering a canvas re-render
    for (const chunk of chunks) this.store.folderChunks.set(chunk.folderId, chunk);
  }

  /** Fetches all folder IDs not yet in the store in parallel, then batch-writes them. */
  private async fetchAndStoreFolders(folderIds: Set<string>): Promise<void> {
    const toFetch = [...folderIds].filter((id) => !this.store.folderChunks.has(id));
    if (!toFetch.length) return;
    const results = await Promise.all(
      toFetch.map(async (id) => {
        try {
          return await this.loader.load("folder", id);
        } catch (e) {
          console.error("Failed to load chunk for", id, e);
          return null;
        }
      })
    );
    const chunks = results.filter((c) => c !== null);
    const failed = results.length - chunks.length;
    if (failed > 0) {
      showToast(`⚠ Failed to load ${failed} folder chunk${failed === 1 ? "" : "s"}`, "error");
    }
    if (chunks.length) this.store.loadFolderChunks(chunks);
  }

  /** Pans the viewport so the node with the given id is centered on screen. */
  private scrollToNode(nodeId: string, ensureZoom = false): void {
    const group = this.nodeLayer
      .selectAll<SVGGElement, PositionedNode>("g.node")
      .filter((d) => d.id === nodeId);
    if (group.empty()) return;
    const d = group.datum();
    const { w, h } = NODE_SIZES[d.type] ?? NODE_SIZES.module;
    const cx = d.x + w / 2;
    const cy = d.y + h / 2;
    const rect = this.svgEl.getBoundingClientRect();

    if (ensureZoom && this.zoomK < READABLE_ZOOM_THRESHOLD) {
      const transform = d3.zoomIdentity
        .translate(rect.width / 2, rect.height / 2)
        .scale(READABLE_ZOOM)
        .translate(-cx, -cy);
      this.svg.transition().duration(400).call(this.zoom.transform, transform);
      return;
    }

    this.svg
      .transition()
      .duration(300)
      .call(this.zoom.translateTo, cx, cy, [rect.width / 2, rect.height / 2]);
  }

  /** Recursively removes all descendants of folderId from the expanded set. */
  private collapseDescendants(folderId: string): void {
    const chunk = this.store.folderChunks.get(folderId);
    if (!chunk) return;
    for (const sf of chunk.subfolders ?? []) {
      this.expanded.delete(sf.id);
      this.collapseDescendants(sf.id);
    }
    for (const mod of chunk.modules) {
      this.expanded.delete(mod.id);
    }
  }

  private onSelect(node: PositionedNode): void {
    // Panel only opens via chip clicks (docs/flows) — node selection just copies the path
    const hasPath =
      node.path && (node.type === "folder" || node.type === "module" || node.type === "file");
    const value = hasPath ? node.path! : node.label;
    const toast = hasPath ? value : `${value} · ${node.type}`;
    navigator.clipboard.writeText(value).then(() => showToast(`⎘ ${toast}`));
  }

  private async navigateToNode(nodeId: string): Promise<void> {
    if (!this.cachedLayout) return;

    const visibleNodes = () => [
      ...this.cachedLayout!.structureNodes,
      ...this.cachedLayout!.docsNodes,
      ...this.cachedLayout!.otherNodes,
    ];

    let target = visibleNodes().find((n) => n.id === nodeId);

    if (!target) {
      // Node isn't visible — expand its ancestor chain first
      await this.expandToReveal([nodeId], nodeId);
      target = visibleNodes().find((n) => n.id === nodeId);
      // Re-apply highlight: newly entered D3 nodes don't carry over the filter
      this.onNodeHighlight(nodeId);
    } else {
      this.scrollToNode(nodeId, true);
    }

    if (target) this.onSelect(target);
  }

  /** Search all loaded data for a node by id. */
  private findNode(nodeId: string): ExplorerNode | undefined {
    if (this.cachedLayout) {
      const found = [
        ...this.cachedLayout.structureNodes,
        ...this.cachedLayout.docsNodes,
        ...this.cachedLayout.otherNodes,
      ].find((n) => n.id === nodeId);
      if (found) return found;
    }
    const meta = this.store.meta;
    if (meta) {
      const inMeta =
        meta.docs.find((n) => n.id === nodeId) ??
        meta.flows.find((n) => n.id === nodeId) ??
        meta.terms.find((n) => n.id === nodeId) ??
        meta.externals.find((n) => n.id === nodeId) ??
        meta.topFolders.find((n) => n.id === nodeId);
      if (inMeta) return inMeta;
    }
    for (const chunk of this.store.folderChunks.values()) {
      const found =
        chunk.modules.find((n) => n.id === nodeId) ??
        chunk.exports.find((n) => n.id === nodeId) ??
        chunk.subfolders.find((n) => n.id === nodeId) ??
        chunk.files.find((n) => n.id === nodeId);
      if (found) return found;
    }
    return undefined;
  }

  /** Add a colour-matched glow to the referenced node; pass null to clear. */
  private onNodeHighlight(nodeId: string | null): void {
    this.nodeLayer.selectAll<SVGGElement, PositionedNode>("g.node").style(
      "filter",
      nodeId
        ? (d) => {
            if (d.id !== nodeId) return null;
            const c = NODE_COLORS[d.type] ?? "#3b82f6";
            return `drop-shadow(0 0 6px ${c}bb) drop-shadow(0 0 14px ${c}66)`;
          }
        : null
    );
  }

  private onChipClick(node: PositionedNode, chip: "docs" | "flows"): void {
    if (!this.store.meta) return;
    this.router.push(new RefsView(node.id, chip, this.nodeRefHelperHooks));
  }

  /** Resolves the docs or flows that reference a given node id from the meta chunk. */
  private getRefsFor(nodeId: string, kind: "docs" | "flows"): ExplorerNode[] {
    const meta = this.store.meta;
    if (!meta) return [];
    const ids = (kind === "docs" ? this.docsOf : this.flowsOf).get(nodeId) ?? [];
    const pool = kind === "docs" ? meta.docs : meta.flows;
    return ids.map((id) => pool.find((n) => n.id === id)).filter(Boolean) as ExplorerNode[];
  }

  private onTraceLinks(node: PositionedNode): void {
    // MVP: log — future: animated edge tracer
    console.info("[tskb explorer] trace links for:", node.id, `(${node.edgeCount} edges)`);
  }
}

new ExplorerApp().mount();
