import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    globalSetup: ["tests/e2e/global-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/tskb/src/**/*.ts"],
      exclude: ["packages/tskb/src/**/*.d.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
