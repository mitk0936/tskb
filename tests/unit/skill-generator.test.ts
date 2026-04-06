/**
 * Unit tests for skill-generator utilities.
 *
 * generateSkillFiles writes SKILL.md files under .claude/skills/.
 * Tests use temporary directories so they never touch real project files.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSkillFiles } from "../../packages/tskb/src/cli/utils/skill-generator.js";
import type { KnowledgeGraph } from "../../packages/tskb/src/core/graph/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyGraph(): KnowledgeGraph {
  return {
    nodes: {
      folders: {},
      modules: {},
      terms: {},
      exports: {},
      files: {},
      externals: {},
      flows: {},
      docs: {},
    },
    edges: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      version: "0.0.0",
      rootPath: ".",
      stats: {
        folderCount: 0,
        moduleCount: 0,
        termCount: 0,
        exportCount: 0,
        fileCount: 0,
        externalCount: 0,
        flowCount: 0,
        docCount: 0,
        edgeCount: 0,
      },
    },
  };
}

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// generateSkillFiles
// ---------------------------------------------------------------------------

describe("generateSkillFiles", () => {
  it("creates .claude/skills/tskb/SKILL.md and tskb-update/SKILL.md", () => {
    generateSkillFiles(emptyGraph());

    const queryPath = path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md");
    const updatePath = path.join(tmpDir, ".claude", "skills", "tskb-update", "SKILL.md");

    expect(fs.existsSync(queryPath)).toBe(true);
    expect(fs.existsSync(updatePath)).toBe(true);
  });

  it("returns paths to both written files", () => {
    const paths = generateSkillFiles(emptyGraph());

    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/tskb[/\\]SKILL\.md$/);
    expect(paths[1]).toMatch(/tskb-update[/\\]SKILL\.md$/);
  });

  it("query skill has correct frontmatter", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("name: tskb");
    expect(content).toContain("allowed-tools: Bash(npx --no -- tskb *)");
  });

  it("update skill has correct frontmatter", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb-update", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("name: tskb-update");
    expect(content).toContain("Write, Edit, Glob");
  });

  it("query skill body includes command reference", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("tskb search");
    expect(content).toContain("tskb context");
    expect(content).toContain("tskb pick");
  });

  it("update skill body includes rebuild instruction", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb-update", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("package.json");
    expect(content).toContain("npm run docs");
  });

  it("bakes graph data into skill files", () => {
    const graph = emptyGraph();
    graph.nodes.folders["core"] = {
      id: "core",
      type: "folder",
      desc: "Core business logic",
      path: "src/core",
    };
    graph.nodes.docs["arch"] = {
      id: "arch",
      type: "doc",
      explains: "Top-level architecture overview",
      priority: "essential",
      filePath: "docs/arch.tskb.tsx",
      content: "",
      format: "tsx",
    };

    generateSkillFiles(graph);
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md"),
      "utf-8"
    );

    expect(content).toContain("**core**");
    expect(content).toContain("Core business logic");
    expect(content).toContain("docs/arch.tskb.tsx");
    expect(content).toContain("Top-level architecture overview");
  });

  it("overwrites existing skill files on re-run", () => {
    generateSkillFiles(emptyGraph());

    const graph = emptyGraph();
    graph.nodes.folders["new-area"] = {
      id: "new-area",
      type: "folder",
      desc: "A new area added later",
      path: "src/new",
    };

    generateSkillFiles(graph);

    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("new-area");
  });
});
