# TSKB Library

TypeScript knowledge base tool that extracts architectural documentation from code and builds queryable knowledge graphs.

## Documentation

Architecture docs: `../../docs/tskb-package/src/`
Knowledge graph: `../../docs/tskb-package/dist/taskflow-graph.json`

## Critical Principle

**Path Handling:** All paths in graphs must be relative to tsconfig baseDir/rootDir. Use forward slashes `/` for portability.
