import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watchPaths } from "../../packages/tskb/src/cli/utils/watcher.js";

/** Poll until `predicate()` is true or timeout elapses. */
async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("watchPaths", () => {
  const handles: Array<{ close(): void }> = [];
  const dirs: string[] = [];

  afterEach(() => {
    for (const h of handles.splice(0)) h.close();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function tempDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-watch-"));
    dirs.push(d);
    return d;
  }

  it("fires onChange once for a burst of writes (debounced)", async () => {
    const dir = tempDir();
    let calls = 0;
    handles.push(watchPaths([dir], () => calls++, { debounceMs: 50 }));

    const file = path.join(dir, "a.txt");
    for (let i = 0; i < 5; i++) fs.writeFileSync(file, `v${i}`);

    await waitFor(() => calls >= 1);
    // Allow any late events to settle within a couple debounce windows.
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(1);
  });

  it("passes the changed file path to onChange", async () => {
    const dir = tempDir();
    let changed: string | undefined;
    handles.push(
      watchPaths(
        [dir],
        (c) => {
          changed = c;
        },
        { debounceMs: 50 }
      )
    );

    fs.writeFileSync(path.join(dir, "note.txt"), "hi");

    await waitFor(() => changed !== undefined);
    expect(changed).toContain("note.txt");
  });

  it("fires again for a separate later change", async () => {
    const dir = tempDir();
    let calls = 0;
    handles.push(watchPaths([dir], () => calls++, { debounceMs: 50 }));

    fs.writeFileSync(path.join(dir, "a.txt"), "1");
    await waitFor(() => calls === 1);

    fs.writeFileSync(path.join(dir, "b.txt"), "2");
    await waitFor(() => calls === 2);
    expect(calls).toBe(2);
  });

  it("stops firing after close()", async () => {
    const dir = tempDir();
    let calls = 0;
    const handle = watchPaths([dir], () => calls++, { debounceMs: 50 });

    fs.writeFileSync(path.join(dir, "a.txt"), "1");
    await waitFor(() => calls === 1);

    handle.close();
    fs.writeFileSync(path.join(dir, "a.txt"), "2");
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(1);
  });
});
