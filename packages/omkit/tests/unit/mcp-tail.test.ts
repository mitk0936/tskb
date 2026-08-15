import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tailFile, tailLive } from "../../src/mcp/tail.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const entry = (sequence: number, message: string): LogEntry => ({
  sequence,
  ts: 0,
  nodeId: "main",
  path: "main",
  level: "info",
  source: "run",
  message,
});

describe("tailLive", () => {
  const run = {
    entries: [entry(1, "one"), entry(2, "two"), entry(3, "three")],
    dropped: 0,
  };

  test("returns everything after the cursor and reports where to resume", () => {
    expect(tailLive(run, 1, 10)).toEqual({
      entries: [entry(2, "two"), entry(3, "three")],
      nextCursor: 3,
      dropped: 0,
    });
  });

  test("a cursor at the end returns nothing and holds its place", () => {
    expect(tailLive(run, 3, 10)).toEqual({ entries: [], nextCursor: 3, dropped: 0 });
  });

  test("caps at the limit and resumes from the last entry it returned", () => {
    expect(tailLive(run, 0, 2)).toEqual({
      entries: [entry(1, "one"), entry(2, "two")],
      nextCursor: 2,
      dropped: 0,
    });
  });

  test("reports the buffer's low-water mark so a lagging client knows it missed lines", () => {
    expect(tailLive({ entries: [entry(90, "late")], dropped: 89 }, 0, 10).dropped).toBe(89);
  });
});

describe("tailFile", () => {
  test("reads a settled run's raw.jsonl from the cursor, skipping unparseable lines", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-tail-"));
    fs.writeFileSync(
      path.join(dir, "raw.jsonl"),
      [JSON.stringify(entry(1, "one")), "{ not json", JSON.stringify(entry(2, "two")), ""].join(
        "\n"
      ),
      "utf8"
    );
    // A partially-written line is normal: the file is appended to live, and a tail may
    // catch it mid-write. Skipping beats failing the whole call.
    expect(tailFile(dir, 1, 10)).toEqual({
      entries: [entry(2, "two")],
      nextCursor: 2,
      dropped: 0,
    });
  });

  test("caps at the limit", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-tail-limit-"));
    const lines = [1, 2, 3, 4, 5].map((n) => JSON.stringify(entry(n, `line ${n}`)));
    fs.writeFileSync(path.join(dir, "raw.jsonl"), lines.join("\n"), "utf8");
    const tail = tailFile(dir, 0, 2);
    expect(tail.entries.map((e) => e.sequence)).toEqual([1, 2]);
    expect(tail.nextCursor).toBe(2);
  });

  test("a folder with no raw.jsonl reads as empty rather than throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-tail-empty-"));
    expect(tailFile(dir, 0, 10)).toEqual({ entries: [], nextCursor: 0, dropped: 0 });
  });
});
