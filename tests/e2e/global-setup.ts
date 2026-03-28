/**
 * Global setup for E2E tests.
 *
 * Builds the fixture graph once before any test file runs.
 * Cleans up the .tskb output directory on teardown.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "fixture");
const TSKB_BIN = path.resolve(import.meta.dirname, "../../packages/tskb/dist/cli/index.js");

export function setup() {
  const tskbOut = path.join(FIXTURE_DIR, ".tskb");
  if (fs.existsSync(tskbOut)) {
    fs.rmSync(tskbOut, { recursive: true });
  }

  execFileSync(
    "node",
    [TSKB_BIN, "build", "docs/**/*.tskb.tsx", "--tsconfig", "docs/tsconfig.json"],
    { cwd: FIXTURE_DIR, encoding: "utf-8", timeout: 30_000 }
  );
}

export function teardown() {
  const tskbOut = path.join(FIXTURE_DIR, ".tskb");
  if (fs.existsSync(tskbOut)) {
    fs.rmSync(tskbOut, { recursive: true });
  }
}
