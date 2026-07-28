import { afterAll, describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeNodeLogs } from "../../src/output/writers/NodeLogWriter.ts";
import type { NodeView } from "../../src/output/writers/views.ts";

const dir = mkdtempSync(path.join(tmpdir(), "omkit-nlw-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const node = (over: Partial<NodeView>): NodeView => ({
  id: "n",
  uuid: "u",
  name: "n",
  path: "main/n",
  parentId: "main",
  tags: [],
  args: [],
  status: "ok",
  startedAt: 0,
  endedAt: 0,
  duration: 0,
  logFile: path.join(dir, "n.log"),
  children: [],
  ...over,
});

describe("node log legend", () => {
  test("the root log carries the legend; a child log does not", async () => {
    const root = node({
      id: "main",
      name: "main",
      path: "main",
      parentId: null,
      logFile: path.join(dir, "main.log"),
    });
    const child = node({
      id: "c",
      name: "probe",
      parentId: "main",
      logFile: path.join(dir, "c.log"),
    });
    await writeNodeLogs([root, child], []);

    const rootLog = readFileSync(root.logFile, "utf8");
    expect(rootLog).toContain("── legend ──");
    expect(rootLog).toContain("⚡ event");
    expect(rootLog).toContain("global sequence");

    // legend-specific text (not the dir path, which the naïve "legend" match caught)
    expect(readFileSync(child.logFile, "utf8")).not.toContain("global sequence");
  });

  test("the footer recap is appended to the root log only", async () => {
    const root = node({
      id: "main",
      name: "main",
      path: "main",
      parentId: null,
      logFile: path.join(dir, "footer-main.log"),
    });
    const child = node({
      id: "c",
      name: "probe",
      parentId: "main",
      logFile: path.join(dir, "footer-c.log"),
    });
    const footer = ["om → /run", "  asserts   → /run/asserts.log   ⊨ 3 passed · ⊭ 0 failed"];
    await writeNodeLogs([root, child], [], footer);

    const rootLog = readFileSync(root.logFile, "utf8");
    expect(rootLog).toContain("── summary ──");
    expect(rootLog).toContain("⊨ 3 passed · ⊭ 0 failed");
    // the recap closes the file, after the entries region
    expect(rootLog.trimEnd().endsWith("⊨ 3 passed · ⊭ 0 failed")).toBe(true);

    expect(readFileSync(child.logFile, "utf8")).not.toContain("── summary ──");
  });
});
