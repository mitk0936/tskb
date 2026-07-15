import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { action, om } from "../../src/index.ts";
import { command } from "../../src/actions/command.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("call-to-run model", () => {
  test("calling an action launches it and returns the live activity", async () => {
    let got: number | undefined;
    await om("call-to-run", async () => {
      const r = await action("add").run(async (_c, a: number, b: number) => a + b)(2, 3).result;
      got = r.ok ? r.value : undefined;
    });
    expect(got).toBe(5);
  });

  test("a tag chained on the returned handle (before the first await) is applied", async () => {
    await om("call-to-run", async () => {
      const h = action("probe").run(async () => 1)();
      h.tag("chained"); // cross-statement, still before the commit microtask
      await h.result;
    });
    const node = ExecutionTree.last!.root.children.find((c) => c.name === "probe");
    expect(node?.tags).toContain("chained");
  });

  test("withCache after the first await throws (the config window has closed)", async () => {
    await om("call-to-run", async () => {
      const h = action("x").run(async () => 1)();
      await Promise.resolve(); // the commit microtask runs here — the body has started
      expect(() => h.withCache(process.cwd())).toThrow(/already launched/);
      await h.result;
    });
    expect(process.exitCode).toBe(0);
  });
});

describe("withCache on the handle", () => {
  test("an unchanged input skips the body on the next run (resolves undefined)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "omkit-cache-"));
    writeFileSync(path.join(dir, "in.txt"), "hello");
    let runs = 0;
    const build = action("build").run(async () => {
      runs++;
      return "built";
    });

    // First run: cache miss → body runs and records the fingerprint.
    let r1: unknown;
    await om("call-to-run", async () => {
      r1 = await build().withCache(dir).result;
    });
    expect(runs).toBe(1);
    expect(r1).toEqual({ ok: true, value: "built" });

    // Second run: inputs unchanged → cache hit → body skipped, resolves undefined.
    let r2: unknown;
    await om("call-to-run", async () => {
      r2 = await build().withCache(dir).result;
    });
    expect(runs).toBe(1); // not re-run
    expect(r2).toEqual({ ok: true, value: undefined });

    rmSync(dir, { recursive: true, force: true });
  });

  test("withCache applied cross-statement (still pre-body) gates the run", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "omkit-cache-"));
    writeFileSync(path.join(dir, "in.txt"), "hi");
    let runs = 0;
    const build = action("build").run(async () => {
      runs++;
    });
    // Prime the cache.
    await om("call-to-run", async () => {
      await build().withCache(dir).result;
    });
    expect(runs).toBe(1);
    // Cross-statement config, before the first await: the gate still applies.
    await om("call-to-run", async () => {
      const h = build();
      h.withCache(dir);
      await h.result;
    });
    expect(runs).toBe(1); // still cached → skipped

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("command", () => {
  test("derives the action name from the command string (shell form)", () => {
    expect(command("npm run dev").actionName).toBe("npm run dev");
  });

  test("derives the action name from file + args (direct-exec form)", () => {
    expect(command("node", { args: ["script.js", "--flag"] }).actionName).toBe(
      "node script.js --flag"
    );
  });
});
