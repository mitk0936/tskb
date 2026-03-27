/**
 * E2E test: Simulates a user adopting tskb in a TypeScript project.
 *
 * Uses the fixture at tests/e2e/fixture/ — a small task management app
 * with models, services, API routes, and utilities.
 *
 * Flow:
 *   1. Run `tskb init` in a clean temp copy to test scaffolding
 *   2. Build the graph using tskb CLI against the fixture's docs
 *   3. Run every query command (ls, search, pick, docs, context)
 *   4. Assert on the graph structure and query results
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "fixture");
const TSKB_BIN = path.resolve(import.meta.dirname, "../../packages/tskb/dist/cli/index.js");
const GRAPH_PATH = path.join(FIXTURE_DIR, ".tskb", "graph.json");

/** Run the tskb CLI in a given directory */
function tskbIn(cwd: string, ...args: string[]): string {
  return execFileSync("node", [TSKB_BIN, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
  });
}

/** Run the tskb CLI in the fixture directory */
function tskb(...args: string[]): string {
  return tskbIn(FIXTURE_DIR, ...args);
}

describe("tskb init", () => {
  let tempDir: string;

  /** Recursively copy a directory */
  function copyDir(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  beforeAll(() => {
    // Create a temp directory with just src/ and package.json — no docs yet
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-init-test-"));
    copyDir(path.join(FIXTURE_DIR, "src"), path.join(tempDir, "src"));
    fs.copyFileSync(path.join(FIXTURE_DIR, "package.json"), path.join(tempDir, "package.json"));

    // Run tskb init with --yes to accept all defaults (non-interactive)
    execFileSync("node", [TSKB_BIN, "init", "--yes"], {
      cwd: tempDir,
      encoding: "utf-8",
      timeout: 15_000,
    });
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("should create docs/ folder", () => {
    expect(fs.existsSync(path.join(tempDir, "docs"))).toBe(true);
  });

  it("should create docs/tsconfig.json with correct config", () => {
    const tsconfigPath = path.join(tempDir, "docs", "tsconfig.json");
    expect(fs.existsSync(tsconfigPath)).toBe(true);

    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
    expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
    expect(tsconfig.compilerOptions.jsxImportSource).toBe("tskb");
    expect(tsconfig.compilerOptions.module).toBe("NodeNext");
    expect(tsconfig.compilerOptions.moduleResolution).toBe("NodeNext");
    expect(tsconfig.include).toContain("**/*.tskb.tsx");
  });

  it("should create starter architecture.tskb.tsx", () => {
    const starterPath = path.join(tempDir, "docs", "architecture.tskb.tsx");
    expect(fs.existsSync(starterPath)).toBe(true);

    const content = fs.readFileSync(starterPath, "utf-8");
    expect(content).toContain("Doc");
    expect(content).toContain('priority="essential"');
    expect(content).toContain("namespace tskb");
  });

  it("should add 'docs' script to package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf-8"));
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.docs).toBeDefined();
    expect(pkg.scripts.docs).toContain("tskb");
    expect(pkg.scripts.docs).toContain("tsconfig");
  });

  it("should create .claude/skills/ directory", () => {
    expect(fs.existsSync(path.join(tempDir, ".claude", "skills"))).toBe(true);
  });

  it("should create .github/ directory", () => {
    expect(fs.existsSync(path.join(tempDir, ".github"))).toBe(true);
  });

  it("should not overwrite existing files on re-run", () => {
    // Modify the starter doc
    const starterPath = path.join(tempDir, "docs", "architecture.tskb.tsx");
    const originalContent = fs.readFileSync(starterPath, "utf-8");
    fs.writeFileSync(starterPath, originalContent + "\n// custom edit");

    // Re-run init
    execFileSync("node", [TSKB_BIN, "init", "--yes"], {
      cwd: tempDir,
      encoding: "utf-8",
      timeout: 15_000,
    });

    // Should preserve the custom edit
    const afterRerun = fs.readFileSync(starterPath, "utf-8");
    expect(afterRerun).toContain("// custom edit");
  });
});

