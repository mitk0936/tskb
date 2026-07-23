// @ts-check
import { fileURLToPath } from "url";
import path from "path";
import { baseConfig } from "../../eslint.base.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Downward-only layer imports (foundation → system → output → core → actions).
 * Each layer forbids importing from the layers above it; the load-bearing rule is
 * `output ✗ core`, which keeps the log/output model decoupled from the execution
 * tree (attribution is injected). See the design spec.
 */
const boundary = (dir, forbid, message) => ({
  files: [`src/${dir}/**/*.ts`],
  rules: { "no-restricted-imports": ["error", { patterns: [{ group: forbid, message }] }] },
});

export default [
  // _prev is the pre-swap implementation, kept as a fallback — not linted.
  { ignores: ["dist/**", "node_modules/**", "**/*.d.ts", "src/_prev/**"] },
  ...baseConfig({ tsconfigRootDir: __dirname }),

  boundary(
    "foundation",
    ["**/system/**", "**/output/**", "**/core/**", "**/actions/**"],
    "foundation is the base layer — it may not import any higher layer"
  ),
  boundary(
    "system",
    ["**/output/**", "**/core/**", "**/actions/**"],
    "system may only import foundation"
  ),
  boundary(
    "output",
    ["**/core/**", "**/actions/**"],
    "output must not import core (inject attribution) or actions"
  ),
  boundary("core", ["**/actions/**"], "core must not import actions"),
  boundary(
    "actions",
    ["**/output/**"],
    "actions build on core/system/foundation — not output directly"
  ),

  // The client SDK is the headless, UI-free engine — it must not reach into the CLI
  // frontends (commands, Ink app). Keeps it reusable by the future MCP server unchanged.
  boundary(
    "cli/client",
    ["**/cli/commands/**", "**/cli/ui/**"],
    "the client SDK is UI-free — it must not import CLI commands or the Ink app"
  ),

  // These own the real console (terminal writer / capture / live render); actions
  // emit via `console.*` by design, and the CLI/bin writes results to the terminal.
  // So `no-console` is expected.
  {
    files: [
      "src/core/ExecutionTree.ts",
      "src/core/action.ts",
      "src/output/console/ConsoleCapture.ts",
      "src/output/LiveRenderer.ts",
      "src/actions/**/*.ts",
      "src/cli/**/*.{ts,tsx}",
    ],
    rules: { "no-console": "off" },
  },
];
