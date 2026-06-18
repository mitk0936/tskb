/**
 * Tests for the live `tskb explore` server: the /version endpoint, the served
 * meta chunk's mode/version, and that a graph rebuild bumps /version.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FIXTURE_DIR, TSKB_BIN, copyDir } from "./helpers.js";

const PORT = 4477;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;
/** Isolated working dir holding this suite's own copy of the fixture graph. */
let workDir: string;
let graphDir: string;

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!(await fn().catch(() => false))) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  // This suite destructively rebuilds the graph dir (see the /version test), so
  // it runs against its own copy in a temp working dir rather than the shared
  // FIXTURE_DIR/.tskb. Mutating the shared graph would race with the other e2e
  // files — which read it in parallel workers — and intermittently fail them
  // with "Graph files not found".
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-serve-"));
  copyDir(path.join(FIXTURE_DIR, ".tskb"), path.join(workDir, ".tskb"));
  graphDir = path.join(workDir, ".tskb", "graph");

  server = spawn("node", [TSKB_BIN, "explore", "--port", String(PORT), "--no-open"], {
    cwd: workDir,
    stdio: "ignore",
  });
  await waitFor(async () => (await fetch(`${BASE}/version`)).ok);
});

afterAll(async () => {
  // Wait for the server to actually exit before deleting workDir: on Windows the
  // OS won't remove a directory that's still a live process's cwd (EPERM), and
  // kill() only signals. maxRetries rides out any lingering watcher file locks.
  if (server) {
    await new Promise<void>((resolve) => {
      server.once("exit", () => resolve());
      server.kill();
    });
  }
  if (workDir && fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
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
    const files = fs.readdirSync(graphDir);
    const snapshot = new Map(files.map((f) => [f, fs.readFileSync(path.join(graphDir, f))]));
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(graphDir, { recursive: true, force: true });
    fs.mkdirSync(graphDir, { recursive: true });
    for (const [f, c] of snapshot) {
      if (f !== "meta.json") fs.writeFileSync(path.join(graphDir, f), c);
    }
    fs.writeFileSync(path.join(graphDir, "meta.json"), snapshot.get("meta.json")!);

    await waitFor(async () => {
      const v = (await (await fetch(`${BASE}/version`)).json()).version as number;
      return v !== before;
    });

    const after = (await (await fetch(`${BASE}/version`)).json()).version as number;
    expect(after).not.toBe(before);
  });
});
