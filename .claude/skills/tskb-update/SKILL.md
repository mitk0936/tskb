---
name: tskb-update
description: "Write, update, and maintain .tskb.tsx documentation files — covers the workflow for finding the right questions to answer, folder structure and naming conventions, and key authoring rules. Use when the developer asks to document something or when you spot something structural that isn't in the map. For full syntax (registry primitives, JSX components, snippets), load the tskb-update-syntax skill."
allowed-tools: Bash(npx --no -- tskb *), Bash(npm run build:docs:*), Read, Write, Edit, Glob, Grep
---

# TSKB — Write & Update Documentation

How to write and maintain the codebase map. The map lives in `.tskb.tsx` files — they declare what exists and how it connects.

For full syntax — registry primitives, JSX components, snippets, class-method patterns — load the **`tskb-update-syntax`** skill.

## When to Update

Update the docs when:
- A new feature area is being built — declare it before or alongside the code.
- You spot a folder, module, or export that matters but isn't in the graph.
- An architectural decision needs to be recorded (use `<Adr>`).
- A rule must be followed for the system to keep working (use `priority="constraint"`).
- A multi-step process spans several modules — capture it as a `<Flow>`, not prose.
- The dev asks for it.

Don't update for fixes that don't change structure (renames inside a function, off-by-one fixes, log tweaks), purely internal refactors, or temporary code. **Do** update if a fix reveals a missing constraint or surfaces an undocumented invariant — that's not "routine".

## Documentation Workflow

When asked to document something, follow these steps. Don't skip ahead to writing.

### 1. Look first

See what's already there:

```bash
npx --no -- tskb context "<nodeId|path>" --plain   # docs and modules in this area
npx --no -- tskb ls --plain                        # which folders are mapped
npx --no -- tskb search "<keywords>" --plain       # is this already written?
```

If a doc already covers the topic, update it. Don't write a second one.

### 2. Discover what's already declared

Before declaring new Terms, Externals, or Modules, see what already exists — reuse beats redeclare:

```bash
npx --no -- tskb registry --plain                          # overview: counts + samples per kind
npx --no -- tskb registry "<concept>" --plain              # fuzzy across all registry kinds
npx --no -- tskb registry --type=term --plain              # all Terms (the area vocabularies)
npx --no -- tskb registry --type=external --plain          # all Externals (npm packages, services)
```

If a Term already names the concept you were about to introduce, reference it (`{ExistingTerm}`) instead of declaring a new one. Same for Externals — one declaration per external dependency, shared across all docs that touch it.

### 3. Find the questions

A good doc answers ONE question about the system. Your job is to find the right questions.

**Try the dev first.** Ask:
- What's hard about this area for someone new?
- What rules must always hold?
- What would surprise someone reading the code?
- What bug would happen if someone got this wrong?

**If the dev doesn't know yet** (often true — the area may be new to them too):
- Read the code yourself.
- Look for tricky logic, error handling, "why" comments, recent bug fixes.
- Write down the questions the code answers.
- Bring the list back to the dev: "Here are the questions I think this area answers. Which are real? Which are wrong? What did I miss?"
- **Pause here** unless the dev has explicitly told you to just write it.

If a question survives the conversation but its answer is ambiguous, ask before writing. Missing docs are better than wrong docs.

### 4. Frame each doc as a question

Every `<Doc explains="...">` answers one question. Write the question in plain language and end it with a question mark.

```tsx
// GOOD — one specific question
<Doc explains="How does login issue JWTs?">
<Doc explains="Why does the worker pool re-queue on partial failure?">
<Doc explains="What ordering does the dispatch queue guarantee?" priority="constraint">

// BAD — topic, not a question
<Doc explains="Authentication">

// BAD — feature list, not a question
<Doc explains="CLI logging: stderr-only output, --verbose flag">

// BAD — two questions in one
<Doc explains="How does login work and how do sessions expire?">
// → split into two docs
```

This rule applies to **new docs**. Older statement-form docs are fine where they are — only update them if you're already touching the file for another reason.

