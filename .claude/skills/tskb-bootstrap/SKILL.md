---
name: tskb-bootstrap
description: "Initial tskb setup in a new or existing repo — install, scaffold docs folder, configure TypeScript, add AI integrations. Use when the developer wants to add tskb to their project for the first time."
allowed-tools: Bash(npx tskb init), Bash(npx --no -- tskb *), Read, Write, Edit
---

# TSKB — Bootstrap Initial Setup

## Purpose

Guide a developer through adding tskb to their repo for the first time — from install to first successful build.

## Step 1 — Ask orientation questions

Before doing anything, ask the user:

1. **Do you already have a `docs/` folder or preferred docs location?** (default: `docs/`)
2. **Are you in a monorepo?** If yes, should the docs folder live at the workspace root?
3. **Which AI assistant integrations do you want?**
   - Claude Code (`.claude/skills/`)
   - GitHub Copilot (`.github/instructions/`)
   - Both, or neither

Then run the interactive scaffolder:

```bash
npx tskb init
```

This will prompt for the same answers and scaffold everything in one step.

## Step 2 — What init creates

After running `tskb init`, check that the following exist:

```
your-repo/
├── docs/
│   ├── tsconfig.json          # TypeScript config for docs (jsxImportSource: "tskb")
│   └── architecture.tskb.tsx  # Starter doc — edit this first
├── package.json               # "docs" script added automatically
├── .claude/skills/            # Created if Claude Code was selected
└── .github/                   # Created if Copilot was selected
```

## Step 3 — Build the knowledge graph

```bash
npm run docs
```

This compiles all `.tskb.tsx` files, validates references, and writes:

- `.tskb/graph.json` — queryable knowledge graph
- `.tskb/graph.dot` — Graphviz visualization
- `.claude/skills/tskb/SKILL.md` — Claude Code skill (if `.claude/skills/` exists)
- `.github/instructions/tskb.instructions.md` — Copilot instructions (if `.github/` exists)

## Step 4 — Verify setup

```bash
npx tskb ls --plain       # Should show your folder structure
npx tskb docs --plain     # Should list your starter doc
```

If the build fails with a TypeScript error, check:
- `docs/tsconfig.json` has `"jsxImportSource": "tskb"`
- `baseUrl` and `rootDir` point to the repo root (e.g., `"../"`)
- Import paths in `.tskb.tsx` files end with `.js` (NodeNext module resolution)

## Common tsconfig for docs

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "tskb",
    "baseUrl": "../",
    "rootDir": "../"
  },
  "include": ["**/*.tskb.tsx"]
}
```

## Monorepo notes

- Place `docs/` at the workspace root
- Set `baseUrl` and `rootDir` to `"../"` from the docs folder (or adjust for your layout)
- Add `paths` entries for workspace packages if needed
- Run the build from the workspace root where `package.json` lives

## Next step — Start building the architecture map

Once the first build succeeds, begin iteratively documenting the codebase. Use the **tskb-update** skill for syntax, best practices, and when to trigger updates during a session.

### Recommended workflow

1. **Explore the project structure.** Look at top-level folders in `src/` (or equivalent). Identify the major areas: features, layers, shared utilities, configs.

2. **Mirror the project filesystem in `docs/`.** Create `.tskb.tsx` files that reflect the top-level structure:
   ```
   docs/
   ├── architecture.tskb.tsx     # Top-level overview (essential)
   ├── vocabulary.tskb.tsx        # Shared terms and externals
   ├── auth/
   │   └── auth.tskb.tsx          # Auth feature area
   ├── api/
   │   └── api.tskb.tsx           # API layer
   └── data/
       └── data.tskb.tsx          # Data layer
   ```

3. **Start top-down.** Declare top-level Folders first, then key Modules and Exports. Add Terms for domain concepts and Externals for dependencies (databases, APIs, npm packages).

4. **Ask the developer questions.** Don't guess — ask about:
   - What are the main feature areas?
   - Are there architectural layers (API → Service → Data)?
   - What external services or databases does the project depend on?
   - Are there naming conventions or patterns (repository pattern, service pattern)?
   - What constraints should be documented?

5. **Build incrementally.** After each round of additions, run `npm run docs` to validate. Fix any broken references before adding more.

6. **Use all registry primitives.** A well-documented project uses Folders (areas), Modules (key files), Exports (important APIs), Terms (domain vocabulary), Externals (dependencies), and Files (configs, specs).

7. **Set priorities deliberately.** Mark the top-level overview as `essential`. Add `constraint` docs for rules that must not be violated. Leave everything else as `supplementary`.

