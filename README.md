# tskb - Task Knowledge Base

A TypeScript-based system for documenting software architecture using TSX syntax. Write architectural documentation as code with type-safe, structured components.

## Workspace Structure

This monorepo contains:

### `packages/tskb/`

Core tskb package that provides:

- CLI tool for building documentation graphs
- JSX runtime for documentation components
- TypeScript program analysis and extraction
- Graph visualization tools

### `examples/taskflow-app/`

Demonstration boilerplate showing a full-stack task management application. This is **not meant to be built or run** - it exists purely as a reference for documentation purposes.

### `docs/taskflow/`

Real-world documentation examples using tskb to document the TaskFlow app architecture, including ADRs, constraints, and system design.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

```bash
npm install
```

This will automatically:

1. Install all dependencies across workspaces
2. Build the tskb package
3. Build example projects

### Available Scripts

```bash
# Clean all build outputs and dependencies
npm run clean

# Build all workspace packages
npm run build:all

# Format all code with Prettier
npm run format

# Check code formatting
npm run format:check
```

### Working with Documentation

Navigate to `docs/taskflow/` to see example documentation:

```bash
cd docs/taskflow
npm run generate
```

This creates a knowledge graph and visualization in the `dist/` folder.

## Project Structure

```
tskb/
├── packages/
│   └── tskb/              # Core package
├── examples/
│   └── taskflow-app/      # Demo application (reference only)
├── docs/
│   └── taskflow/          # Documentation examples
└── package.json           # Workspace root
```

## Development

The workspace uses npm workspaces for monorepo management. The build order ensures `packages/tskb` is built first, as other packages depend on it.

## License

ISC
