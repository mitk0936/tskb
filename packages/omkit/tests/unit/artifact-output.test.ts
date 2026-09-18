import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { om, step } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("artifact output", () => {
  test("curated artifacts appear in the run view", async () => {
    await om("artifact-view").run(async (ctx) => {
      ctx.artifact("report", path.join(ctx.artifactsFolder, "report.json"), {
        description: "The generated report",
      });
    });

    const view = ExecutionTree.last!.runViewForTest();
    expect(view.artifacts).toHaveLength(1);
    expect(view.artifacts[0]).toMatchObject({
      name: "report",
      description: "The generated report",
      mime: "application/json",
    });
  });

  test("result.json carries the artifacts", async () => {
    await om("artifact-result").run(async (ctx) => {
      ctx.artifact("shot", path.join(ctx.artifactsFolder, "shot.png"));
    });

    const folder = ExecutionTree.last!.folder.path();
    const parsed = JSON.parse(await readFile(path.join(folder, "result.json"), "utf8")) as {
      artifacts: { name: string; mime: string }[];
    };
    expect(parsed.artifacts).toEqual([
      expect.objectContaining({ name: "shot", mime: "image/png" }),
    ]);
  });

  test("artifacts.log lists each registration", async () => {
    await om("artifact-rollup").run(async (ctx) => {
      ctx.artifact("one", path.join(ctx.artifactsFolder, "one.png"));
      ctx.artifact("two", path.join(ctx.artifactsFolder, "two.png"));
    });

    const folder = ExecutionTree.last!.folder.path();
    const rollup = await readFile(path.join(folder, "artifacts.log"), "utf8");
    expect(rollup).toContain("one");
    expect(rollup).toContain("two");
  });

  test("a run with no artifacts still writes an empty list", async () => {
    await om("artifact-none").run(async () => {});
    expect(ExecutionTree.last!.runViewForTest().artifacts).toEqual([]);
  });

  test("re-registering the same name updates result.json in place but artifacts.log keeps every entry", async () => {
    await om("artifact-dedupe").run(async (ctx) => {
      ctx.artifact("report", path.join(ctx.artifactsFolder, "report.json"), {
        description: "first pass",
      });
      ctx.artifact("report", path.join(ctx.artifactsFolder, "report.json"), {
        description: "final pass",
      });
    });

    const folder = ExecutionTree.last!.folder.path();

    // result.json: one entry, carrying the latest registration's data.
    const parsed = JSON.parse(await readFile(path.join(folder, "result.json"), "utf8")) as {
      artifacts: { name: string; description?: string }[];
    };
    expect(parsed.artifacts).toEqual([
      expect.objectContaining({ name: "report", description: "final pass" }),
    ]);

    // artifacts.log: a journal, like events.log/asserts.log — both calls survive.
    const rollup = await readFile(path.join(folder, "artifacts.log"), "utf8");
    const reportLines = rollup.split("\n").filter((line) => line.includes("report →"));
    expect(reportLines).toHaveLength(2);
  });

  test("two different actions registering the same name both survive in result.json", async () => {
    await om("artifact-cross-node").run(async () => {
      await step("capture-a", async (ctx) => {
        ctx.artifact("screenshot", path.join(ctx.artifactsFolder, "a.png"));
      });
      await step("capture-b", async (ctx) => {
        ctx.artifact("screenshot", path.join(ctx.artifactsFolder, "b.png"));
      });
    });

    const folder = ExecutionTree.last!.folder.path();
    const parsed = JSON.parse(await readFile(path.join(folder, "result.json"), "utf8")) as {
      artifacts: { name: string; file: string }[];
    };
    expect(parsed.artifacts).toHaveLength(2);
    expect(parsed.artifacts.map((a) => a.file).sort()).toEqual(
      [path.join(folder, "a.png"), path.join(folder, "b.png")].sort()
    );
  });

  test("a relative file path is resolved to absolute in the run view", async () => {
    await om("artifact-relative").run(async (ctx) => {
      ctx.artifact("relative", path.join("relative-artifact.txt"));
    });

    const view = ExecutionTree.last!.runViewForTest();
    expect(view.artifacts).toHaveLength(1);
    expect(path.isAbsolute(view.artifacts[0].file)).toBe(true);
  });
});
