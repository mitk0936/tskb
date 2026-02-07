# AGENTS.md

## Purpose

This repository uses **TSKB** as a structure-first map of the codebase.

TSKB defines:
- what exists
- where things live
- how areas relate

It is the primary tool for orientation.

---

## Mandatory workflow

Before reading or editing code, try to undestand the project structure, intent and architecture, by using tskb cli tools:

**Inspect structure**
```bash
npx tskb ls --depth 2
```


**Understand the area**
```bash
npx tskb describe "<id>"
```

**Locate the relevant area, search for keywords, concepts in a scope (folder)**
```bash
npx tskb select "<concept or feature>" "<folderId>"
```

It might be helpfull to have a broader picture, before jumping into reading files

---

## Rules

- Prefer **TSKB CLI** over blind search
- Use **TSKB to decide where**, then Read/Grep to inspect how
- If something is not in TSKB, it is likely not architecturally important
- If structure or architectural intent changes, update `.tskb.tsx` docs

---

## Updating TSKB docs

Update documentation when:
- New folders, packages, or major modules are added
- Responsibilities or boundaries change
- New core concepts are introduced

Do **not** document minor implementation details.

---

## Note

TSKB is a navigator, not a replacement for source code.
