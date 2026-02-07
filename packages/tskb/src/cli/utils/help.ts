import { REPO_ROOT_FOLDER_NAME } from "../../core/constants.js";

/**
 * Get CLI help text
 */
export function getHelpText(): string {
  return `Usage:
  tskb build <glob> [--tsconfig <path>]
  tskb select <search-term> <folder-id> [--verbose]
  tskb describe <folder-id>
  tskb ls [--depth <n>]

Examples:
  # Build command - typically run on pre-commit hooks, post-install scripts, or CI pipelines
  # Validates that .tskb.tsx docs match the actual codebase (folders, modules, exports)
  # Produces a queryable knowledge graph artifact for code assistants
  tskb build "src/**/*.tsx" --tsconfig ./tsconfig.json

  # Query commands - primarily used by code assistants to explore architecture
  tskb select "auth" "authentication.services"            # Scoped select (concise)
  tskb select "auth" "${REPO_ROOT_FOLDER_NAME}" --verbose # Full context, repo-wide search
  tskb describe "authentication.services"                 # Describe a specific folder
  tskb describe "${REPO_ROOT_FOLDER_NAME}"                # Describe the repository root
  tskb ls                                                 # List all folders (depth=1)
  tskb ls --depth 2                                       # List folders up to depth 2
  tskb ls --depth -1                                      # List all folders (unlimited depth)`;
}

/**
 * Print help text and exit
 */
export function printHelpAndExit(): never {
  console.error(getHelpText());
  process.exit(1);
}
