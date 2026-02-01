# Claude Instructions — TSKB Package

This package uses **TSKB (TypeScript Semantic Knowledge Base)** to encode
architectural intent as a structured knowledge graph.

This is the main package in the monorepo. Everything around it (docs, examples) is supplementary.
Do not query other parts of the repo unless explicitly requested.

---

## Navigation Strategy: Describe First, Select Second, Then Read Files

**IMPORTANT**: Use the TSKB CLI to understand **structure and intent** before reading source files.
The graph provides the **map**; source files provide the **details**.

Reading source code is allowed, but **only after** you understand where things live and how they relate.

### Knowledge Graph Location

```bash
../../docs/tskb-package/dist/taskflow-graph.json
```

---

## Available Commands

### 1. `describe` — Inspect Folder Structure (PRIMARY)

**Use when:** You need to understand what exists in a folder and how it is organized.

`describe` is intentionally **shallow and scoped** — it shows only direct structure.

**Syntax:**

```bash
node node ../../packages/tskb/dist/cli/index.js describe "<graph.json>" "<folder-path>"
```

**Path formats supported:**

- Relative from repo root: `"src/cli"` or `"packages/tskb/src/cli"`
- Relative from current directory: `"./src/cli"`
- Absolute path: `"/full/path/to/folder"`

**Examples:**

```bash
# Describe the CLI folder
node node ../../packages/tskb/dist/cli/index.js describe "../../docs/tskb-package/dist/taskflow-graph.json" "src/cli"

# Describe the core extraction logic
node node ../../packages/tskb/dist/cli/index.js describe "../../docs/tskb-package/dist/taskflow-graph.json" "src/core/extraction"

# Use full path from repo root
node node ../../packages/tskb/dist/cli/index.js describe "../../docs/tskb-package/dist/taskflow-graph.json" "packages/tskb/src/core"
```

**Returns:**

- **context**: The folder's ID, type, description, and path
- **parent**: Immediate parent folder
- **contents**: Direct child folders
- **modules**: Modules that belong to this folder
- **exports**: Exports that belong to this folder
- **referencedInDocs**: Documentation files that reference this folder

---

### 2. `select` — Search for Concepts (SECONDARY)

**Use when:** You need to locate where a concept, feature, or idea might live.

`select` performs a **graph-wide ranked search**. Treat results as **candidates**, not absolute truth.

**Syntax:**

```bash
node node ../../packages/tskb/dist/cli/index.js select "<graph.json>" "<search-term>" [--verbose]
```

**Examples:**

```bash
# Find CLI-related code
node node ../../packages/tskb/dist/cli/index.js select "../../docs/tskb-package/dist/taskflow-graph.json" "cli"

# Find extraction logic
node node ../../packages/tskb/dist/cli/index.js select "../../docs/tskb-package/dist/taskflow-graph.json" "extraction"

# Search for multi-word concepts
node node ../../packages/tskb/dist/cli/index.js select "../../docs/tskb-package/dist/taskflow-graph.json" "knowledge graph"

# Get verbose output with more context
node node ../../packages/tskb/dist/cli/index.js select "../../docs/tskb-package/dist/taskflow-graph.json" "registry" --verbose
```

**Returns:**

- **match**: Best matching node with confidence score
- **parent**: Parent folder/context
- **children**: Child nodes (subfolders, modules, exports)
- **docs**: Documentation references
- **files**: Related file paths
- **suggestions**: Alternative matches if confidence is low

---

## Effective Navigation Workflows

### Workflow 1: Understanding a Feature

1. **Describe** the relevant top-level area to understand structure
2. **Select** the feature or concept to narrow focus
3. **Describe** the specific folder where it lives
4. **Read** the relevant source files

**Example: Understanding how commands work**

```bash
# Step 1: Describe CLI area
node node ../../packages/tskb/dist/cli/index.js describe "../../docs/tskb-package/dist/taskflow-graph.json" "src/cli"

# Step 2: Locate commands
node node ../../packages/tskb/dist/cli/index.js select "../../docs/tskb-package/dist/taskflow-graph.json" "commands"

# Step 3: Describe commands folder
node node ../../packages/tskb/dist/cli/index.js describe "../../docs/tskb-package/dist/taskflow-graph.json" "src/cli/commands"

# Step 4: Read specific file
# src/cli/commands/select.ts
```

---

### Workflow 2: Understanding a Folder’s Context

1. **Describe** the folder
2. **Describe** its parent to understand placement
3. **Select** specific modules or exports
4. **Read** implementation files

**Example: Understanding extraction logic**

```bash
# Step 1: Describe extraction folder
node node ../../packages/tskb/dist/cli/index.js describe "../../docs/tskb-package/dist/taskflow-graph.json" "src/core/extraction"

# Step 2: Describe parent context
node node ../../packages/tskb/dist/cli/index.js describe "../../docs/tskb-package/dist/taskflow-graph.json" "src/core"

# Step 3: Read implementation
# src/core/extraction/registry.ts
```

---

### Workflow 3: Finding Related Code

1. **Describe** likely structural areas
2. **Select** the concept to find candidate locations
3. **Describe** parent folders to confirm context
4. **Read** source files in order of relevance

---

## Best Practices

### ✅ DO:

- **Use `describe` first** to establish structure
- Use `select` **after** you know roughly where to look
- Treat graph results as **navigation aids**, not full truth
- Explicitly switch to source code only after forming a hypothesis
- Check **parent** and **children** to understand hierarchy
- Use `--verbose` on `select` when refining understanding

### ❌ DON’T:

- Don’t read source files without structural context
- Don’t assume missing graph nodes mean missing functionality
- Don’t over-specify implementation details without source confirmation
- Don’t query outside `packages/tskb/` unless explicitly asked

---

## Quick Reference

| Task                | Command      | Example                          |
| ------------------- | ------------ | -------------------------------- |
| Explore structure   | `describe`   | `describe graph.json "src/cli"`  |
| Locate concept      | `select`     | `select graph.json "extraction"` |
| Refine context      | `describe`   | `describe graph.json "src/core"` |
| Read implementation | Source files | After graph navigation           |

---

## Graph Structure Overview

The knowledge graph contains:

- **Folders** — Logical contexts and boundaries
- **Modules** — TypeScript files with descriptions
- **Exports** — Public APIs
- **Terms** — Domain concepts
- **Docs** — Documentation bound to code

**Edges (relationships):**

- `belongs-to`
- `contains`
- `references`
- `related-to`

---

## Remember

> **Structure first, concepts second, source last.**
>
> The graph answers _what exists and why_.
> Source files answer _how it works_.
>
> Use both — in the right order.
