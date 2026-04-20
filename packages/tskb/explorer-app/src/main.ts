import * as d3 from "d3";
import { ChunkLoader } from "./graph/loader";
import { GraphStore } from "./store/graph-store";
import { computeLayout, NODE_SIZES } from "./layout/lane-engine";
import { createNodeRenderer } from "./components/nodes/index";
import {
  buildStructureLinks,
  renderStructureEdges,
  renderLaneBands,
  buildRelationLinks,
  renderRelationEdges,
} from "./components/edges/EdgeRenderer";
import {
  showGlobalSpinner,
  hideGlobalSpinner,
  showNodeSpinner,
  removeNodeSpinner,
} from "./ui/Spinner";
import { mountDetailPanel } from "./ui/DetailPanel";
import { mountCodeTooltip, toggleCodeTooltip, updateCodeTooltipTransform } from "./ui/CodeTooltip";
import { mountNodeTooltip, updateNodeTooltipTransform } from "./ui/NodeTooltip";
import type { PositionedNode } from "./types";
import type { NodeComponent, RelationHandlers } from "./components/nodes/base";

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
  private relationsIncoming = new Set<string>();
  private relationsOutgoing = new Set<string>();

  // Canvas layers — assigned during mount()
  private svgEl!: SVGSVGElement;
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private laneBgLayer!: Layer;
  private edgeLayer!: Layer;
  private relationEdgeLayer!: Layer;
  private nodeLayer!: Layer;
  private renderer!: NodeComponent;
  private detailPanel!: ReturnType<typeof mountDetailPanel>;

  async mount(): Promise<void> {
    this.setupCanvas();
    this.setupTooltips();
    this.setupRenderer();
    this.setupSearch();
    this.store.subscribe(() => this.render());
    await this.loadInitialData();
  }

  // ── Setup phase ─────────────────────────────────────────────────────────────

  private setupCanvas(): void {
    this.svgEl = document.getElementById("canvas") as unknown as SVGSVGElement;
    const svg = d3.select<SVGSVGElement, unknown>(this.svgEl);

    const zoomLayer = svg.append("g").attr("class", "zoom-layer");
    this.laneBgLayer = zoomLayer.append("g").attr("class", "lane-bg-layer") as unknown as Layer;
    this.edgeLayer = zoomLayer.append("g").attr("class", "edge-layer") as unknown as Layer;
    this.relationEdgeLayer = zoomLayer
      .append("g")
      .attr("class", "relation-edge-layer") as unknown as Layer;
    this.nodeLayer = zoomLayer.append("g").attr("class", "node-layer") as unknown as Layer;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
        const { k, x, y } = event.transform;
        const rect = this.svgEl.getBoundingClientRect();
        updateCodeTooltipTransform({ k, x, y }, rect);
        updateNodeTooltipTransform({ k, x, y }, rect);
      });

    svg.call(zoom).on("dblclick.zoom", null);
    svg.call(zoom.translateBy, 20, 20);

    this.svg = svg;
    this.zoom = zoom;

    this.detailPanel = mountDetailPanel(() => {
      this.selected = null;
    });
  }

  private setupTooltips(): void {
    mountNodeTooltip(this.svgEl);
    mountCodeTooltip(this.svgEl);
  }

  private setupRenderer(): void {
    const hasChildren = (node: PositionedNode) => node.detail["_hasChildren"] === "true";
    const isExpanded = (node: PositionedNode) => this.expanded.has(node.id);

    const crossEdges = () => this.store.meta?.crossEdges ?? [];
    const relations: RelationHandlers = {
      // source = importer (A), target = imported (B)
      // incoming button (bottom-right) = on A: "what I import"
      // outgoing button (top-right)    = on B: "who imports me"
      hasIncoming: (node) =>
        crossEdges().some(
          (e) => (e.type === "related-to" || e.type === "imports") && e.source === node.id
        ),
      hasOutgoing: (node) =>
        crossEdges().some(
          (e) => (e.type === "related-to" || e.type === "imports") && e.target === node.id
        ),
      isIncomingOpen: (node) => this.relationsIncoming.has(node.id),
      isOutgoingOpen: (node) => this.relationsOutgoing.has(node.id),
      onToggleIncoming: (node) => {
        if (this.relationsIncoming.has(node.id)) {
          this.relationsIncoming.delete(node.id);
          this.render();
        } else {
          this.relationsIncoming.add(node.id);
          this.render();
          // expand the modules that this node imports (e.source === node → reveal e.target)
          const targets = (this.store.meta?.crossEdges ?? [])
            .filter(
              (e) => (e.type === "related-to" || e.type === "imports") && e.source === node.id
            )
            .map((e) => e.target);
          void this.expandToReveal(targets, node.id);
        }
      },
      onToggleOutgoing: (node) => {
        if (this.relationsOutgoing.has(node.id)) {
          this.relationsOutgoing.delete(node.id);
          this.render();
        } else {
          this.relationsOutgoing.add(node.id);
          this.render();
          // expand the modules that import this node (e.target === node → reveal e.source)
          const sources = (this.store.meta?.crossEdges ?? [])
            .filter(
              (e) => (e.type === "related-to" || e.type === "imports") && e.target === node.id
            )
            .map((e) => e.source);
          void this.expandToReveal(sources, node.id);
        }
      },
    };

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
      },
      relations
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

    const layout = computeLayout(this.store, this.expanded);
    const allNodes = [...layout.structureNodes, ...layout.docsNodes, ...layout.otherNodes];

    // Stats bar
    const meta = this.store.meta.metadata;
    document.getElementById("stats")!.textContent =
      `${meta.stats.folderCount ?? 0} folders · ` +
      `${meta.stats.moduleCount ?? 0} modules · ` +
      `${meta.stats.exportCount ?? 0} exports`;

    // Lane backgrounds and structure edges
    const CANVAS_W = Math.max(4000, Math.max(...allNodes.map((n) => n.x + 250), 0));
    renderLaneBands(this.laneBgLayer, layout, CANVAS_W);
    renderStructureEdges(this.edgeLayer, buildStructureLinks(layout.structureNodes));

    // Relation edges (related-to / references) — rendered above structure edges
    const crossEdges = this.store.meta?.crossEdges ?? [];
    renderRelationEdges(
      this.relationEdgeLayer,
      buildRelationLinks(
        allNodes,
        crossEdges,
        this.relationsOutgoing,
        this.relationsIncoming,
        buildParentLookup(this.store)
      )
    );

    // Search dim: compute match set once, apply as opacity
    const matchIds = this.searchQuery
      ? new Set(
          allNodes
            .filter(
              (n) =>
                n.id.toLowerCase().includes(this.searchQuery) ||
                n.label.toLowerCase().includes(this.searchQuery) ||
                n.description.toLowerCase().includes(this.searchQuery)
            )
            .map((n) => n.id)
        )
      : null;

    // D3 enter / update / exit keyed by node id
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
  }

  // ── Interaction handlers ─────────────────────────────────────────────────────

  private async onExpand(node: PositionedNode): Promise<void> {
    if (node.type === "folder") {
      if (this.expanded.has(node.id)) {
        this.expanded.delete(node.id);
        this.collapseDescendants(node.id);
        this.render();
        this.scrollToNode(node.id);
      } else {
        if (!this.store.folderChunks.has(node.id)) {
          const spinnerEl = showNodeSpinner(this.nodeLayer.node()!, node.x + 190, node.y + 38);
          try {
            const chunk = await this.loader.load("folder", node.id);
            this.store.loadFolderChunk(chunk);
          } catch (e) {
            console.error("Failed to load chunk for", node.id, e);
          } finally {
            removeNodeSpinner(spinnerEl);
          }
        }
        this.expanded.add(node.id);
        this.render();
        this.scrollToNode(node.id);
      }
    } else if (node.type === "module") {
      if (this.expanded.has(node.id)) {
        this.expanded.delete(node.id);
        const chunk = this.store.folderChunks.get(node.parentId!);
        if (chunk) {
          for (const exp of chunk.exports) {
            if (exp.parentId === node.id) this.clearRelations(exp.id);
          }
        }
      } else {
        this.expanded.add(node.id);
      }
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
    for (const nodeId of nodeIds) {
      let current = parentOf[nodeId];
      while (current) {
        toExpand.add(current);
        current = parentOf[current];
      }
    }

    for (const id of toExpand) {
      if (folderSet.has(id) && !this.store.folderChunks.has(id)) {
        try {
          const chunk = await this.loader.load("folder", id);
          this.store.loadFolderChunk(chunk);
        } catch (e) {
          console.error("Failed to load chunk for", id, e);
        }
      }
      this.expanded.add(id);
    }

    this.render();

    if (anchorId) {
      this.scrollToNode(anchorId);
    }
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

  /** Recursively removes all descendants of folderId from the expanded and relation sets. */
  private collapseDescendants(folderId: string): void {
    const chunk = this.store.folderChunks.get(folderId);
    if (!chunk) return;
    for (const sf of chunk.subfolders ?? []) {
      this.expanded.delete(sf.id);
      this.clearRelations(sf.id);
      this.collapseDescendants(sf.id);
    }
    for (const mod of chunk.modules) {
      this.expanded.delete(mod.id);
      this.clearRelations(mod.id);
      for (const exp of chunk.exports) {
        if (exp.parentId === mod.id) this.clearRelations(exp.id);
      }
    }
  }

  private clearRelations(nodeId: string): void {
    this.relationsOutgoing.delete(nodeId);
    this.relationsIncoming.delete(nodeId);
  }

  private onSelect(node: PositionedNode): void {
    console.log("node selected", node);
  }

  private onTraceLinks(node: PositionedNode): void {
    // MVP: log — future: animated edge tracer
    console.info("[tskb explorer] trace links for:", node.id, `(${node.edgeCount} edges)`);
  }
}

/** Returns the node-id → parent-id map baked into the meta chunk at build time. */
function buildParentLookup(store: GraphStore): Map<string, string> {
  return new Map(Object.entries(store.meta?.parentOf ?? {}));
}

new ExplorerApp().mount();
