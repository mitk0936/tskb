import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

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
