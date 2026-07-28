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

  // The client is the headless, UI-free engine layer. It sits above core (the om runtime's
  // interaction protocol) but below every frontend: it may import core and foundation, and it
  // must not reach up into the CLI (commands, Ink app, bin) nor sideways into the output writers
  // or the action batteries. Keeps it reusable by the future MCP server unchanged.
  boundary(
    "client",
    ["**/cli/**", "**/output/**", "**/actions/**"],
    "the client is the UI-free engine — it may import core and foundation, not the CLI, output, or actions"
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
