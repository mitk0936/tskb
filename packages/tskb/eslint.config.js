// @ts-check
import { fileURLToPath } from "url";
import path from "path";
import { baseConfig } from "../../eslint.base.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts", "explorer-app/vite.config.ts"],
  },
  // src/ — Node.js library and CLI
  ...baseConfig({ tsconfigRootDir: __dirname }),
  {
    files: ["src/cli/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // explorer-app/ — browser SPA, own tsconfig
  ...baseConfig({
    tsconfigRootDir: path.join(__dirname, "explorer-app"),
    project: ["./tsconfig.json"],
  }).map((cfg) => ({ ...cfg, files: (cfg.files ?? ["**/*.ts"]).map((f) => `explorer-app/${f}`) })),
  {
    files: ["explorer-app/src/**/*.ts"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        CustomEvent: "readonly",
        HTMLElement: "readonly",
        SVGElement: "readonly",
        Element: "readonly",
        Event: "readonly",
      },
    },
    rules: {
      "no-console": "warn",
    },
  },
];
