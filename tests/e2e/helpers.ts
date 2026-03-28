/**
 * Shared test helpers for tskb E2E tests.
 *
 * Provides CLI runners, paths, and a one-time graph build function.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export const FIXTURE_DIR = path.resolve(import.meta.dirname, "fixture");
export const TSKB_BIN = path.resolve(import.meta.dirname, "../../packages/tskb/dist/cli/index.js");
export const GRAPH_PATH = path.join(FIXTURE_DIR, ".tskb", "graph.json");

/** Run the tskb CLI in a given directory. */
export function tskbIn(cwd: string, ...args: string[]): string {
  return execFileSync("node", [TSKB_BIN, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
  });
}

/** Run the tskb CLI in the fixture directory. */
export function tskb(...args: string[]): string {
  return tskbIn(FIXTURE_DIR, ...args);
}

/** Read and parse the built graph.json from the fixture. */
export function loadGraph() {
  return JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
}

/** Recursively copy a directory. */
export function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
