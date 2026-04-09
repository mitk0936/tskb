import * as d3 from "d3";
import { ChunkLoader } from "./graph/loader";
import { GraphStore } from "./store/graph-store";
import { computeLayout } from "./layout/lane-engine";
import { createNodeRenderer } from "./components/nodes/index";
import {
  buildStructureLinks,
  renderStructureEdges,
  renderLaneBands,
} from "./components/edges/EdgeRenderer";
import {
  showGlobalSpinner,
  hideGlobalSpinner,
  showNodeSpinner,
  removeNodeSpinner,
} from "./ui/Spinner";
import { mountDetailPanel } from "./ui/DetailPanel";
import type { PositionedNode } from "./types";
import type { NodeComponent } from "./components/nodes/base";

// ─── State ────────────────────────────────────────────────────────────────────

const loader = new ChunkLoader();
const store = new GraphStore();

/** UI state lives outside the data store */
const ui = {
  expanded: new Set<string>(),
  selected: null as PositionedNode | null,
  searchQuery: "",
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // ── Canvas setup ─────────────────────────────────────────────────────────
  const svgEl = document.getElementById("canvas") as SVGSVGElement;
  const svg = d3.select<SVGSVGElement, unknown>(svgEl);

  const zoomLayer = svg.append("g").attr("class", "zoom-layer");
  const laneBgLayer = zoomLayer.append("g").attr("class", "lane-bg-layer");
  const edgeLayer = zoomLayer.append("g").attr("class", "edge-layer");
  const nodeLayer = zoomLayer.append("g").attr("class", "node-layer");

  // Zoom / pan
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 5])
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
    });

  svg.call(zoom).on("dblclick.zoom", null);

  // Start with a slight offset so nodes aren't flush against the toolbar
  svg.call(zoom.translateBy, 20, 20);

  // ── Detail panel ─────────────────────────────────────────────────────────
  const detailPanel = mountDetailPanel(() => {
    ui.selected = null;
  });

  // ── Node handlers ─────────────────────────────────────────────────────────
  const hasChildrenFn = (node: PositionedNode): boolean => node.detail["_hasChildren"] === "true";

  const onExpand = async (node: PositionedNode): Promise<void> => {
    if (node.type === "folder") {
      if (ui.expanded.has(node.id)) {
        // Collapse: also collapse all descendants
        ui.expanded.delete(node.id);
        collapseDescendants(node.id);
        render();
      } else {
        // Fetch chunk if not loaded yet
        if (!store.folderChunks.has(node.id)) {
          const spinnerEl = showNodeSpinner(nodeLayer.node()!, node.x + 190, node.y + 38);
          try {
            const chunk = await loader.load("folder", node.id);
            store.addFolderChunk(chunk);
          } catch (e) {
            console.error("Failed to load chunk for", node.id, e);
          } finally {
            removeNodeSpinner(spinnerEl);
          }
        }
        ui.expanded.add(node.id);
        render();
      }
    } else if (node.type === "module") {
      if (ui.expanded.has(node.id)) ui.expanded.delete(node.id);
      else ui.expanded.add(node.id);
      render();
    }
  };

  /** Recursively collapse all expanded descendants of a folder */
  function collapseDescendants(folderId: string): void {
    const chunk = store.folderChunks.get(folderId);
    if (!chunk) return;
    for (const sf of chunk.subfolders ?? []) {
      ui.expanded.delete(sf.id);
      collapseDescendants(sf.id);
    }
    for (const mod of chunk.modules) ui.expanded.delete(mod.id);
  }

  const onSelect = (node: PositionedNode): void => {
    ui.selected = node;
    detailPanel.show(node);
  };

  const onTraceLinks = (node: PositionedNode): void => {
    // MVP: highlight node — future: animated edge tracer
    console.info("[tskb explorer] trace links for:", node.id, `(${node.edgeCount} edges)`);
  };

  // ── Node renderer ─────────────────────────────────────────────────────────
  const renderer: NodeComponent = createNodeRenderer(
    onExpand,
    onSelect,
    onTraceLinks,
    hasChildrenFn
  );

  // ── Search ────────────────────────────────────────────────────────────────
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    ui.searchQuery = searchInput.value.toLowerCase().trim();
    render();
  });

  // ── Subscribe to store data changes ──────────────────────────────────────
  store.subscribe(() => render());

  // ── Render function ───────────────────────────────────────────────────────
  function render(): void {
    if (!store.meta) return;

    const layout = computeLayout(store, ui.expanded);
    const allNodes = [...layout.structureNodes, ...layout.docsNodes, ...layout.otherNodes];

    // Update stats label
    const meta = store.meta.metadata;
    document.getElementById("stats")!.textContent =
      `${meta.stats.folderCount ?? 0} folders · ` +
      `${meta.stats.moduleCount ?? 0} modules · ` +
      `${meta.stats.exportCount ?? 0} exports`;

    // Lane backgrounds
    const CANVAS_W = Math.max(4000, Math.max(...allNodes.map((n) => n.x + 250), 0));
    renderLaneBands(
      laneBgLayer as d3.Selection<SVGGElement, unknown, null, undefined>,
      layout,
      CANVAS_W
    );

    // Structure edges
    const structureLinks = buildStructureLinks(layout.structureNodes);
    renderStructureEdges(
      edgeLayer as d3.Selection<SVGGElement, unknown, null, undefined>,
      structureLinks
    );

    // Filter by search
    const visibleNodes = ui.searchQuery
      ? allNodes.filter(
          (n) =>
            n.id.toLowerCase().includes(ui.searchQuery) ||
            n.label.toLowerCase().includes(ui.searchQuery) ||
            n.description.toLowerCase().includes(ui.searchQuery)
        )
      : allNodes;

    // Node groups (keyed by id for stable enter/exit)
    const groups = (nodeLayer as d3.Selection<SVGGElement, unknown, null, undefined>)
      .selectAll<SVGGElement, PositionedNode>("g.node")
      .data(allNodes, (d) => d.id);

    const entered = groups.enter().append("g").attr("class", "node");
    renderer.enter(entered);

    const merged = entered.merge(groups);

    // Dim nodes that don't match search
    if (ui.searchQuery) {
      const matchIds = new Set(visibleNodes.map((n) => n.id));
      merged.style("opacity", (d) => (matchIds.has(d.id) ? "1" : "0.15"));
    } else {
      merged.style("opacity", "1");
    }

    renderer.update(merged);
    groups.exit().remove();
  }

  // ── Load initial data ─────────────────────────────────────────────────────
  showGlobalSpinner();
  try {
    const meta = await loader.load("meta");
    store.setMeta(meta);
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

init();
