import fs from "node:fs";

/**
 * Get the AGENTS.md template.
 * This file is written for AI agents, not humans.
 * Keep it short, procedural, and enforce behavior.
 */
function getAgentsTemplate(): string {
  return `# AGENTS.md

## CRITICAL: Structure-First Analysis

This codebase uses **TSKB** - a semantic map of the repository's architecture.

### Before ANY code changes or deep file inspection:

1. **Map the territory** - Understand what exists and where
   \`\`\`bash
   npx tskb ls --depth=4
   \`\`\`
   Returns folder hierarchy with architectural descriptions (not file listings)

2. **Locate precisely** - Find where concepts/keywords live in the structure
   \`\`\`bash
   npx tskb search "<query>"
   \`\`\`
   Fuzzy search across the entire graph — returns ranked results matching IDs, descriptions, and paths

3. **Understand context** - Get the architectural intent of relevant areas
   \`\`\`bash
   npx tskb pick "<identifier>"
   \`\`\`
   Accepts any node ID (folder, module, export, term, doc) or a filesystem path. Returns type-specific data for the matched node.

4. **Explore beyond the map** - TSKB documents architectural intent, not every detail                                                              
   - When the graph doesn't cover what you need, use your own tools (Glob, Grep, Read) to explore                                                  
   - Implementation details, edge cases, and lower-level code may not be documented                                                                
   - Use TSKB to orient yourself first, then dive into source code for the full picture
   - if you can think of a case that is not specified, feel free to explore

### Why this matters

**Pattern matching breaks down in large codebases.**
- Glob returns thousands of files (tests, configs, generated code, examples)
- Grep finds implementations but misses architectural context
- You read the right files in the wrong order, missing key constraints

**TSKB is faster because:**
- No noise: Only architecturally significant nodes, not every file
- Context first: Understand design decisions before reading implementation
- Precise targeting: Find the 3 relevant files instead of scanning 50 matches

### Decision Framework

**WRONG**: See a feature request → Grep for keywords → Read files → Make localized change

**RIGHT**: See a feature request → \`tskb ls\` (where does this belong?) → \`tskb pick\` (what's the design?) → \`tskb select\` (existing patterns?) → Read specific files → Make architecturally coherent change

### Enforcement

- If you find yourself using Glob/Grep without first consulting TSKB, **stop**
- If a change affects multiple areas, verify with \`tskb ls\` that you understand all impact zones
- If architectural intent is unclear from TSKB, the \`.tskb.tsx\` config likely needs updating

### Updating TSKB docs

Update documentation when:
- New folders, packages, or major modules are added
- Responsibilities or boundaries change
- New core concepts are introduced

Do **not** document minor implementation details.

### Note

TSKB is not a replacement for source code. It's a map that tells you WHERE to look and WHY it's designed that way. Then use Read/Grep to understand HOW it works.

**Don't skip the map because you think pattern matching is faster. It's not. Use TSKB first.**
`;
}

/**
 * Generate AGENTS.md file
 */
export function generateAgentsFile(outputPath: string): void {
  const content = getAgentsTemplate();
  fs.writeFileSync(outputPath, content, "utf-8");
}
