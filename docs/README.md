# tskb Documentation

This directory contains architecture documentation examples written using tskb.

## Projects

### tskb Package Meta-Documentation

The `tskb-package/` directory contains **tskb documenting itself** - a meta-documentation layer showing how to use tskb to document the tskb library's own architecture.

**Key files:**

- [docs/tskb-package/src/main.tskb.tsx](tskb-package/src/main.tskb.tsx) - Main architecture overview
- [docs/tskb-package/src/terms.tskb.tsx](tskb-package/src/terms.tskb.tsx) - Vocabulary definitions
- [docs/tskb-package/src/cli/](tskb-package/src/cli/) - CLI implementation docs
- [docs/tskb-package/src/core/](tskb-package/src/core/) - Core extraction system docs

**Build and explore:**

```bash
cd tskb-package
npm run build        # Generate knowledge graph
npm run visualize    # Generate Graphviz diagram
npm run query cli    # Query the graph for CLI-related nodes
```

**Documentation philosophy:**

These docs follow the **"map not manual"** approach described in the [tskb package README](../packages/tskb/README.md#documentation-guidelines):

- Focus on **what is where** with short descriptions
- Reference actual code locations using `typeof import()`
- Document **important relationships** between modules
- Avoid implementation details (those are in the code)
- Structured to help AI agents navigate the codebase

**Maintaining these docs:**

1. **When adding new features:** Declare modules/exports in relevant .tskb.tsx files
2. **When refactoring:** Update import paths in Module/Export declarations
3. **When changing architecture:** Update the relationships described in Doc sections
4. **Let TypeScript guide you:** If docs don't compile, references are broken

See [Documentation Guidelines](../packages/tskb/README.md#documentation-guidelines) for detailed best practices.

### TaskFlow Documentation

The `taskflow-app/` directory contains a complete example of documenting a fullstack application with tskb.

See [taskflow-app/README.md](taskflow-app/README.md) for details.

```bash
cd taskflow-app
npm run build        # Generate knowledge graph
npm run visualize    # Generate Graphviz diagram
```

## Resources

- **[tskb Package README](../packages/tskb/README.md)** - Installation, quick start, core concepts
- **[Documentation Guidelines](../packages/tskb/README.md#documentation-guidelines)** - How to write effective tskb docs
- **[CLI Reference](../packages/tskb/README.md#cli-reference)** - Command-line usage
