import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import { builder as crossFileBuilder, runDirectlyFromHere } from "../fixtures/call-site/builder.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("om builder", () => {
  test("om(name).run(body) runs the body", async () => {
    let ran = false;
    await om("builder-basic").run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test(".describe() is optional and chainable", async () => {
    let ran = false;
    await om("builder-described")
      .describe({ summary: "Does a thing" })
      .run(async () => {
        ran = true;
      });
    expect(ran).toBe(true);
  });

  test("the builder produces the same run identity as the two-arg form", async () => {
    await om("identity-parity", async () => {});
    const legacy = ExecutionTree.last!.folder.name();
    ExecutionTree.reset();

    await om("identity-parity").run(async () => {});
    expect(ExecutionTree.last!.folder.name()).toBe(legacy);
  });

  // The same-file test above passes even if `callerSite()` were captured inside
  // `.run()` instead of `om()` — both calls sit in this file either way, so the
  // resolved site is the same by coincidence. This test is the one that actually
  // discriminates: the builder is constructed in a *different* file
  // (tests/fixtures/call-site/builder.ts) and `.run()` is called from here. If the
  // capture ever moved into `.run()`, the run would pick up *this* file's identity
  // instead of the fixture's, and the final assertion below would fail.
  test("a builder's identity is fixed where om(name) was called, not where .run() is", async () => {
    // Ground truth: the two-arg form, written and called from inside the fixture
    // file. No builder indirection is involved, so this is unambiguously the
    // fixture file's identity for this name.
    await runDirectlyFromHere(async () => {});
    const fixtureIdentity = ExecutionTree.last!.folder.name();
    ExecutionTree.reset();

    // The builder was constructed in the fixture file too, but `.run()` is called
    // right here, in this test file — a different file from where `om(name)` ran.
    await crossFileBuilder.run(async () => {});
    expect(ExecutionTree.last!.folder.name()).toBe(fixtureIdentity);
    ExecutionTree.reset();

    // Confirm the match above isn't coincidental: a direct call to the *same* name
    // from *this* file must hash differently than the fixture's.
    await om("builder-cross-file", async () => {});
    expect(ExecutionTree.last!.folder.name()).not.toBe(fixtureIdentity);
  });

  test("the builder rejects an empty name", () => {
    expect(() => om("")).toThrow(/name/);
    expect(() => om("   ")).toThrow(/name/);
  });

  test("the body receives the om context", async () => {
    let sawFolder = "";
    await om("builder-ctx").run(async (ctx) => {
      sawFolder = ctx.artifactsFolder;
    });
    expect(sawFolder).toContain("builder-ctx");
  });
});
