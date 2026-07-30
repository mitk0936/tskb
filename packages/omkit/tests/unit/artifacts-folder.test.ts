import { afterEach, describe, expect, test } from "vitest";
import path from "node:path";
import { om, action } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("artifactsFolder", () => {
  test("the om body and an action body both receive the absolute run-folder path", async () => {
    let omFolder: string | undefined;
    let actionFolder: string | undefined;
    await om("artifacts").run(async (ctx) => {
      omFolder = ctx.artifactsFolder;
      await action("probe").run(async (c) => {
        actionFolder = c.artifactsFolder;
      })().result;
    });
    const runFolder = ExecutionTree.last!.folder.path();
    expect(omFolder).toBe(runFolder);
    expect(actionFolder).toBe(runFolder);
    expect(path.isAbsolute(omFolder as string)).toBe(true);
  });
});
