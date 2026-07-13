import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { SpinHost } from "../../src/orchestration/spin/SpinHost.js";
import { action } from "../../src/orchestration/action/action.js";

// RunFolder derives its `logs/<name>/…` folder from the entry-script basename
// (process.argv[1]). Under Vitest every parallel worker shares the basename
// "forks", so separate test files would all write into the same second-stamped run
// folder and delete each other's files mid-run. Stub the name to one dedicated to
// this file, and clean up only that subtree — isolating this file's runs entirely.
const LOGS_NAME = "spin-assertions-test";
let savedArgv1: string;
beforeAll(() => {
  savedArgv1 = process.argv[1];
  process.argv[1] = LOGS_NAME;
});
afterAll(() => {
  process.argv[1] = savedArgv1;
  fs.rmSync(`logs/${LOGS_NAME}`, { recursive: true, force: true });
});

describe("SpinHost assertions", () => {
  it("a passing assertion leaves the verdict ok", async () => {
    const a = action("Check").run((ctx) => {
      ctx.assert(true, "all good");
    });
    const host = new SpinHost(a());
    const result = await host.done;
    expect(result.ok).toBe(true);
  });

  it("a failing assertion fails the verdict but the spin still completes", async () => {
    const a = action("Check").run((ctx) => {
      ctx.assert(true, "first"); // passes
      ctx.assert(false, "second"); // fails
      ctx.assert(false, "third"); // fails too — run does not stop
    });
    const host = new SpinHost(a());
    const result = await host.done;

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(host.state).toBe("closed");

    const asserts = host.logs.snapshot().filter((e) => e.level === "assert");
    expect(asserts).toHaveLength(3);
  });

  it("attributes a nodded child's assertion to the parent › child path", async () => {
    const child = action("Child").run((ctx) => {
      ctx.assert(false, "deep check");
    });
    const parent = action("Parent").run((ctx) => {
      ctx.nod(child());
    });
    const host = new SpinHost(parent());
    await host.done;

    expect(host.logs.snapshot()).toContainEqual(
      expect.objectContaining({
        source: "assert",
        level: "assert",
        message: "Parent › Child · ✗ deep check",
      })
    );
  });

  it("writes every assertion to a dedicated assertions.log (also in main run.log)", async () => {
    const a = action("Check").run((ctx) => {
      ctx.assert(true, "passing one");
      ctx.assert(false, "failing one");
    });
    const host = new SpinHost(a());
    await host.done;

    const dir = host.output.folder.path();
    const assertionsFile = `${dir}/assertions.log`;
    expect(fs.existsSync(assertionsFile)).toBe(true);

    // The finalize step links this file — the getter that drives it is set.
    expect(host.output.runLog.assertionsLog).toBeTruthy();
    expect(fs.existsSync(host.output.runLog.assertionsLog!)).toBe(true);

    const assertions = fs.readFileSync(assertionsFile, "utf8");
    expect(assertions).toContain("⊨ Check · ✓ passing one");
    expect(assertions).toContain("⊨ Check · ✗ failing one");

    // Still present in the main human log.
    const runLog = fs.readFileSync(`${dir}/run.log`, "utf8");
    expect(runLog).toContain("⊨ Check · ✗ failing one");

    // The run.log footer bubbles the tally + the assertions.log link (1 pass, 1 fail).
    expect(runLog).toContain("⊨ assertions · 1 passed · 1 failed");
    expect(runLog).toContain("⊨ assertions → ");
    expect(runLog).toContain("assertions.log");
  });

  it("does not create assertions.log for a run with no assertions", async () => {
    // RunFolder names carry only second-granularity timestamps (no per-instance
    // disambiguator), so a host built in the same wall-clock second as the previous
    // test would land in that same run folder — whose assertions.log (already
    // created there by the *other* run) would still exist on disk regardless of
    // this run's own assertion-free stream. Wait for the clock to tick over so this
    // host gets its own, untouched folder.
    const before = new Date().getSeconds();
    while (new Date().getSeconds() === before) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const a = action("Quiet").run(() => {});
    const host = new SpinHost(a());
    await host.done;

    expect(fs.existsSync(`${host.output.folder.path()}/assertions.log`)).toBe(false);
    expect(host.output.runLog.assertionsLog).toBeUndefined();
  });
});
