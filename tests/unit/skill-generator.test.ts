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
  it("creates SKILL.md for tskb, tskb-toc, tskb-update, and tskb-update-syntax", () => {
    generateSkillFiles(emptyGraph());

    const cliPath = path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md");
    const tocPath = path.join(tmpDir, ".claude", "skills", "tskb-toc", "SKILL.md");
    const updatePath = path.join(tmpDir, ".claude", "skills", "tskb-update", "SKILL.md");
    const syntaxPath = path.join(tmpDir, ".claude", "skills", "tskb-update-syntax", "SKILL.md");

    expect(fs.existsSync(cliPath)).toBe(true);
    expect(fs.existsSync(tocPath)).toBe(true);
    expect(fs.existsSync(updatePath)).toBe(true);
    expect(fs.existsSync(syntaxPath)).toBe(true);
  });

  it("returns paths to all four written files", () => {
    const paths = generateSkillFiles(emptyGraph());

    expect(paths).toHaveLength(4);
    expect(paths[0]).toMatch(/tskb[/\\]SKILL\.md$/);
    expect(paths[1]).toMatch(/tskb-toc[/\\]SKILL\.md$/);
    expect(paths[2]).toMatch(/tskb-update[/\\]SKILL\.md$/);
    expect(paths[3]).toMatch(/tskb-update-syntax[/\\]SKILL\.md$/);
  });

  it("tskb skill has correct frontmatter", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("name: tskb");
    expect(content).toContain("allowed-tools: Bash(npx --no -- tskb *)");
  });

  it("tskb-toc skill has correct frontmatter", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb-toc", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("name: tskb-toc");
    expect(content).toContain("allowed-tools: Bash(npx --no -- tskb *)");
  });

  it("tskb-update skill has correct frontmatter", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb-update", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("name: tskb-update");
    expect(content).toContain("Write, Edit, Glob");
  });

  it("tskb-update-syntax skill has correct frontmatter", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb-update-syntax", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("name: tskb-update-syntax");
    expect(content).toContain("Write, Edit, Glob");
  });

  it("tskb skill body includes command reference", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md"),
      "utf-8"
    );
    expect(content).toContain("tskb search");
    expect(content).toContain("tskb context");
    expect(content).toContain("tskb pick");
  });

  it("update skill body includes a rebuild command", () => {
    generateSkillFiles(emptyGraph());
    const content = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb-update", "SKILL.md"),
      "utf-8"
    );
    // No package.json in the tmpdir, so detectBuildScript falls back to the
    // raw `npx --no -- tskb` invocation.
    expect(content).toContain("After Editing");
    expect(content).toContain("npx --no -- tskb");
  });

  it("bakes graph data into the relevant skill files", () => {
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

    // Folder tree lives in the always-on tskb skill.
    const cliContent = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb", "SKILL.md"),
      "utf-8"
    );
    expect(cliContent).toContain("**core**");
    expect(cliContent).toContain("Core business logic");

    // Essential docs index lives in the on-demand tskb-toc skill.
    const tocContent = fs.readFileSync(
      path.join(tmpDir, ".claude", "skills", "tskb-toc", "SKILL.md"),
      "utf-8"
    );
    expect(tocContent).toContain("docs/arch.tskb.tsx");
    expect(tocContent).toContain("Top-level architecture overview");
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
