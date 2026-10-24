import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheck } from "../../src/client/check.ts";
import { buildInfoFile } from "../../src/client/tsCache.ts";

let project: string;
let cache: string;
const saved = { dir: process.env.OMKIT_CACHE_DIR, off: process.env.OMKIT_NO_CACHE };

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-tscache-"));
  cache = path.join(project, "cache");
  process.env.OMKIT_CACHE_DIR = cache;
  delete process.env.OMKIT_NO_CACHE;
  fs.mkdirSync(path.join(project, "oms"));
  fs.writeFileSync(
    path.join(project, "tsconfig.omkit.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, types: [] },
      include: ["oms/**/*.ts"],
    })
  );
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  for (const [key, value] of [
    ["OMKIT_CACHE_DIR", saved.dir],
    ["OMKIT_NO_CACHE", saved.off],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const write = (body: string): void => fs.writeFileSync(path.join(project, "oms", "a.ts"), body);
const check = (): number => runCheck(path.join(project, "tsconfig.omkit.json")).length;

describe("persistent type-check cache", () => {
  test("a check leaves build info behind, keyed to the project", () => {
    write("export const n: number = 1;\n");
    check();
    const file = buildInfoFile(path.join(project, "tsconfig.omkit.json"))!;
    expect(path.dirname(file)).toBe(cache);
    expect(fs.existsSync(file)).toBe(true);
  });

  test("never answers from a stale cache: an edit is re-checked both ways", () => {
    write("export const n: number = 'nope';\n");
    expect(check()).toBe(1);
    expect(check()).toBe(1); // warm, unchanged — still reported
    write("export const n: number = 1;\n");
    expect(check()).toBe(0);
    write("export const n: number = 'again';\n");
    expect(check()).toBe(1);
  });

  test("OMKIT_NO_CACHE=1 checks without writing anything", () => {
    process.env.OMKIT_NO_CACHE = "1";
    write("export const n: number = 'nope';\n");
    expect(check()).toBe(1);
    expect(fs.existsSync(cache)).toBe(false);
  });

  test("a corrupt cache file is a miss, not a failure", () => {
    write("export const n: number = 'nope';\n");
    check();
    fs.writeFileSync(buildInfoFile(path.join(project, "tsconfig.omkit.json"))!, "{ not json");
    expect(check()).toBe(1);
  });
});
