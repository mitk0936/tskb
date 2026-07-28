import { afterEach, describe, expect, test } from "vitest";
import { ProcRegistry, type ProcInfo } from "../../src/system/procRegistry.ts";

// A controllable snapshot: tests mutate `procs`, the registry reads it.
let procs: ProcInfo[] = [];
const snapshot = (): ProcInfo[] => procs;

const make = () => {
  const killed: number[] = [];
  const reg = new ProcRegistry(snapshot, (pid) => killed.push(pid), 10_000_000);
  return { reg, killed };
};

afterEach(() => {
  procs = [];
});

describe("ProcRegistry", () => {
  test("poll records every descendant of a tracked root (multi-level), not the root itself", () => {
    const { reg, killed } = make();
    procs = [
      { pid: 100, ppid: 1, id: "shell" }, // root omkit spawned
      { pid: 200, ppid: 100, id: "npm" },
      { pid: 300, ppid: 200, id: "vite" },
    ];
    reg.track(100);
    reg.poll();
    reg.sweep(); // same snapshot → both descendants still alive & matching
    expect(killed.sort((a, b) => a - b)).toEqual([200, 300]);
  });

  test("a descendant that later orphans (re-parented after its intermediate dies) is still killed", () => {
    const { reg, killed } = make();
    procs = [
      { pid: 100, ppid: 1, id: "shell" },
      { pid: 200, ppid: 100, id: "npm" },
      { pid: 300, ppid: 200, id: "vite" },
    ];
    reg.track(100);
    reg.poll(); // records 200, 300 while the tree is intact
    // Ctrl+C: npm (200) dies, vite (300) re-parents to 1 — no longer a descendant of 100
    procs = [
      { pid: 100, ppid: 1, id: "shell" },
      { pid: 300, ppid: 1, id: "vite" },
    ];
    reg.sweep();
    expect(killed).toEqual([300]); // orphan captured; 200 gone
  });

  test("sweep skips a reused pid (identity no longer matches)", () => {
    const { reg, killed } = make();
    procs = [
      { pid: 100, ppid: 1, id: "shell" },
      { pid: 300, ppid: 100, id: "vite" },
    ];
    reg.track(100);
    reg.poll(); // records 300 → "vite"
    // 300 died and the pid was reused by an unrelated process (different identity)
    procs = [{ pid: 300, ppid: 5, id: "someone-else" }];
    reg.sweep();
    expect(killed).toEqual([]);
  });

  test("sweep skips a descendant that is simply gone", () => {
    const { reg, killed } = make();
    procs = [
      { pid: 100, ppid: 1, id: "shell" },
      { pid: 300, ppid: 100, id: "vite" },
    ];
    reg.track(100);
    reg.poll();
    procs = [{ pid: 100, ppid: 1, id: "shell" }]; // 300 exited cleanly
    reg.sweep();
    expect(killed).toEqual([]);
  });

  test("after untrack, new descendants of that root are no longer accumulated (already-known stay)", () => {
    const { reg, killed } = make();
    procs = [
      { pid: 100, ppid: 1, id: "shell" },
      { pid: 200, ppid: 100, id: "npm" },
    ];
    reg.track(100);
    reg.poll(); // records 200
    reg.untrack(100);
    procs = [
      { pid: 100, ppid: 1, id: "shell" },
      { pid: 200, ppid: 100, id: "npm" },
      { pid: 300, ppid: 200, id: "vite" }, // appears after untrack
    ];
    reg.poll(); // root untracked → 300 not recorded
    reg.sweep();
    expect(killed).toEqual([200]);
  });

  test("with nothing known, sweep is a no-op and never reads the snapshot", () => {
    let read = false;
    const reg = new ProcRegistry(
      () => {
        read = true;
        return [];
      },
      () => {},
      10_000_000
    );
    reg.sweep();
    expect(read).toBe(false);
  });

  test("track auto-polls on its interval", async () => {
    const killed: number[] = [];
    procs = [
      { pid: 100, ppid: 1, id: "shell" },
      { pid: 300, ppid: 100, id: "vite" },
    ];
    const reg = new ProcRegistry(snapshot, (pid) => killed.push(pid), 5);
    reg.track(100);
    await new Promise((r) => setTimeout(r, 20)); // let at least one tick fire
    procs = []; // everything gone but 300 was recorded live
    procs = [{ pid: 300, ppid: 1, id: "vite" }]; // 300 orphaned
    reg.sweep();
    expect(killed).toEqual([300]);
  });
});
