/**
 * Tests for `tskb explore --export`: validates the exported chunk files,
 * including ordering invariants applied by the explorer transform.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { tskb } from "./helpers.js";

let exportDir: string;

beforeAll(() => {
  exportDir = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-explorer-"));
  tskb("explore", "--export", exportDir);
});

afterAll(() => {
  if (exportDir && fs.existsSync(exportDir)) {
    fs.rmSync(exportDir, { recursive: true, force: true });
  }
});

describe("explorer export", () => {
  it("should write a meta.json chunk", () => {
    const metaPath = path.join(exportDir, "chunks", "meta.json");
    expect(fs.existsSync(metaPath)).toBe(true);
  });

  it("should sort externals alphabetically in meta.json", () => {
    // The fixture declares mailgun AFTER postgres in vocabulary.tskb.tsx, so
    // any sort that just preserves insertion order would put postgres first.
    // The transform must sort alphabetically (case-insensitive by id).
    const meta = JSON.parse(fs.readFileSync(path.join(exportDir, "chunks", "meta.json"), "utf-8"));
    expect(Array.isArray(meta.externals)).toBe(true);
    expect(meta.externals.length).toBeGreaterThanOrEqual(2);

    const ids: string[] = meta.externals.map((e: { id: string }) => e.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    expect(ids).toEqual(sorted);

    // Spot-check the specific fixture pair
    const mailgunIdx = ids.indexOf("mailgun");
    const postgresIdx = ids.indexOf("postgres");
    expect(mailgunIdx).toBeGreaterThan(-1);
    expect(postgresIdx).toBeGreaterThan(-1);
    expect(mailgunIdx).toBeLessThan(postgresIdx);
  });
});
