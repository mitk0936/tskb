/**
 * Tests for the live `tskb explore` server: the /version endpoint, the served
 * meta chunk's mode/version, and that a graph rebuild bumps /version.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FIXTURE_DIR, TSKB_BIN, GRAPH_DIR } from "./helpers.js";

const PORT = 4477;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!(await fn().catch(() => false))) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  server = spawn("node", [TSKB_BIN, "explore", "--port", String(PORT), "--no-open"], {
    cwd: FIXTURE_DIR,
    stdio: "ignore",
  });
  await waitFor(async () => (await fetch(`${BASE}/version`)).ok);
});

afterAll(() => {
  server?.kill();
});

describe("explorer serve", () => {
  it("serves /version as a number", async () => {
    const data = await (await fetch(`${BASE}/version`)).json();
    expect(typeof data.version).toBe("number");
  });

  it("stamps the served meta chunk with mode 'served' and a version", async () => {
    const meta = await (await fetch(`${BASE}/chunks/meta.json`)).json();
    expect(meta.mode).toBe("served");
    expect(typeof meta.version).toBe("number");
  });

  it("bumps /version after a rebuild that recreates the graph dir", async () => {
    const before = (await (await fetch(`${BASE}/version`)).json()).version as number;

    // Faithfully simulate what `tskb build` does: rm -rf the whole graph dir and
    // recreate it (a NEW directory inode), writing meta.json last. A directory
    // fs.watch handle bound to the old inode goes dead here — only mtime polling
    // survives this.
    const files = fs.readdirSync(GRAPH_DIR);
    const snapshot = new Map(files.map((f) => [f, fs.readFileSync(path.join(GRAPH_DIR, f))]));
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(GRAPH_DIR, { recursive: true, force: true });
    fs.mkdirSync(GRAPH_DIR, { recursive: true });
    for (const [f, c] of snapshot) {
      if (f !== "meta.json") fs.writeFileSync(path.join(GRAPH_DIR, f), c);
    }
    fs.writeFileSync(path.join(GRAPH_DIR, "meta.json"), snapshot.get("meta.json")!);

    await waitFor(async () => {
      const v = (await (await fetch(`${BASE}/version`)).json()).version as number;
      return v !== before;
    });

    const after = (await (await fetch(`${BASE}/version`)).json()).version as number;
    expect(after).not.toBe(before);
  });
});
