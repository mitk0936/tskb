import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import { omHash } from "../../src/foundation/ids.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("om identity", () => {
  test("om requires a non-empty name", () => {
    // @ts-expect-error — the name is required
    expect(() => om(async () => {})).toThrow(/name/);
    expect(() => om("")).toThrow(/name/);
    expect(() => om("   ")).toThrow(/name/);
  });

  test("the run folder is <name>-<hash8> under logs/", async () => {
    await om("identity-probe").run(async () => {});
    const folder = ExecutionTree.last!.folder;
    expect(folder.name()).toMatch(/^identity-probe-[0-9a-f]{8}$/);
    const segments = folder.path().split(path.sep);
    expect(segments).toContain(folder.name());
    expect(segments).toContain("logs");
  });

  test("the folder name is filesystem-safe even when the om name is not", async () => {
    await om("dev: watch/serve").run(async () => {});
    expect(ExecutionTree.last!.folder.name()).toMatch(/^dev-watch-serve-[0-9a-f]{8}$/);
  });

  test("the same om in the same file keeps the same identity across runs", async () => {
    await om("stable").run(async () => {});
    const first = ExecutionTree.last!.folder.name();
    await om("stable").run(async () => {});
    expect(ExecutionTree.last!.folder.name()).toBe(first);
  });
});

describe("omHash", () => {
  test("is deterministic and 8 lowercase hex chars", () => {
    expect(omHash("build", "C:/repo/a/pipeline.ts")).toMatch(/^[0-9a-f]{8}$/);
    expect(omHash("build", "C:/repo/a/pipeline.ts")).toBe(omHash("build", "C:/repo/a/pipeline.ts"));
  });

  test("same name in different files hashes differently", () => {
    expect(omHash("build", "C:/repo/a/pipeline.ts")).not.toBe(
      omHash("build", "C:/repo/b/pipeline.ts")
    );
  });

  test("different names in the same file hash differently", () => {
    expect(omHash("build", "C:/repo/a/pipeline.ts")).not.toBe(
      omHash("deploy", "C:/repo/a/pipeline.ts")
    );
  });
});
