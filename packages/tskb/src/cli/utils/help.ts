/**
 * Get CLI help text
 */
export function getHelpText(): string {
  return `Usage:
  tskb build <glob> [--tsconfig <path>] [--verbose]
  tskb ls [--depth <n>] [--verbose]
  tskb pick <identifier> [--verbose]
  tskb search <query> [--verbose]
  tskb context <identifier> [--depth <n>] [--verbose]
  tskb docs [<query>] [--verbose]

Examples:
  # Build command - typically run on pre-commit hooks, post-install scripts, or CI pipelines
  # Validates that .tskb.tsx docs match the actual codebase (folders, modules, exports)
  # Produces a queryable knowledge graph artifact for code assistants
  tskb build "src/**/*.tsx" --tsconfig ./tsconfig.json

  # Query commands - primarily used by code assistants to explore architecture
  tskb ls --depth 4                                       # List folders up to depth 4
  tskb ls --depth -1                                      # List all folders (unlimited depth)
  tskb pick "authentication.services"                     # Pick a folder by ID
  tskb pick "src/client"                                  # Pick a folder by path
  tskb pick "auth.AuthService"                            # Pick a module by ID
  tskb pick "jsxRuntime"                                  # Pick a term by ID
  tskb search "auth"                                      # Fuzzy search across entire graph
  tskb search "build command"                             # Multi-word search
  tskb context "tskb.cli"                                 # Get full context for an area (depth 1)
  tskb context "tskb.cli" --depth 2                       # Deeper traversal with docs
  tskb docs                                               # List all docs sorted by priority
  tskb docs "auth"                                        # Search docs by query`;
}

/**
 * Print help text and exit
 */
export function printHelpAndExit(): never {
  console.error(getHelpText());
  process.exit(1);
}
