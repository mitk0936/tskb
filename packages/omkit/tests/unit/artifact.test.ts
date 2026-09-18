import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import { ArtifactStore } from "../../src/output/artifact/ArtifactStore.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("ArtifactStore", () => {
  test("infers mime from the extension", () => {
    const store = new ArtifactStore();
    expect(store.register("shot", "/runs/a/shot.png", "main").mime).toBe("image/png");
    expect(store.register("data", "/runs/a/data.json", "main").mime).toBe("application/json");
    expect(store.register("log", "/runs/a/out.log", "main").mime).toBe("text/plain");
  });

  test("an explicit mime wins over inference", () => {
    const store = new ArtifactStore();
    const record = store.register("odd", "/runs/a/thing.bin", "main", {
      mime: "application/x-custom",
    });
    expect(record.mime).toBe("application/x-custom");
  });

  test("falls back to application/octet-stream for an unknown extension", () => {
    const store = new ArtifactStore();
    expect(store.register("blob", "/runs/a/thing.qqq", "main").mime).toBe(
      "application/octet-stream"
    );
  });

  test("all() returns registrations in order", () => {
    const store = new ArtifactStore();
    store.register("one", "/runs/a/1.png", "main");
    store.register("two", "/runs/a/2.png", "main");
    expect(store.all().map((r) => r.name)).toEqual(["one", "two"]);
  });
});

describe("ctx.artifact", () => {
  test("registers from an om body and returns the path", async () => {
    let returned = "";
    await om("artifact-probe").run(async (ctx) => {
      returned = ctx.artifact("login-failure", path.join(ctx.artifactsFolder, "shot.png"), {
        description: "Screenshot at the failing assertion",
      });
    });

    const artifacts = ExecutionTree.last!.artifactsForTest();
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].name).toBe("login-failure");
    expect(artifacts[0].description).toBe("Screenshot at the failing assertion");
    expect(artifacts[0].mime).toBe("image/png");
    expect(returned).toBe(artifacts[0].file);
  });

  test("the registration reaches the run timeline", async () => {
    await om("artifact-timeline").run(async (ctx) => {
      ctx.artifact("report", path.join(ctx.artifactsFolder, "report.json"));
    });

    const lines = ExecutionTree.last!.entriesForTest().map((e) => e.message);
    expect(lines.some((m) => m.includes("report") && m.includes("report.json"))).toBe(true);
  });
});
