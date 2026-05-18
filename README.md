# tskb - TypeScript Knowledge Base

A TypeScript-based system for documenting software architecture using TSX syntax. Write architectural documentation as code with type-safe, structured components.

## For Ai Assistants

Read this before querying the codebase: [AGENTS.md](./.tskb/AGENTS.md)

## Workspace Structure

This monorepo contains:

### `packages/tskb/`

Core tskb package that provides:

- CLI tool for building documentation graphs
- JSX runtime for documentation components
- TypeScript program analysis and extraction
- Graph visualization tools

### `docs/`

Documentation of the repo containing:

- Documentation for the tskb package itself, demonstrating how to document CLI tools, core functionality, and runtime systems.

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
3. Build the existing repo docs

### Available Scripts

```bash
# Clean all build outputs and dependencies
npm run clean

# Build all workspace packages
npm run build

# Build tskb docs (meta documentation of the repo)
npm run build:docs

# Format all code with Prettier
npm run format

# Check code formatting
npm run format:check
```

This creates a knowledge graph and visualization in the `dist/` folder.

## Project Structure

```
tskb/
├── packages/
│   └── tskb/              # Core package
├── docs/                  # Repo documentation (tskb)
└── package.json           # Workspace root
```

## Development

The workspace uses npm workspaces for monorepo management

## License

MIT
