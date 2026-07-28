import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeSplitGraph } from "../../src/core/graph/writer.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tempDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-writer-"));
  dirs.push(d);
  return d;
}

const emptyGraph = {
  metadata: { projectName: "t", generatedAt: "now" },
  nodes: {
    folders: [],
    modules: [],
    exports: [],
    terms: [],
    files: [],
    externals: [],
    flows: [],
    docs: [],
  },
  edges: [],
} as never;

describe("writeSplitGraph", () => {
  it("writes meta.json last (newest mtime of all graph files)", () => {
    const out = tempDir();
    const graphDir = writeSplitGraph(emptyGraph, out);
    const files = fs.readdirSync(graphDir).filter((f) => f.endsWith(".json"));
    const metaMtime = fs.statSync(path.join(graphDir, "meta.json")).mtimeMs;
    for (const f of files) {
      expect(fs.statSync(path.join(graphDir, f)).mtimeMs).toBeLessThanOrEqual(metaMtime);
    }
  });

  it("leaves no .tmp files behind", () => {
    const out = tempDir();
    const graphDir = writeSplitGraph(emptyGraph, out);
    expect(fs.readdirSync(graphDir).some((f) => f.endsWith(".tmp"))).toBe(false);
  });
});