### 5. Place it & write

Declare any new modules, exports, and Terms in the **closest** area's `main.tskb.tsx` — the one that owns the related code. The registry merges across files so any placement compiles, but locality keeps each area's entry point honest. See "Where things go" below for the rule. Small or specialized docs can live in their own file alongside `main.tskb.tsx`.

- A few sentences plus references is usually enough.
- Use `{NodeRef}` to link to other things instead of restating them.
- For multi-step processes, use `<Flow>` instead of prose.
- For code examples, use `<Snippet>` — they're type-checked.

For full syntax (registry primitives, JSX components, snippets), load the **`tskb-update-syntax`** skill.

### 6. Rebuild

Run `npm run build:docs`. The build fails if any import path, export name, or folder path doesn't resolve. Fix errors before committing.

## Key Rules

- **Map the structure, don't explain the code.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Use types, not strings.** Prefer `Module<{ type: typeof import("...") }>` and `Export<{ type: typeof import("...").Name }>` over plain descriptions. The compiler catches drift. Only use `Term` and `File` (string-only primitives) for things that have no importable type.
- **Import, don't hardcode.** If a type or class exists in the codebase, import it. Imports are validated by the compiler.
- **Rebuild after editing.** The build throws if any path or reference doesn't resolve.
- **Write in plain English.** Docs are read by people from many backgrounds, including non-native English speakers. Use short sentences, common words, and skip jargon. If a fancy word and a plain word mean the same thing, use the plain one. Examples: "uses" not "leverages", "starts" not "initiates", "make" not "facilitate", "call" not "invoke", "needs" not "requires".
- **Primitive `name` and `desc` are durable.** A registry key (the `name`) and its `desc` say what the thing is and why it matters — no implementation details that change as the code evolves. Skip algorithm names ("uses Fuse.js"), internal mechanics ("renders as ellipses"), tool calls ("via execSync"), and step-by-step lists. If the implementation is rewritten next month, the `desc` should still be true. Implementation details belong inside `<Doc>` prose, not in registry metadata. Examples: "Searches the graph and returns ranked matches" beats "Fuzzy searches the graph using Fuse.js across IDs, descriptions, and paths"; "DOT generator for the graph" beats "DOT file generator - renders folders as nested subgraphs, modules as ellipses, terms as diamonds".

## Where things go

**Locality: register a node next to its closest neighbors.** A Module belongs in the area that owns its source file. An Export goes wherever its Module is declared. A Term lives in the area whose Docs use it (only promote to `vocabulary.tskb.tsx` when multiple distant areas share it). The compiler accepts any placement because the registry merges across files — but a node declared far from its kin makes its area's entry point misleading and forces the next reader to chase declarations across the repo.

Every important area has a `main.tskb.tsx` — that's the area's entry point and registry root. An "area" is a repo, a package in a monorepo, a subsystem inside a package, or a major sub-area inside a subsystem. Don't mirror every nested folder; only create a `main.tskb.tsx` for areas a new dev would need to understand on their own.

The `main.tskb.tsx` file holds:
1. The area's main registry — folders, modules, exports, **and Terms** for the things that matter.
2. Reference aliases (`const X = ref as tskb.Modules["..."]`).
3. A short `<Doc>` that gives a quick overview of the area.

You can put other `.tskb.tsx` files alongside `main.tskb.tsx` for specific docs — one question per file is fine. **Registry declarations across all `.tskb.tsx` files merge into one global registry**, so a sibling file can reference anything declared anywhere else.

For naming registry keys, when to split a file, and the top-level layout under `docs/`, load `references/folder-layout.md`.

## References (load only when needed)

- `references/folder-layout.md` — top-level `docs/` files, naming registry keys, and when to split a file. Load when creating a new area or splitting up a doc.
- `references/removing-areas.md` — recovery procedure when deleting or moving a Folder, Module, or Export breaks references. Load when the build fails after a deletion or rename.
- `references/setup.md` — tsconfig requirements, monorepo tips, common build errors. Load when tskb is being set up in a new repo or the build is failing on config.

