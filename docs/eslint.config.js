// @ts-check
import { fileURLToPath } from "url";
import path from "path";
import { baseConfig } from "../eslint.base.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: ["dist/**"],
  },
  ...baseConfig({ tsconfigRootDir: __dirname }),
  {
    // .tskb.tsx files are documentation — they use the tskb namespace DSL by design
    // and embed illustrative code snippets (including require(), any, etc.)
    files: ["**/*.tskb.tsx"],
    rules: {
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    // taskflow-app is a reference example — classes/types are defined for illustration,
    // not actually consumed, so unused-vars would be noisy and misleading here
    files: ["**/taskflow-app/**/*.tskb.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
