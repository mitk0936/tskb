import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests are colocated with their package; e2e stays at the repo root
    // (shared fixture + global setup, exercising the tskb CLI end-to-end).
    include: ["packages/*/tests/**/*.test.{ts,tsx}", "tests/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    globalSetup: ["tests/e2e/global-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/*.d.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
