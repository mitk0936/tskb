import { afterAll, beforeAll, afterEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RunFolder } from "../../src/output/folder/RunFolder.ts";

// `logs/` is resolved against cwd, so the tests run inside a throwaway directory.
let workdir: string;
let previousCwd: string;

beforeAll(() => {
  previousCwd = process.cwd();
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-folder-"));
});

afterEach(() => {
  process.chdir(previousCwd);
  vi.useRealTimers();
});

afterAll(() => {
  process.chdir(previousCwd);
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

describe("RunFolder", () => {
  test("names the folder <fsSafe(name)>-<hash>", () => {
    expect(new RunFolder("tskb:build", "a1b2c3d4").name()).toBe("tskb-build-a1b2c3d4");
  });

  test("two runs of the same om in the same second get separate directories", () => {
    // The collision that matters: `hms` has second resolution, and `RawStream` opens
    // raw.jsonl with flags "w". Sharing a directory means two live runs truncate the same
    // file and write at independent offsets — corrupt bytes, not a "last one wins".
    // Freeze the clock so both runs share one base timestamp — otherwise a second-boundary
    // between the two `path()` calls yields distinct folders and never exercises the lock.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 9, 26, 42));
    process.chdir(workdir);
    const first = new RunFolder("collide", "aaaaaaaa");
    const second = new RunFolder("collide", "aaaaaaaa");

    const a = first.path();
    const b = second.path();

    expect(a).not.toBe(b);
    expect(fs.existsSync(a)).toBe(true);
    expect(fs.existsSync(b)).toBe(true);
    // Zero-padded, so lexical order stays chronological — `latest` sorts by name.
    expect(path.basename(b)).toBe(`${path.basename(a)}-02`);
    expect(path.basename(a) < path.basename(b)).toBe(true);
  });

  test("a third collision keeps counting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 9, 26, 42));
    process.chdir(workdir);
    const dirs = [1, 2, 3].map(() => new RunFolder("triple", "bbbbbbbb").path());
    expect(new Set(dirs).size).toBe(3);
    expect(path.basename(dirs[2]!)).toMatch(/-0[23]$/);
  });

  test("the path is claimed once and stays put", () => {
    process.chdir(workdir);
    const folder = new RunFolder("stable", "cccccccc");
    const first = folder.path();
    folder.ensure();
    expect(folder.path()).toBe(first);
    expect(folder.file("main.log")).toBe(path.join(first, "main.log"));
  });

  test("file() works without an explicit ensure()", () => {
    process.chdir(workdir);
    const folder = new RunFolder("implicit", "dddddddd");
    const file = folder.file("result.json");
    expect(fs.existsSync(path.dirname(file))).toBe(true);
  });

  describe("the project root", () => {
    afterEach(() => {
      delete process.env.OMKIT_ROOT;
    });

    test("puts the run under OMKIT_ROOT, wherever the child happens to be working", () => {
      const project = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-project-"));
      // The situation this exists for: a child whose cwd is the om file's own directory,
      // several levels below the project it belongs to.
      const deep = path.join(workdir, "src", "oms", "experiments");
      fs.mkdirSync(deep, { recursive: true });
      process.chdir(deep);
      process.env.OMKIT_ROOT = project;

      const dir = new RunFolder("rooted", "eeeeeeee").path();

      expect(dir.startsWith(path.join(fs.realpathSync(project), "logs"))).toBe(true);
      expect(fs.existsSync(path.join(deep, "logs"))).toBe(false);
      fs.rmSync(project, { recursive: true, force: true });
    });

    test("falls back to cwd when no root was named", () => {
      process.chdir(workdir);
      const dir = new RunFolder("unrooted", "ffffffff").path();
      expect(dir.startsWith(path.join(fs.realpathSync(workdir), "logs"))).toBe(true);
    });
  });
});
