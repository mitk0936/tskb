# tskb Explorer

Visual, interactive explorer for the tskb knowledge graph.
Opens via `tskb explore`. Exportable as static HTML via `tskb explore --export`.

## Architecture

### Layout — three horizontal lanes stacked vertically

```
┌────────────────────────────────────────────────────────────┐
│  LANE 1 — STRUCTURE                                        │
│  [Root] → [Folder A] → [Module 1] → [Export X]            │
│         ↘ [Folder B] → [Module 2]                         │
├────────────────────────────────────────────────────────────┤
│  LANE 2 — DOCS  (essential → constraint → supplementary)  │
│  [Doc A] ────────────────────────────╮ (cross-lane edges) │
├───────────────────────────────────────────────────────────┤
│  LANE 3 — TERMS / FLOWS / EXTERNALS                       │
└───────────────────────────────────────────────────────────┘
```

- **Horizontal expansion**: click `▶` on a node → children appear to the right
- **Cross-lane edges**: docs/flows reference code nodes above (curved SVG paths)
- **Zoom/pan**: standard D3 zoom on the SVG canvas

### Data loading — chunked, on demand

```
chunks/
  meta.json           ← always loaded first (folders summary + docs + flows)
  folder-{id}.json    ← loaded when folder is expanded
```

### Node component interface

Each node type implements `NodeComponent`:

- `enter(selection)` — append initial SVG elements
- `update(selection)` — update positions/state
- `anchor(node, side)` — connection point for edges
- `getSize(node)` — bounding box

### File structure

```
explorer-app/src/
  main.ts                       App entry: fetch meta, mount canvas, render loop
  types.ts                      Shared types: ExplorerNode, ExplorerLink, PositionedNode
  store/
    graph-store.ts              State: meta, chunks, expanded set, selected node
  graph/
    chunk-types.ts              Discriminated union for all chunk shapes + URL builder
    loader.ts                   Type-safe fetch with LRU cache
  layout/
    lane-engine.ts              Position computation (d3.tree for structure, lists for docs/other)
  components/
    nodes/
      base.ts                   NodeComponent interface + BaseNodeRenderer (rounded rect)
      index.ts                  Factory: type → component
    edges/
      EdgeRenderer.ts           SVG cubic-bezier paths between node anchors
  ui/
    Spinner.ts                  Global + per-node loading spinner
    DetailPanel.ts              Right-side detail panel (sketch for MVP)
```

## Commands

```bash
# Serve locally (auto-opens browser)
tskb explore
tskb explore --port 4000
tskb explore --no-open

# Export static folder
tskb explore --export
tskb explore --export ./docs/explorer
```

## Development

```bash
cd packages/tskb
npm run build:app        # build SPA only
npm run build            # build SPA + library
```

The SPA is pre-built and shipped inside the tskb npm package (`dist/explorer/`).
