/**
 * Tests for `tskb init` — scaffolding a new project.
 *
 * Creates a temp directory, runs init, and verifies the generated files.
 * Isolated from the main fixture build.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { FIXTURE_DIR, TSKB_BIN, copyDir } from "./helpers.js";

describe("tskb init", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-init-test-"));
    copyDir(path.join(FIXTURE_DIR, "src"), path.join(tempDir, "src"));
    fs.copyFileSync(path.join(FIXTURE_DIR, "package.json"), path.join(tempDir, "package.json"));

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
    const starterPath = path.join(tempDir, "docs", "architecture.tskb.tsx");
    const originalContent = fs.readFileSync(starterPath, "utf-8");
    fs.writeFileSync(starterPath, originalContent + "\n// custom edit");

    execFileSync("node", [TSKB_BIN, "init", "--yes"], {
      cwd: tempDir,
      encoding: "utf-8",
      timeout: 15_000,
    });

    const afterRerun = fs.readFileSync(starterPath, "utf-8");
    expect(afterRerun).toContain("// custom edit");
  });
});