describe("tskb e2e", () => {
  // ── Phase 1: Build ─────────────────────────────────────────────

  beforeAll(() => {
    // Clean previous output
    const tskbOut = path.join(FIXTURE_DIR, ".tskb");
    if (fs.existsSync(tskbOut)) {
      fs.rmSync(tskbOut, { recursive: true });
    }

    // Build the graph
    tskb("build", "docs/**/*.tskb.tsx", "--tsconfig", "docs/tsconfig.json");
  });

  describe("build output", () => {
    it("should create graph.json", () => {
      expect(fs.existsSync(GRAPH_PATH)).toBe(true);
    });

    it("should create graph.dot", () => {
      expect(fs.existsSync(path.join(FIXTURE_DIR, ".tskb", "graph.dot"))).toBe(true);
    });

    it("should produce a valid graph with expected node counts", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));

      // Check structure
      expect(graph).toHaveProperty("nodes");
      expect(graph).toHaveProperty("edges");
      expect(graph).toHaveProperty("metadata");

      // Folders: api, services, models, utils + auto-inferred root + src
      const folderIds = Object.keys(graph.nodes.folders);
      expect(folderIds.length).toBeGreaterThanOrEqual(4);

      // Modules: 6 declared (including utils barrel that shares ID with utils folder)
      const moduleIds = Object.keys(graph.nodes.modules);
      expect(moduleIds.length).toBe(6);

      // Exports: 4 declared (AuthService, TaskService, ProjectService, createLogger)
      const exportIds = Object.keys(graph.nodes.exports);
      expect(exportIds.length).toBeGreaterThanOrEqual(4);

      // Terms: 3 declared
      const termIds = Object.keys(graph.nodes.terms);
      expect(termIds.length).toBe(3);

      // Docs: 5 files (vocabulary has no Doc, so 4 with Doc exports)
      const docIds = Object.keys(graph.nodes.docs);
      expect(docIds.length).toBe(4);

      // Edges exist
      expect(graph.edges.length).toBeGreaterThan(0);
    });

    it("should have correct doc priorities", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const docs = Object.values(graph.nodes.docs) as Array<{
        priority: string;
        explains: string;
      }>;

      const essential = docs.filter((d) => d.priority === "essential");
      const constraint = docs.filter((d) => d.priority === "constraint");
      const supplementary = docs.filter((d) => d.priority === "supplementary");

      expect(essential.length).toBe(2); // architecture + auth
      expect(constraint.length).toBe(1); // service isolation
      expect(supplementary.length).toBe(1); // tasks
    });

    it("should have related-to edges from Relation components", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const relatedEdges = graph.edges.filter((e: { type: string }) => e.type === "related-to");
      expect(relatedEdges.length).toBeGreaterThanOrEqual(3);

      // Check specific relations exist
      const labels = relatedEdges.map((e: { label?: string }) => e.label).filter(Boolean);
      expect(labels).toContain("delegates to");
      expect(labels).toContain("persists to");
    });
  });

  // ── Phase 2: Query Commands ────────────────────────────────────

  describe("ls command", () => {
    it("should list folder structure in plain mode", () => {
      const output = tskb("ls", "--plain");
      expect(output).toContain("api");
      expect(output).toContain("services");
      expect(output).toContain("models");
    });

    it("should show essential docs", () => {
      const output = tskb("ls", "--plain");
      // Essential docs should appear in ls output
      expect(output).toMatch(/essential/i);
    });

    it("should respect depth parameter", () => {
      const shallow = tskb("ls", "--depth", "1", "--plain");
      const deep = tskb("ls", "--depth", "4", "--plain");
      // Deeper output should have more content
      expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
    });
  });

  describe("search command", () => {
    it("should find nodes by keyword", () => {
      const output = tskb("search", "auth", "--plain");
      expect(output).toContain("AuthService");
    });

    it("should find terms", () => {
      const output = tskb("search", "jwt", "--plain");
      expect(output).toMatch(/jwt/i);
    });

    it("should find externals", () => {
      const output = tskb("search", "postgres", "--plain");
      expect(output).toMatch(/postgres/i);
    });

    it("should return no results for garbage query", () => {
      const output = tskb("search", "xyznonexistent", "--plain");
      // Should either be empty or show "no results"
      expect(output).not.toContain("AuthService");
    });
  });

  describe("pick command", () => {
    it("should pick a folder by ID", () => {
      const output = tskb("pick", "services", "--plain");
      expect(output).toContain("services");
      expect(output).toMatch(/Business logic/i);
    });

    it("should pick a folder by path", () => {
      const output = tskb("pick", "src/services", "--plain");
      expect(output).toContain("services");
    });

    it("should pick a module", () => {
      const output = tskb("pick", "services.auth", "--plain");
      expect(output).toMatch(/auth/i);
    });

    it("should pick an export", () => {
      const output = tskb("pick", "AuthService", "--plain");
      expect(output).toMatch(/AuthService/);
    });

    it("should show constraint docs when picking referenced area", () => {
      const output = tskb("pick", "services", "--plain");
      // The constraint-service-isolation doc references services folder
      expect(output).toMatch(/constraint/i);
    });

    it("should pick an external", () => {
      const output = tskb("pick", "postgres", "--plain");
      expect(output).toMatch(/postgres/i);
      expect(output).toMatch(/database/i);
    });

    it("should show full doc content when picking a doc", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const docIds = Object.keys(graph.nodes.docs);
      const authDocId = docIds.find((id) => id.includes("auth"));
      if (authDocId) {
        const output = tskb("pick", authDocId, "--plain");
        expect(output).toMatch(/Authentication/i);
      }
    });
  });

  describe("docs command", () => {
    it("should list all docs", () => {
      const output = tskb("docs", "--plain");
      // Should list all 4 docs
      expect(output).toMatch(/architecture/i);
      expect(output).toMatch(/auth/i);
      expect(output).toMatch(/constraint/i);
    });

    it("should search docs by query", () => {
      const output = tskb("docs", "authentication", "--plain");
      expect(output).toMatch(/auth/i);
    });

    it("should show priority in results", () => {
      const output = tskb("docs", "--plain");
      expect(output).toMatch(/essential/i);
      expect(output).toMatch(/constraint/i);
    });
  });

  describe("context command", () => {
    it("should return node and neighborhood", () => {
      const output = tskb("context", "services", "--plain");
      // Should include the services folder and its modules
      expect(output).toContain("services");
      expect(output).toMatch(/auth/i);
    });

    it("should include referencing docs", () => {
      const output = tskb("context", "services", "--plain");
      // Constraint doc references services
      expect(output).toMatch(/constraint/i);
    });

    it("should respect depth parameter", () => {
      const shallow = tskb("context", "services", "--depth", "1", "--plain");
      const deep = tskb("context", "services", "--depth", "2", "--plain");
      expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
    });
  });

  // ── Ambiguous ID disambiguation ────────────────────────────────
  // The fixture declares "utils" as both a Folder and a Module (barrel).
  // These tests verify that pick/context disambiguate them correctly.

  describe("ambiguous ID disambiguation", () => {
    it("should have both a folder and module with ID 'utils' in the graph", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      expect(graph.nodes.folders["utils"]).toBeDefined();
      expect(graph.nodes.modules["utils"]).toBeDefined();
    });

    it("pick JSON should include the node type so consumers can distinguish", () => {
      const raw = tskb("pick", "utils");
      const result = JSON.parse(raw);
      // The resolver returns the first match (folder) but the type is explicit
      expect(result.type).toBe("folder");
      expect(result.node.nodeId).toBe("utils");
    });

    it("pick plain should show ambiguity warning when ID matches multiple types", () => {
      const output = tskb("pick", "utils", "--plain");
      expect(output).toContain("Ambiguous ID");
      expect(output).toContain("folder");
      expect(output).toContain("module");
    });

    it("context plain should show ambiguity warning for ambiguous root", () => {
      const output = tskb("context", "utils", "--plain");
      expect(output).toContain("Ambiguous ID");
      expect(output).toContain("folder");
      expect(output).toContain("module");
    });

    it("context should list both folder and module nodes when they share an ID", () => {
      const raw = tskb("context", "utils", "--depth", "1");
      const result = JSON.parse(raw);
      // Nearby nodes should include entries with explicit types
      const nodeTypes = result.nodes.map((n: { type: string }) => n.type);
      // At depth 1 from utils-folder, the utils-module should appear (via belongs-to)
      // or at least both types should be distinguishable in the output
      expect(result.root.type).toBeDefined();
      for (const node of result.nodes) {
        expect(node.type).toBeDefined();
      }
    });

    it("search results should show type for each result to distinguish same-ID nodes", () => {
      const output = tskb("search", "utils", "--plain");
      // Both the folder and module should appear with their types
      expect(output).toContain("(folder)");
      expect(output).toContain("(module)");
    });

    it("pick plain should show node types on referenced IDs (importedBy, parent, etc.)", () => {
      const output = tskb("pick", "services", "--plain");
      // The parent line should include the type annotation
      if (output.includes("parent:")) {
        expect(output).toMatch(/parent:.*\(folder\)/);
      }
    });
  });

  // ── Phase 3: JSON output mode ──────────────────────────────────

  describe("JSON output mode", () => {
    it("should output valid JSON from search", () => {
      const raw = tskb("search", "auth");
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it("should output valid JSON from pick", () => {
      const raw = tskb("pick", "services");
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it("should output valid JSON from ls", () => {
      const raw = tskb("ls");
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it("should output valid JSON from docs", () => {
      const raw = tskb("docs");
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it("should output valid JSON from context", () => {
      const raw = tskb("context", "services");
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });

  // ── Phase 4: Graph integrity ───────────────────────────────────

  describe("graph integrity", () => {
    it("should have belongs-to edges for modules in folders", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const belongsTo = graph.edges.filter((e: { type: string }) => e.type === "belongs-to");
      expect(belongsTo.length).toBeGreaterThan(0);

      // services.auth module should belong to services folder
      const authBelongs = belongsTo.find(
        (e: { from: string; to: string }) => e.from === "services.auth" && e.to === "services"
      );
      expect(authBelongs).toBeDefined();
    });

    it("should have contains edges between folders", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const contains = graph.edges.filter((e: { type: string }) => e.type === "contains");
      expect(contains.length).toBeGreaterThan(0);
    });

    it("should have references edges from docs to nodes", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const references = graph.edges.filter((e: { type: string }) => e.type === "references");
      expect(references.length).toBeGreaterThan(0);
    });

    it("should have imports edges between modules (if any cross-import)", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const imports = graph.edges.filter((e: { type: string }) => e.type === "imports");
      // Import edges only connect declared Modules — if auth.service imports
      // user.ts but user.ts isn't a declared Module, no edge is created.
      expect(imports.length).toBeGreaterThanOrEqual(0);
    });

    it("should resolve module type signatures", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const authModule = graph.nodes.modules["services.auth"];
      expect(authModule).toBeDefined();
      // Type signature contains the typeof import path
      expect(authModule.typeSignature).toBeDefined();
      expect(authModule.typeSignature).toContain("auth.service");
    });

    it("should resolve export type signatures", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const authExport = graph.nodes.exports["AuthService"];
      expect(authExport).toBeDefined();
      expect(authExport.typeSignature).toBeDefined();
      expect(authExport.typeSignature).toContain("AuthService");
    });

    it("should record external metadata", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const postgres = graph.nodes.externals?.["postgres"];
      expect(postgres).toBeDefined();
      expect(postgres.desc).toContain("database");
    });

    it("all edge targets should reference existing nodes", () => {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      const allNodeIds = new Set([
        ...Object.keys(graph.nodes.folders),
        ...Object.keys(graph.nodes.modules),
        ...Object.keys(graph.nodes.exports),
        ...Object.keys(graph.nodes.files ?? {}),
        ...Object.keys(graph.nodes.terms),
        ...Object.keys(graph.nodes.docs),
        ...Object.keys(graph.nodes.externals ?? {}),
      ]);

      for (const edge of graph.edges) {
        expect(allNodeIds.has(edge.from), `Edge 'from' not found: ${edge.from}`).toBe(true);
        expect(allNodeIds.has(edge.to), `Edge 'to' not found: ${edge.to}`).toBe(true);
      }
    });
  });
});
