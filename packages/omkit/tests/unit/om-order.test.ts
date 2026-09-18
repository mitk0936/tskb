import { describe, expect, it } from "vitest";
import path from "node:path";
import { byNesting, nestingDepth } from "../../src/client/order.ts";

const ROOT = path.resolve("/proj");
const at = (rel: string): string => path.join(ROOT, rel);

describe("nestingDepth", () => {
  it("counts the directories between the root and the file", () => {
    expect(nestingDepth(at("build.ts"), ROOT)).toBe(0);
    expect(nestingDepth(at("oms/build.ts"), ROOT)).toBe(1);
    expect(nestingDepth(at("oms/ci/nightly/build.ts"), ROOT)).toBe(3);
  });

  it("treats a file outside the root as deeper than anything inside it", () => {
    expect(nestingDepth(path.resolve("/elsewhere/build.ts"), ROOT)).toBe(Infinity);
    expect(nestingDepth(at("../build.ts"), ROOT)).toBe(Infinity);
  });
});

describe("byNesting", () => {
  const names = (entries: { name: string; file: string }[]): string[] =>
    [...entries].sort(byNesting(ROOT)).map((e) => e.name);

  it("lists the shallowest oms first", () => {
    expect(
      names([
        { name: "a-deep", file: at("oms/ci/nightly/a.ts") },
        { name: "b-mid", file: at("oms/b.ts") },
        { name: "c-top", file: at("c.ts") },
      ])
    ).toEqual(["c-top", "b-mid", "a-deep"]);
  });

  it("orders alphabetically within one depth", () => {
    expect(
      names([
        { name: "dev", file: at("oms/dev.ts") },
        { name: "build", file: at("oms/build.ts") },
        { name: "deploy", file: at("oms/deploy.ts") },
      ])
    ).toEqual(["build", "deploy", "dev"]);
  });

  it("puts oms outside the root after every om inside it", () => {
    expect(
      names([
        { name: "aaa", file: path.resolve("/elsewhere/aaa.ts") },
        { name: "zzz", file: at("oms/ci/nightly/zzz.ts") },
      ])
    ).toEqual(["zzz", "aaa"]);
  });

  it("breaks a name tie on the file, so same-named oms stay in a fixed order", () => {
    const sorted = [
      { name: "dev", file: at("oms/b/dev.ts") },
      { name: "dev", file: at("oms/a/dev.ts") },
    ].sort(byNesting(ROOT));
    expect(sorted.map((e) => e.file)).toEqual([at("oms/a/dev.ts"), at("oms/b/dev.ts")]);
  });
});
