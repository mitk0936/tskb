import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { skillRoot } from "../../src/skill/root.ts";

let base: string;

beforeEach(() => {
  // Symlinks in the temp path (macOS /var → /private/var) would make the assertions compare
  // two spellings of one directory, so resolve once here and compare against the real form.
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "omkit-root-")));
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

const mkdir = (rel: string): string => {
  const dir = path.join(base, rel);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

describe("skillRoot", () => {
  it("finds the repo above a project kept in a subfolder", () => {
    mkdir(".git");
    const project = mkdir("om");
    expect(skillRoot(project)).toBe(base);
  });

  it("climbs past intermediate package folders", () => {
    mkdir(".git");
    const project = mkdir("packages/tools/om/src");
    expect(skillRoot(project)).toBe(base);
  });

  it("accepts the worktree form, where .git is a file", () => {
    fs.writeFileSync(path.join(base, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");
    const project = mkdir("om");
    expect(skillRoot(project)).toBe(base);
  });

  it("stays put when the project is itself the repo", () => {
    mkdir(".git");
    expect(skillRoot(base)).toBe(base);
  });

  it("falls back to the project when nothing above it is a repo", () => {
    const project = mkdir("standalone");
    expect(skillRoot(project)).toBe(project);
  });
});
