# Folder layout & naming

## Top-level files in `docs/`

- `architecture.tskb.tsx` — overview of the whole repo: main areas and how they fit.
- `vocabulary.tskb.tsx` — only for `Terms` and `Externals` shared across many areas (e.g., a domain concept used by both client and server). Area-specific Terms belong in that area's `main.tskb.tsx`.
- `adr/` — Architecture Decision Records, one file per decision.
- `constraints/` — docs with `priority="constraint"`, one rule per file.

## Naming registry keys

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

## When to split a file

Split when:
- The registry block has more than ~15–20 declarations.
- The file mixes unrelated areas (e.g., auth and payments).
- One `<Doc>` is growing into a wall of prose — turn it into several smaller question-shaped docs, possibly in separate files.
