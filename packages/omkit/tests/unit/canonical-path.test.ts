import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalPath } from "../../src/foundation/canonicalPath.ts";
import { omHash } from "../../src/foundation/ids.ts";

let dir: string;
let file: string;

beforeAll(() => {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "omkit-canon-")));
  file = path.join(dir, "om.ts");
  fs.writeFileSync(file, "// an om\n");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** The same path with its drive letter flipped — one file, two spellings, on Windows. */
const flipDrive = (p: string): string =>
  /^[a-zA-Z]:/.test(p)
    ? (p[0] === p[0]!.toUpperCase() ? p[0]!.toLowerCase() : p[0]!.toUpperCase()) + p.slice(1)
    : p;

describe("canonicalPath", () => {
  it("returns the file's real name", () => {
    expect(canonicalPath(file)).toBe(fs.realpathSync.native(file));
  });

  it("passes through a path that does not exist", () => {
    const missing = path.join(dir, "nope.ts");
    expect(canonicalPath(missing)).toBe(missing);
  });

  it("is idempotent", () => {
    expect(canonicalPath(canonicalPath(file))).toBe(canonicalPath(file));
  });

  it.runIf(process.platform === "win32")(
    "collapses both drive-letter spellings onto one name",
    () => {
      const flipped = flipDrive(file);
      expect(flipped).not.toBe(file);
      expect(canonicalPath(flipped)).toBe(canonicalPath(file));
    }
  );
});

describe("run identity survives a differently-spelled path", () => {
  /**
   * The regression this whole helper exists for. Before it, the same om reached by two
   * spellings of one path hashed to two different run folders — so `logs/<name>-<hash>/`
   * stopped meaning "every run of this om", and `start_om`'s predicted folder pointed at a
   * directory the run never created.
   */
  it.runIf(process.platform === "win32")("hashes to one identity, not two", () => {
    const flipped = flipDrive(file);
    expect(omHash("build", flipped)).not.toBe(omHash("build", file));
    expect(omHash("build", canonicalPath(flipped))).toBe(omHash("build", canonicalPath(file)));
  });

  it("still separates genuinely different files", () => {
    const other = path.join(dir, "other.ts");
    fs.writeFileSync(other, "// another om\n");
    expect(omHash("build", canonicalPath(other))).not.toBe(omHash("build", canonicalPath(file)));
  });

  it("still separates different names in one file", () => {
    expect(omHash("a", canonicalPath(file))).not.toBe(omHash("b", canonicalPath(file)));
  });
});
