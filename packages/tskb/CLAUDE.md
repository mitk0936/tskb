# Claude Instructions — TSKB Package

This package uses **TSKB (TypeScript Semantic Knowledge Base)** to encode
architectural intent as a structured knowledge graph.

Its the main package in the monorepo, everything around it are either documentation, examples,
dont query other parts of the repo, unless specified explicitly.

**Important**  
Do NOT try to understand the architecture by reading source files directly.
Always start from the TSKB knowledge graph.

---

## Knowledge Graph Location

The authoritative architectural map for this package is stored as a JSON file.

**Path to the knowledge graph ../../docs/tskb-package/dist/taskflow-graph.json:**
If the graph is not present in the path, it needs to be rebuild:

**cd ../../docs/tskb-package/**
**npm run generate**

All architectural reasoning must be grounded in this graph.

---

## How to Understand This Codebase

When you need to understand any concept, module, or behavior:

1. Locate the relevant node in the knowledge graph:
   - folder
   - module
   - export / function
   - term (concept)
   - documentation file
   - repository path

2. Use the graph data to determine:
   - what the node represents
   - where it sits in the hierarchy
   - what depends on it
   - what documentation explains it
   - what explicit relationships it has

3. Only after establishing architectural context,
   inspect implementation files if necessary.

Never reverse this order.

---

## What the Knowledge Graph Represents

The TSKB graph encodes:

- Repository folders and modules
- Public and internal exports
- Architectural terms and concepts
- Documentation files (`.tskb.tsx`)
- Explicit and implicit relationships between all entities

The graph represents **intentional architecture**, not incidental structure.

If a relationship is not present in the graph, assume it is **not part of the intended design**, or it could be not yet documented module, folder, etc.

---

If information is missing or unclear, state that explicitly.

---

## What to Prefer

- Deterministic conclusions grounded in graph data
- Clear explanations of _why_ components exist
- References to documentation nodes when available
- Small, bounded architectural context windows
- **Concise, direct responses** — avoid verbose explanations unless specifically requested

---

## Mental Model

Think of the knowledge graph as:

> A GPS map of the codebase  
> Source files are streets — the graph is the city plan

Navigate using the map first, then inspect streets only when needed.

---

## Final Rule

If architectural intent is unclear, **re-examine the graph**,
then read folders, files, etc.
