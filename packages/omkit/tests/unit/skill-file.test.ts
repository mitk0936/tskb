import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readExisting,
  writeSkill,
  DEFAULT_DESCRIPTION,
  SKILL_RELATIVE_PATH,
} from "../../src/skill/file.ts";
import { renderSkill } from "../../src/skill/render.ts";
import type { SkillModel } from "../../src/skill/model.ts";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-skill-"));
  file = path.join(dir, SKILL_RELATIVE_PATH);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const model: SkillModel = {
  oms: [{ kind: "om", name: "b", file: "om/b.ts", mode: "settling" }],
  actions: [],
  hash: "a1b2c3d4",
};

describe("readExisting", () => {
  it("returns nothing for a file that is not there", () => {
    expect(readExisting(file)).toEqual({});
  });

  it("round-trips a description and a hash written by the renderer", () => {
    writeSkill(file, renderSkill(model, { description: DEFAULT_DESCRIPTION }));
    expect(readExisting(file)).toEqual({ description: DEFAULT_DESCRIPTION, hash: "a1b2c3d4" });
  });

  it("preserves an authored description verbatim", () => {
    writeSkill(file, renderSkill(model, { description: "Use me when deploying." }));
    expect(readExisting(file).description).toBe("Use me when deploying.");
  });

  it("keeps a folded multi-line description with its continuation lines", () => {
    const folded =
      "Runnable workflows in this repo — what each does, its\n  arguments, and how to\n  run it.";
    writeSkill(file, renderSkill(model, { description: folded }));
    expect(readExisting(file).description).toBe(folded);
  });

  it("stops at the next frontmatter key rather than swallowing it", () => {
    writeSkill(
      file,
      ["---", "description: one line", "name: omkit-runs", "---", "", "# body"].join("\n")
    );
    expect(readExisting(file).description).toBe("one line");
  });

  it("reports no hash when the marker is absent", () => {
    writeSkill(file, ["---", "description: d", "---", "", "# body, no marker"].join("\n"));
    expect(readExisting(file).hash).toBeUndefined();
  });

  it("survives a file with no frontmatter at all", () => {
    writeSkill(file, "# just a heading\n");
    expect(readExisting(file)).toEqual({});
  });
});

describe("writeSkill", () => {
  it("creates the directories a first generation needs", () => {
    expect(fs.existsSync(path.dirname(file))).toBe(false);
    writeSkill(file, "x");
    expect(fs.readFileSync(file, "utf8")).toBe("x");
  });

  it("lands under .claude/skills/omkit-runs", () => {
    expect(SKILL_RELATIVE_PATH.split(path.sep)).toEqual([
      ".claude",
      "skills",
      "omkit-runs",
      "SKILL.md",
    ]);
  });
});
