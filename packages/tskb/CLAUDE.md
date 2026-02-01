# CLAUDE.md — TSKB Navigation Guide

This repository uses **TSKB (TypeScript Knowledge Base)** to expose **structure and intent** of the codebase.

TSKB is a **map**, not a replacement for source code.
Use it to orient yourself **before** reading files.

---

## Core Rule

> **Structure first → concepts second → source last.**

Never read source files until you understand **where you are** and **what the area is responsible for**.

---

## Knowledge Graph

The repository provides a prebuilt knowledge graph:

```
<repo-root>/docs/tskb-package/dist/taskflow-graph.json
```

This graph describes folders, modules, exports, and where they are documented.

---

## Commands

### 1. `describe` — Understand Structure (PRIMARY)

Use `describe` to see **what exists here**.

- Shallow by design (no deep recursion)
- Structural only (no interpretation)
- Safe to use anywhere

**Example:**

```bash
cd ../../docs/tskb-package
node ../../packages/tskb/dist/cli/index.js describe ./dist/taskflow-graph.json "<path-from-root-of-the-repo>"
```

You get:

- the context (folder)
- its parent
- direct children
- modules and exports
- docs that mention this area

Use this to orient yourself.

---

### 2. `select` — Locate Concepts (SECONDARY)

Use `select` only **after** you roughly know the area.

`select` finds **candidate nodes** related to a concept **within a specific folder scope**.
This avoids noise from unrelated concepts in other parts of the codebase.
Treat results as _hints_, not truth.

**Example:**

```bash
cd ../../docs/tskb-package
node ../../packages/tskb/dist/cli/index.js select ./dist/taskflow-graph.json "<concept-keyword>" "<folder-scope>"
```

**Important:**

- The `<folder-scope>` parameter is **mandatory**
- Results are filtered to only include nodes within that folder and its descendants
- Use `describe` first to identify the correct scope

Use results to decide **where to describe next**.

---

## Recommended Workflow

### Understanding a feature

1. `describe` the likely area (to identify the scope)
2. `select` the concept within that scope
3. `describe` the returned folder from select results
4. Read source files

---

### Understanding a folder

1. `describe` the folder
2. `describe` its parent
3. Inspect listed modules / exports
4. Read source files if needed

---

## When to Read Source Files

Read source files **only after**:

- you know the folder’s role
- you know its boundaries
- you know which files matter

TSKB answers:

- _what exists_
- _where it lives_
- _where it is referenced_

Source code answers:

- _how it works_

---

## Best Practices

### DO

- Use `describe` first
- Navigate structurally
- Treat the graph as a map
- Form a hypothesis before reading code

### DON’T

- Don’t jump straight into files
- Don’t assume missing graph data means missing functionality
- Don’t treat graph output as implementation truth

---

## Mental Model

- **Folders** = responsibility boundaries
- **Modules** = implementation units
- **Exports** = public surface
- **Docs** = human-declared context

TSKB keeps reasoning **local, cautious, and intentional**.

---

## Remember

> **If you don’t know where you are, don’t act.**
>
> Use structure to earn understanding before touching code.
