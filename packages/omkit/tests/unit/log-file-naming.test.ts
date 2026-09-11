import { readdir } from "node:fs/promises";
import { afterEach, describe, expect, test } from "vitest";
import { om, step } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("log file naming", () => {
  test("a node named after a command line writes one flat log file", async () => {
    // The real name that exposed this: `command` names its node after the whole command, and
    // ids are joined into node paths with `/`, which the log writer maps onto directories. The
    // separators inside the name used to be read as levels — this one produced nine of them,
    // with `docs`, `packages` and `tskb` appearing as folders inside the run.
    const command = 'npx --no -- tskb "./docs/**/*.tskb.tsx" --watch-path ./packages/tskb/dist';

    await om("flat-log").run(async () => {
      await step(command, async () => {}).result;
    });

    const folder = ExecutionTree.last!.folder.path();
    const entries = await readdir(folder, { withFileTypes: true });

    expect(entries.filter((e) => e.isDirectory()).map((e) => e.name)).toEqual([]);
    const logs = entries.filter((e) => e.name.startsWith("npx")).map((e) => e.name);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^npx[\w.-]*_[0-9a-f]{8}\.log$/);
  });

  test("the tree's own nesting still becomes directories", async () => {
    await om("nested-log").run(async () => {
      await step("parent", async () => {
        await step("child", async () => {}).result;
      }).result;
    });

    const folder = ExecutionTree.last!.folder.path();
    const entries = await readdir(folder, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    // One directory, for the parent that actually has a child under it.
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toMatch(/^parent_[0-9a-f]{8}$/);
    expect((await readdir(entries.length ? `${folder}/${dirs[0]}` : folder)).join()).toMatch(
      /^child_[0-9a-f]{8}\.log$/
    );
  });
});
