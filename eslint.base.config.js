// @ts-check
import tseslint from "typescript-eslint";

/**
 * Shared base ESLint config. Import and spread into your package's eslint.config.js.
 *
 * @param {Object} opts
 * @param {string} opts.tsconfigRootDir - Absolute path to the directory containing tsconfig.json
 * @param {string[]} [opts.project] - tsconfig paths for typed rules (relative to tsconfigRootDir)
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function baseConfig({ tsconfigRootDir, project = ["./tsconfig.json"] }) {
  return tseslint.config({
    extends: [...tseslint.configs.recommended],
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        tsconfigRootDir,
        project,
      },
    },
    rules: {
      // -- Safety --
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // -- Imports --
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],

      // -- Complexity --
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],

      // -- Style --
      "no-console": "warn",
      eqeqeq: ["error", "always"],
    },
  });
}
