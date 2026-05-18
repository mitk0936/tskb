# Relations — when, what, and which direction

A `<Relation from={A} to={B} label="..." />` is a single semantic edge between two registered nodes. Use it for one-line "X relates to Y" facts. For anything with order or multiple participants, use a `<Flow>` instead.

## What Relations are for

**Pointing out non-obvious links between parts of the codebase** — connections a reader wouldn't see by following the folder tree, the imports, or the module morphology. Two distant modules that share a hidden coupling. A module that depends on an external boundary the import graph doesn't make obvious. A folder that owns a domain term defined elsewhere. If the link is already visible from the structural edges (`belongs-to`, `contains`) or the import graph, you don't need a Relation.

## What labels should say

Describe the **functional or architectural relationship** — the role one part plays for the other. Not how it's wired in code.

- **Good:** "owns user identity", "is the source of truth for tasks", "wraps the compiler API", "depends on for auth", "renders into".
- **Bad:** "calls login()", "imports `validateToken`", "instantiates new AuthService()". These are implementation details — the imports edge and morphology already capture them, and they break the moment a method is renamed.

If the only thing you can say about the edge is the name of a function call, you don't need a Relation.

## Direction matters

Read the label as a verb phrase from `from` to `to`. Pick `from`/`to` so the sentence scans naturally: `<Relation from={AuthService} to={Postgres} label="persists sessions to" />` reads "AuthService persists sessions to Postgres".
