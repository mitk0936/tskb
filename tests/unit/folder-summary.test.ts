import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import childProcess from "node:child_process";
import { extractFolderSummary } from "../../packages/tskb/src/core/extraction/folder-summary.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("node:fs");
vi.mock("node:child_process");

const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockExecFileSync = vi.mocked(childProcess.execFileSync);

function fakeDirent(name: string, type: "file" | "dir"): fs.Dirent {
  return {
    name,
    isFile: () => type === "file",
    isDirectory: () => type === "dir",
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "/fake",
    parentPath: "/fake",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: git check-ignore returns nothing (no ignored files)
  mockExecFileSync.mockReturnValue("");
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("extractFolderSummary", () => {
  it("returns folders and files sorted alphabetically", () => {
    mockReaddirSync.mockReturnValue([
      fakeDirent("zebra.ts", "file"),
      fakeDirent("alpha", "dir"),
      fakeDirent("beta.ts", "file"),
      fakeDirent("mango", "dir"),
    ] as unknown as fs.Dirent[]);

    const result = extractFolderSummary("/some/path");

    expect(result).not.toBeNull();
    expect(result!.children.folders.map((f) => f.name)).toEqual(["alpha", "mango"]);
    expect(result!.children.files.map((f) => f.name)).toEqual(["beta.ts", "zebra.ts"]);
    expect(result!.summary).toBe("2 folders, 2 files");
  });

  it("excludes dotfiles and dotfolders", () => {
    mockReaddirSync.mockReturnValue([
      fakeDirent(".git", "dir"),
      fakeDirent(".env", "file"),
      fakeDirent("src", "dir"),
      fakeDirent("index.ts", "file"),
    ] as unknown as fs.Dirent[]);

    const result = extractFolderSummary("/some/path");

    expect(result!.children.folders).toEqual([{ name: "src" }]);
    expect(result!.children.files).toEqual([{ name: "index.ts" }]);
  });

  it("excludes gitignored entries", () => {
    mockReaddirSync.mockReturnValue([
      fakeDirent("src", "dir"),
      fakeDirent("node_modules", "dir"),
      fakeDirent("index.ts", "file"),
      fakeDirent("dist", "dir"),
    ] as unknown as fs.Dirent[]);

    // git check-ignore returns NUL-separated ignored paths
    mockExecFileSync.mockReturnValue("/some/path/node_modules\0/some/path/dist\0");

    const result = extractFolderSummary("/some/path");

    expect(result!.children.folders).toEqual([{ name: "src" }]);
    expect(result!.children.files).toEqual([{ name: "index.ts" }]);
    expect(result!.summary).toBe("1 folder, 1 file");
  });

  it("includes everything when git is unavailable", () => {
    mockReaddirSync.mockReturnValue([
      fakeDirent("node_modules", "dir"),
      fakeDirent("src", "dir"),
      fakeDirent("index.ts", "file"),
    ] as unknown as fs.Dirent[]);

    mockExecFileSync.mockImplementation(() => {
      throw new Error("git not found");
    });

    const result = extractFolderSummary("/some/path");

    expect(result!.children.folders.map((f) => f.name)).toEqual(["node_modules", "src"]);
    expect(result!.children.files.map((f) => f.name)).toEqual(["index.ts"]);
  });

  it("returns 'empty' summary for empty folder", () => {
    mockReaddirSync.mockReturnValue([] as unknown as fs.Dirent[]);

    const result = extractFolderSummary("/some/path");

    expect(result!.summary).toBe("empty");
    expect(result!.children.folders).toEqual([]);
    expect(result!.children.files).toEqual([]);
  });

  it("returns null for unreadable folder", () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error("EACCES");
    });

    expect(extractFolderSummary("/no/access")).toBeNull();
  });

  it("uses singular when there is 1 folder or 1 file", () => {
    mockReaddirSync.mockReturnValue([
      fakeDirent("only", "dir"),
      fakeDirent("single.ts", "file"),
    ] as unknown as fs.Dirent[]);

    const result = extractFolderSummary("/some/path");
    expect(result!.summary).toBe("1 folder, 1 file");
  });
});
