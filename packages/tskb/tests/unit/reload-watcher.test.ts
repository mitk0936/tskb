import { describe, it, expect, afterEach } from "vitest";
import { startReloadWatcher } from "../../explorer-app/src/ui/ReloadWatcher.js";

const stops: Array<() => void> = [];
afterEach(() => {
  for (const s of stops.splice(0)) s();
});

async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("startReloadWatcher", () => {
  it("does not poll when mode is not 'served'", async () => {
    let calls = 0;
    const handle = startReloadWatcher({
      mode: "static",
      baseline: 1,
      onUpdate: () => {},
      intervalMs: 10,
      fetchVersion: async () => {
        calls++;
        return 2;
      },
    });
    stops.push(handle.stop);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(0);
  });

  it("fires onUpdate once when the version changes", async () => {
    let updates = 0;
    let current = 1;
    const handle = startReloadWatcher({
      mode: "served",
      baseline: 1,
      onUpdate: () => updates++,
      intervalMs: 10,
      fetchVersion: async () => current,
    });
    stops.push(handle.stop);

    await new Promise((r) => setTimeout(r, 50));
    expect(updates).toBe(0); // unchanged

    current = 2;
    await waitFor(() => updates === 1);

    // Baseline advanced — no repeated nagging for the same version.
    await new Promise((r) => setTimeout(r, 50));
    expect(updates).toBe(1);
  });

  it("ignores fetch errors and keeps polling", async () => {
    let updates = 0;
    let mode: "throw" | number = "throw";
    const handle = startReloadWatcher({
      mode: "served",
      baseline: 1,
      onUpdate: () => updates++,
      intervalMs: 10,
      fetchVersion: async () => {
        if (mode === "throw") throw new Error("network");
        return mode;
      },
    });
    stops.push(handle.stop);

    await new Promise((r) => setTimeout(r, 50));
    mode = 3;
    await waitFor(() => updates === 1);
    expect(updates).toBe(1);
  });
});
