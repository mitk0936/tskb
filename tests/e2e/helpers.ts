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
export const GRAPH_DIR = path.join(FIXTURE_DIR, ".tskb", "graph");
/** Kept for build-existence checks — points to the meta file in the split graph dir. */
export const GRAPH_PATH = path.join(GRAPH_DIR, "meta.json");

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

/** Read and reconstruct the KnowledgeGraph from the split .tskb/graph/ files. */
export function loadGraph() {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(GRAPH_DIR, name), "utf-8"));
  return {
    metadata: read("meta.json"),
    nodes: {
      folders: read("folders.json"),
      modules: read("modules.json"),
      exports: read("exports.json"),
      terms: read("terms.json"),
      files: read("files.json"),
      externals: read("externals.json"),
      flows: read("flows.json"),
      docs: read("docs.json"),
    },
    edges: read("edges.json"),
  };
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
