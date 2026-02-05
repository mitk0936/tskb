# CLAUDE.md — TSKB Navigation Guide

This repository uses **TSKB (TypeScript Knowledge Base)** to expose **structure and intent** of the codebase.

TSKB is a **map**, not a replacement for source code.
Use it to orient yourself **before** reading files.

---

## Core Rule

> **Structure first → concepts second → source last.**

Never read source files until you understand **where you are** and **what the area is responsible for**.

**Recommended workflow:**

1. Use `ls` to see all folders and get oriented
2. Use `describe` to understand specific areas
3. Use `select` to find concepts within a scope
4. Read source files only after understanding the structure

---

## Knowledge Graph

The repository provides a prebuilt knowledge graph:

```
<repo-root>/docs/tskb-package/dist/taskflow-graph.json
```

This graph describes folders, modules, exports, and where they are documented.

---

## Commands

### 0. `ls` — List All Folders (ORIENTATION)

Use `ls` to get a quick overview of all folders in the codebase.

- Always starts from `Package.Root`
- Shows folder hierarchy with depth levels
- Controllable depth (default: 1 level)
- Returns flat JSON list

**Example:**

```bash
cd ../../docs/tskb-package
node ../../packages/tskb/dist/cli/index.js ls ./dist/taskflow-graph.json [--depth <n>]
```

**Depth options:**

- No flag: depth=1 (immediate children only)
- `--depth 2`: Show 2 levels deep
- `--depth -1`: Show all folders (unlimited)

You get a flat list with:

- `id`: Folder ID in the registry
- `depth`: How deep in the hierarchy (0 = root)
- `desc`: Folder description
- `path`: Filesystem path

Use this for initial orientation or to find folder IDs.

---

### 1. `describe` — Understand Structure (PRIMARY)

Use `describe` to see **what exists here**.

- Shallow by design (no deep recursion)
- Structural only (no interpretation)
- Safe to use anywhere

**Example:**

```bash
cd ../../docs/tskb-package
node ../../packages/tskb/dist/cli/index.js describe ./dist/taskflow-graph.json "<folder-id>"
```

**Folder ID format:**

- Use folder IDs from the knowledge graph (e.g., `"tskb.cli"`, `"Package.Root"`)
- Folder IDs are shown in the `id` field when describing folders
- Start with `"Package.Root"` to explore from the top level

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
node ../../packages/tskb/dist/cli/index.js select ./dist/taskflow-graph.json "<concept-keyword>" "<folder-id>"
```

**Important:**

- The `<folder-id>` parameter is **mandatory**
- Results are filtered to only include nodes within that folder and its descendants
- Use `describe` first to identify the correct scope folder ID

**Folder ID format (same as describe):**

- Use folder IDs from the knowledge graph (e.g., `"tskb.cli"`, `"Package.Root"`)
- Folder IDs are shown in the `id` field when describing folders
- Use broader IDs (like `"Package.Root"`) for wider searches, or specific IDs (like `"tskb.cli.commands"`) for narrower searches

Use results to decide **where to describe next**.

---

TSKB answers:

- _what exists_
- _where it lives_
- _where it is referenced_

Source code answers:

- _how it works_

---

## Mental Model

- **Folders** = responsibility boundaries
- **Modules** = implementation units
- **Exports** = public surface
- **Docs** = human-declared context

---

## Remember

> **If you don’t know where you are, don’t act.**
>
> Use structure to earn understanding before touching code.
