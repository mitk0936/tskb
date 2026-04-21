import * as d3 from "d3";
import { ChunkLoader } from "./graph/loader";
import { GraphStore } from "./store/graph-store";
import { computeLayout, NODE_SIZES } from "./layout/lane-engine";
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
import { showToast } from "./ui/Toast";
import type { PositionedNode } from "./types";
import { hasChildren } from "./types";
import type { NodeComponent } from "./components/nodes/base";
import { renderBoundaryGroups, applyBoundaryLabelTransforms } from "./components/BoundaryRenderer";
import type { LaneLayout } from "./layout/lane-engine";

type Layer = d3.Selection<SVGGElement, unknown, null, undefined>;

/**
 * Top-level SPA controller. Owns the D3 canvas, UI state, and the render loop.
 * Call `mount()` once on page load.
 */
export class ExplorerApp {
  private readonly loader = new ChunkLoader();
  private readonly store = new GraphStore();

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
        toggleCodeTooltip(node.id, code, node.path ?? node.id, node.x + w / 2, node.y, importLines);
      }
    );
  }

  private setupSearch(): void {
    const searchInput = document.getElementById("search-input") as HTMLInputElement;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.toLowerCase().trim();
      this.render();
    });
  }

  private async loadInitialData(): Promise<void> {
    showGlobalSpinner();
    try {
      const meta = await this.loader.load("meta");
      this.store.loadMeta(meta);
    } catch (e) {
      console.error("Failed to load meta chunk:", e);
      const spinner = document.getElementById("global-spinner");
      if (spinner) {
        spinner.innerHTML = `
          <div style="color:#ef4444;font-size:13px;text-align:center;padding:20px">
            Failed to load graph.<br/>
            <code style="font-size:11px;color:#64748b">./chunks/meta.json</code>
          </div>`;
      }
      return;
    }
    hideGlobalSpinner();
  }

  // ── Render loop ──────────────────────────────────────────────────────────────

  private render(): void {
    if (!this.store.meta) return;

    if (this.layoutDirty || !this.cachedLayout) {
      this.cachedLayout = computeLayout(this.store, this.expanded);
      this.layoutDirty = false;
    }

    const { allNodes, canvasW, structureLinks, relationLinks, matchIds } = computeRenderState(
      this.store,
      this.cachedLayout,
      this.searchQuery
    );

    // Stats bar
    const { folderCount, moduleCount, exportCount } = this.store.meta.metadata.stats;
    document.getElementById("stats")!.textContent =
      `${folderCount ?? 0} folders · ${moduleCount ?? 0} modules · ${exportCount ?? 0} exports`;

    // Structural layers
    renderLaneBands(this.laneBgLayer, this.cachedLayout, canvasW);
    renderBoundaryGroups(this.boundaryLayer, allNodes, this.store.meta.parentOf ?? {}, this.zoomK);
    renderStructureEdges(this.edgeLayer, structureLinks);
    renderRelationEdges(this.relationEdgeLayer, relationLinks);
    renderRelationEndpoints(this.relationEndLayer, relationLinks);

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
          } finally {
            removeNodeSpinner(spinnerEl);
          }
        }
        this.expanded.add(node.id);
        // Auto-reveal links for each module that just became visible
        const chunk = this.store.folderChunks.get(node.id);
        if (chunk) {
          void this.revealLinkedNodes(chunk.modules.map((m) => m.id));
        }
        this.layoutDirty = true;
        this.render();
        this.scrollToNode(node.id);
      }
    } else if (node.type === "module") {
      if (this.expanded.has(node.id)) {
        this.expanded.delete(node.id);
      } else {
        this.expanded.add(node.id);
        void this.revealLinkedNodes([node.id]);
      }
      this.layoutDirty = true;
      this.render();
      this.scrollToNode(node.id);
    }
  }

  /**
   * For each node in `sourceIds`, finds cross-edges and makes the other endpoint
   * visible by expanding the minimal set of ancestors:
   *   - linked node is a module  → expand its parent folder(s) only
   *   - linked node is an export → expand its parent folder(s) + its parent module
   * Never adds unrelated intermediate modules to `expanded`.
   */
  private async revealLinkedNodes(sourceIds: string[]): Promise<void> {
    if (!this.store.meta) return;
    const { parentOf, folderIds } = this.store.meta;
    const folderSet = new Set(folderIds);
    const crossEdges = this.store.meta.crossEdges ?? [];

    const foldersToLoad = new Set<string>();
    const toExpand = new Set<string>(); // only folders + direct parent modules of exports

    for (const srcId of sourceIds) {
      for (const e of crossEdges) {
        if (e.type !== "related-to" && e.type !== "imports") continue;
        const linkedId = e.source === srcId ? e.target : e.target === srcId ? e.source : null;
        if (!linkedId) continue;

        const directParent = parentOf[linkedId];
        if (!directParent) continue;

        if (folderSet.has(directParent)) {
          // linked node is a module — expand its folder ancestors only
          let cur: string | undefined = directParent;
          while (cur) {
            toExpand.add(cur);
            if (folderSet.has(cur)) foldersToLoad.add(cur);
            cur = parentOf[cur];
          }
        } else {
          // linked node is an export — expand folder ancestors + direct parent module
          toExpand.add(directParent); // parent module → makes export visible
          let cur: string | undefined = parentOf[directParent];
          while (cur) {
            toExpand.add(cur);
            if (folderSet.has(cur)) foldersToLoad.add(cur);
            cur = parentOf[cur];
          }
        }
      }
    }

    await this.fetchAndStoreFolders(foldersToLoad);

    let changed = false;
    for (const id of toExpand) {
      if (!this.expanded.has(id)) {
        this.expanded.add(id);
        changed = true;
      }
    }
    if (changed) {
      this.layoutDirty = true;
      this.render();
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
    for (const nodeId of nodeIds) {
      let current = parentOf[nodeId];
      while (current) {
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
      this.scrollToNode(anchorId);
    }
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
    if (chunks.length) this.store.loadFolderChunks(chunks);
  }

  /** Pans the viewport so the node with the given id is centered on screen. */
  private scrollToNode(nodeId: string): void {
    const group = this.nodeLayer
      .selectAll<SVGGElement, PositionedNode>("g.node")
      .filter((d) => d.id === nodeId);
    if (group.empty()) return;
    const d = group.datum();
    const { w, h } = NODE_SIZES[d.type] ?? NODE_SIZES.module;
    const cx = d.x + w / 2;
    const cy = d.y + h / 2;
    const rect = this.svgEl.getBoundingClientRect();
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
    const hasPath =
      node.path && (node.type === "folder" || node.type === "module" || node.type === "file");
    const value = hasPath ? node.path! : node.label;
    const toast = hasPath ? value : `${value} · ${node.type}`;
    navigator.clipboard.writeText(value).then(() => showToast(`Copied: ${toast}`));
  }

  private onTraceLinks(node: PositionedNode): void {
    // MVP: log — future: animated edge tracer
    console.info("[tskb explorer] trace links for:", node.id, `(${node.edgeCount} edges)`);
  }
}

new ExplorerApp().mount();
