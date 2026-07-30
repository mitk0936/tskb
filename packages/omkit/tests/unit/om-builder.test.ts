import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import { builder as crossFileBuilder, runFromFixture } from "../fixtures/call-site/builder.ts";

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

  // The builder defers the body to a second call, so the call-site capture has to happen
  // in `om(name)` and ride along on the builder. Were it ever to move into `.run()`,
  // every run folder in every repo using omkit would change identity and orphan its
  // history. A same-file test cannot catch that: `callerSite()` skips frames by *file
  // path*, and `om()` and `Builder.run()` both live in om.ts, so both are skipped
  // identically and either capture point resolves to the same site. This is the only
  // guard — the builder is constructed in tests/fixtures/call-site/builder.ts, and
  // `.run()` is called from here.
  test("a builder's identity is fixed where om(name) was called, not where .run() is", async () => {
    // Ground truth: `om(name)` and `.run(body)` both written inside the fixture, so this
    // is that file's identity for this name however the capture is wired.
    await runFromFixture(async () => {});
    const fixtureIdentity = ExecutionTree.last!.folder.name();
    ExecutionTree.reset();

    // The builder was constructed in the fixture; `.run()` fires here, in another file.
    await crossFileBuilder.run(async () => {});
    // `definedAt` is the very string the folder hash is taken over — it must name the
    // fixture, not this test file.
    expect(ExecutionTree.last!.runViewForTest().root.definedAt).toMatch(
      /call-site[\\/]builder\.ts:\d+$/
    );
    expect(ExecutionTree.last!.folder.name()).toBe(fixtureIdentity);
    ExecutionTree.reset();

    // And the match isn't a coincidence: the same name defined in *this* file hashes
    // differently, so a capture that leaked to the `.run()` site would have been caught
    // by the two assertions above rather than passing vacuously.
    await om("builder-cross-file").run(async () => {});
    expect(ExecutionTree.last!.folder.name()).not.toBe(fixtureIdentity);
  });

  test("the builder rejects an empty name", () => {
    expect(() => om("")).toThrow(/name/);
    expect(() => om("   ")).toThrow(/name/);
  });

  test("the removed two-argument form throws and points at .run()", () => {
    // @ts-expect-error — the two-argument form no longer exists
    expect(() => om("legacy", async () => {})).toThrow(/\.run\(/);
  });

  test("the body receives the om context", async () => {
    let sawFolder = "";
    await om("builder-ctx").run(async (ctx) => {
      sawFolder = ctx.artifactsFolder;
    });
    expect(sawFolder).toContain("builder-ctx");
  });
});
