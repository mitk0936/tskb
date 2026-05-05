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

### 2. Find the questions

A good doc answers ONE question about the system. Your job is to find the right questions.

**Try the dev first.** Ask:
- What's hard about this area for someone new?
- What rules must always hold?
- What would surprise someone reading the code?
- What bug would happen if someone got this wrong?

**If the dev doesn't know yet** (often true — the area may be new to them too), do this instead:
- Read the code yourself.
- Look for tricky logic, error handling, "why" comments, recent bug fixes.
- Write down the questions the code answers.
- Bring the list back to the dev: "Here are the questions I think this area answers. Which are real? Which are wrong? What did I miss?"
- **Pause here** unless the dev has explicitly told you to just write it. Don't write docs cold off your own list.

It's much easier for a dev to react to a list than to think one up cold.

If you can't get an answer from the dev or the code, stop. Missing docs are better than wrong docs.

### 3. Ask if anything is unclear

If a question survives Step 2 but the answer is ambiguous, ask the dev before writing. Don't guess.

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

### 5. Place it

Each architectural area has a `main.tskb.tsx`. Declare any new modules, exports, and terms there. If the new doc is small or specialized, you can also put it in its own file next to `main.tskb.tsx`. See "Folder Structure" below.

### 6. Write

- A few sentences plus references is usually enough.
- Use `{NodeRef}` to link to other things instead of restating them.
- For multi-step processes, use `<Flow>` instead of prose.
- For code examples, use `<Snippet>` — they're type-checked.

For full syntax (registry primitives, JSX components, snippets, class methods), load the **`tskb-update-syntax`** skill.

### 7. Rebuild

Run the project's tskb build script (`npm run build:docs`). Fix any errors before committing.

## Key Rules

- **Map the structure, don't explain the code.** Describe *what* exists, *where* it lives, *why* it matters. Never *how* it works internally.
- **Use types, not strings.** Prefer `Module<{ type: typeof import("...") }>` and `Export<{ type: typeof import("...").Name }>` over plain descriptions. The compiler catches drift. Only use `Term` and `File` (string-only primitives) for things that have no importable type.
- **Import, don't hardcode.** If a type or class exists in the codebase, import it. Imports are validated by the compiler.
- **Rebuild after editing.** The build throws if any path or reference doesn't resolve.
- **Write in plain English.** Docs are read by people from many backgrounds, including non-native English speakers. Use short sentences, common words, and skip jargon. If a fancy word and a plain word mean the same thing, use the plain one. Examples: "uses" not "leverages", "starts" not "initiates", "make" not "facilitate", "call" not "invoke", "needs" not "requires".
- **Primitive `name` and `desc` are durable.** A registry key (the `name`) and its `desc` say what the thing is and why it matters — no implementation details that change as the code evolves. Skip algorithm names ("uses Fuse.js"), internal mechanics ("renders as ellipses"), tool calls ("via execSync"), and step-by-step lists. If the implementation is rewritten next month, the `desc` should still be true. Implementation details belong inside `<Doc>` prose, not in registry metadata. Examples: "Searches the graph and returns ranked matches" beats "Fuzzy searches the graph using Fuse.js across IDs, descriptions, and paths"; "DOT generator for the graph" beats "DOT file generator - renders folders as nested subgraphs, modules as ellipses, terms as diamonds".

## Folder Structure & Naming

### One main.tskb.tsx per area

Every important area has a file called `main.tskb.tsx`. An "area" is:
- a repo (tskb can document several at once)
- a package in a monorepo
- a subsystem inside a package
- a major sub-area inside a subsystem

The `main.tskb.tsx` file holds:
1. The area's main registry — folders, modules, exports, **and Terms** for the things that matter.
2. Reference aliases (`const X = ref as tskb.Modules["..."]`).
3. A short `<Doc>` that gives a quick overview of the area.

**Terms belong in the area's `main.tskb.tsx`.** A Term is the area's vocabulary — names like `SessionToken`, `Repository`, or `DispatchQueue` that several Docs in the area refer to. Declaring them with the area registry keeps the vocabulary in one place. Use simple, plain-English names; the Term's body is the short definition, so write it the way you would explain it to a teammate seeing the code for the first time.

Don't mirror every nested folder. Only create a `main.tskb.tsx` for areas that are themselves architectural — places a new dev would need to understand on their own.

### Other files next to main.tskb.tsx

You can put other `.tskb.tsx` files alongside `main.tskb.tsx` in the same folder. Use them for specific docs that don't belong in the overview — one question per file is fine.

The main registry still lives in `main.tskb.tsx`. **Registry declarations across all `.tskb.tsx` files merge into one global registry**, so a sibling file can reference anything declared anywhere else.

### Top-level files in `docs/`

- `architecture.tskb.tsx` — overview of the whole repo: main areas and how they fit.
- `vocabulary.tskb.tsx` — only for `Terms` and `Externals` shared across many areas (e.g., a domain concept used by both client and server). Area-specific Terms belong in that area's `main.tskb.tsx`.
- `adr/` — Architecture Decision Records, one file per decision.
- `constraints/` — docs with `priority="constraint"`, one rule per file.

### Naming registry keys

Keys should hint at where the thing lives, but stay short. The goal: a reader sees the key and knows what it refers to.

Both styles are fine — pick what reads better:
- Dot-separated lowercase: `auth.service.login`
- PascalCase: `AuthService`, `LoginEndpoint`

Keep keys meaningful, not exhaustive:

```
GOOD: ServerUtils
BAD:  MicroservicesServerUtils    // too much path baked in
```

Class methods follow the parent: `pkg.MyClass.mount`.

**Keys are global.** The same key can't appear twice across all files.

### When to split a file

Split when:
- The registry block has more than ~15–20 declarations.
- The file mixes unrelated areas (e.g., auth and payments).
- One `<Doc>` is growing into a wall of prose — turn it into several smaller question-shaped docs, possibly in separate files.

## Removing or Moving an Area

Deleting a Folder, Module, or Export breaks every `<Doc>`, `<Flow>`, or `<Relation>` that references it — the build fails on the missing key. Recovery:

1. `npx --no -- tskb search "<oldKey>" --plain` and `tskb context "<oldKey>" --plain` — find every dependent.
2. Update or delete the referencing docs **as part of the same change**. Don't leave stale references; don't comment out — delete.
3. Rebuild to confirm the graph still resolves.

## After Editing

Always rebuild to validate references and update the graph:

```bash
npm run build:docs
```

The build fails if any import path, export name, or folder path doesn't resolve. Fix the error before committing.

## Troubleshooting

If the build fails with a TypeScript error, check:
- `docs/tsconfig.json` has `"jsxImportSource": "tskb"`
- `baseUrl` and `rootDir` point to the repo root (e.g., `"../"`)
- Import paths in `.tskb.tsx` files end with `.js` (NodeNext module resolution)

**Monorepo tips:**
- Place `docs/` at the workspace root.
- Set `baseUrl` and `rootDir` to `"../"` from the docs folder (or adjust for your layout).
- Add `paths` entries for workspace packages if needed.
