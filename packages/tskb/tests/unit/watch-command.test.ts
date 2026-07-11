import { describe, it, expect, vi } from "vitest";
import { watch } from "../../src/cli/commands/watch.js";
import type { ExtractConfig } from "../../src/cli/commands/build.js";

const config: ExtractConfig = {
  pattern: "docs/**/*.tskb.tsx",
  tsconfig: "tsconfig.json",
  projectName: "Test",
};

/** A promise whose resolve is exposed, so the test controls when a build finishes. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("watch run loop", () => {
  it("runs an initial build and starts watching the glob + extra paths", async () => {
    const runBuild = vi.fn().mockResolvedValue(undefined);
    let watched: string[] = [];
    const fakeWatch = vi.fn((paths: string[]) => {
      watched = paths;
      return { close: () => {} };
    });

    await watch(config, ["./src", "./packages/foo"], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
    });

    expect(runBuild).toHaveBeenCalledTimes(1);
    expect(fakeWatch).toHaveBeenCalledTimes(1);
    expect(watched).toEqual(["docs", "./src", "./packages/foo"]);
  });

  it("rebuilds on a change event", async () => {
    const runBuild = vi.fn().mockResolvedValue(undefined);
    // `watch.ts` passes the run-loop `rebuild` (returns a Promise) as the
    // watcher callback. The param is typed `() => void`, but at runtime it
    // returns the rebuild promise, so awaiting `onChange()` waits for the
    // full rebuild. That makes these tests deterministic — no timer guessing.
    let onChange: () => void = () => {};
    const fakeWatch = vi.fn((_paths: string[], cb: () => void) => {
      onChange = cb;
      return { close: () => {} };
    });

    await watch(config, [], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
    });
    expect(runBuild).toHaveBeenCalledTimes(1); // initial

    await onChange();
    expect(runBuild).toHaveBeenCalledTimes(2);
  });

  it("coalesces changes that arrive while a build is in flight", async () => {
    const first = deferred();
    const runBuild = vi
      .fn()
      .mockReturnValueOnce(Promise.resolve()) // initial build
      .mockReturnValueOnce(first.promise) // in-flight build
      .mockResolvedValue(undefined); // coalesced follow-up
    let onChange: () => void = () => {};
    const fakeWatch = vi.fn((_p: string[], cb: () => void) => {
      onChange = cb;
      return { close: () => {} };
    });

    await watch(config, [], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
      settleMs: 0, // no inter-rebuild delay — keep coalescing timing deterministic
    });
    expect(runBuild).toHaveBeenCalledTimes(1); // initial done

    const p2 = onChange(); // starts build #2 (the rebuild loop, stays pending)
    onChange(); // arrives during build #2 → sets dirty
    onChange(); // also during build #2 → stays one follow-up

    first.resolve(); // build #2 completes → exactly one follow-up build runs
    await p2; // the rebuild loop runs the single coalesced follow-up, then resolves

    expect(runBuild).toHaveBeenCalledTimes(3); // initial + #2 + one coalesced follow-up
  });

  it("waits settleMs between a build and its coalesced follow-up", async () => {
    const first = deferred();
    const runBuild = vi
      .fn()
      .mockReturnValueOnce(Promise.resolve()) // initial build
      .mockReturnValueOnce(first.promise) // in-flight build
      .mockResolvedValue(undefined); // coalesced follow-up
    let onChange: () => void = () => {};
    const fakeWatch = vi.fn((_p: string[], cb: () => void) => {
      onChange = cb;
      return { close: () => {} };
    });

    await watch(config, [], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
      settleMs: 100,
    });

    const p2 = onChange(); // starts build #2
    onChange(); // arrives during build #2 → sets dirty

    first.resolve(); // build #2 completes → follow-up should wait settleMs (100ms)
    await new Promise((r) => setTimeout(r, 20)); // still inside the settle window
    expect(runBuild).toHaveBeenCalledTimes(2); // follow-up not started yet

    await p2; // settle window elapses, the single follow-up runs
    expect(runBuild).toHaveBeenCalledTimes(3);
  });

  it("keeps running when a build throws", async () => {
    const runBuild = vi
      .fn()
      .mockResolvedValueOnce(undefined) // initial ok
      .mockRejectedValueOnce(new Error("boom")) // change #1 fails
      .mockResolvedValue(undefined); // change #2 ok
    let onChange: () => void = () => {};
    const fakeWatch = vi.fn((_p: string[], cb: () => void) => {
      onChange = cb;
      return { close: () => {} };
    });

    await watch(config, [], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
    });

    await onChange(); // build throws internally, is caught, must not reject
    await onChange(); // loop still responds
    expect(runBuild).toHaveBeenCalledTimes(3);
  });
});
