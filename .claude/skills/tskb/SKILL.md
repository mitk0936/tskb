---
name: tskb
description: "CLI for exploring the codebase map — search, pick, context, ls, docs, flows. Use whenever you enter unfamiliar territory: discover the architecture around an area or concept, find what's related, inspect a module/export/folder/flow/doc, check constraints — all before grepping or reading files."
argument-hint: [query]
allowed-tools: Bash(npx --no -- tskb *)
---

# TSKB — Codebase Map CLI

Commands for exploring the codebase map. Use to discover the architecture around an area or concept, find what's related to a node, trace a flow, or check rules — before you grep or open files.

## When to Use

tskb is the **high-level map** — bearings, directions, the rules that apply. Use it to orient; then read the code it points you at.

- **Know a node ID or path** — `context` gets the full picture in one call: children, modules, exports, all referencing docs and constraints. Pass a node ID or a repo path.
- **Don't know where to start** — `search` for keywords to find relevant node IDs, then use `context` or `pick`.
- **Check rules** — Constraint docs define rules you must follow. They show up in `pick` results automatically.
- **Skip it** — If you already know exactly which file to edit and the change is self-contained.

## Commands

```bash
npx --no -- tskb search "<query>" --plain                    # Fuzzy search across the entire graph (incl. docs and flows)
npx --no -- tskb pick "<identifier>" --plain                  # Detailed info on any node (by ID or path)
npx --no -- tskb context "<identifier>" --depth=2 --plain     # Node + neighborhood + docs (BFS traversal)
npx --no -- tskb ls --depth=4 --plain                         # Folder hierarchy
npx --no -- tskb docs [<query>] --plain                       # List or search docs
npx --no -- tskb flows [<query>] --plain                      # List or search flows
npx --no -- tskb registry [<query>] [--type=<kind>] --plain   # Discover registered nodes (folders/modules/exports/files/externals/terms)
```

Drop `--plain` for JSON output. Use `--optimized` for compact JSON (no whitespace).

## What's on the Map

- **Folder** — a logical area (feature, layer, package). Has a path and description.
- **Module** — a source file. Shows imports, exports, and code stubs with line numbers.
- **Export** — a function, class, type, or constant from a module.
- **File** — a non-JS/TS file (README, config, etc.).
- **External** — something outside the repo (npm package, API, cloud service, database). Has free-form key-value metadata.
- **Term** — a domain concept, not tied to a file.
- **Flow** — a named, ordered sequence of steps through the system. Has priority like docs.
- **Doc** — a `.tskb.tsx` documentation file. Has priority: essential, constraint, or supplementary.

All paths are relative to project root and can be used directly to read files.

## What Each Command Returns

- **context** — the most efficient single call: returns a node's full neighborhood (children, modules, exports) plus all referencing docs, deduplicated and sorted by priority. Takes a node ID or repo path. Constraint doc IDs are surfaced at the top level.
- **search** — free-text keyword search across the entire graph (includes docs and flows). Returns ranked results. Use `pick` or `context` on any `nodeId` for details.
- **pick** — full detail for one node. Modules/exports show code stubs with line ranges (`// :42-68`). Modules show imports, importedBy, and exports list. Folders show children. Externals show metadata key-value pairs. Constraint docs in results **MUST** be read.
- **ls** — folder tree with essential docs.
- **docs** — list or search docs by priority.
- **flows** — list or search flows by priority. Use `pick` on a flow ID for steps.
- **registry** — list or fuzzy-search registered nodes (folders, modules, exports, files, externals, terms). Use this when authoring docs to discover what's already declared before adding something new — reuse a Term, link to a known External, find sibling Modules. Without args, returns counts and a sample of each kind.
