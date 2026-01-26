# TaskFlow App Documentation

Architectural documentation for the TaskFlow application.

## What This Is

Documents TaskFlow's architecture using `.tskb.tsx` files:

- ADRs (Architecture Decision Records)
- Constraints
- Data flows and patterns

Check `dist/taskflow-graph.json` for current structure.

## Writing Docs

Use registry references to create graph edges.
Add vocabulary to registry files before documenting.
Rebuild after changes: `npm run generate`
