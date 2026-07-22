import { afterEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../../src/cli/commands/init.ts";

let dir: string;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe("scaffold", () => {
  test("creates the config, oms, and actions with runnable samples", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-init-"));
    const { created } = scaffold(dir);

    expect(fs.existsSync(path.join(dir, "tsconfig.omkit.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "oms/dev.ts"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "actions/hello.ts"))).toBe(true);
    expect(created.length).toBe(3);

    const dev = fs.readFileSync(path.join(dir, "oms/dev.ts"), "utf8");
    expect(dev).toContain('from "omkit"');
    expect(dev).toContain("om(");
  });

  test("is idempotent — a second run skips existing files", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-init-"));
    scaffold(dir);
    const { created, skipped } = scaffold(dir);
    expect(created).toEqual([]);
    expect(skipped.length).toBe(3);
  });
});
