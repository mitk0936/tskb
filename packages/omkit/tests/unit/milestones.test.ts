import { describe, expect, test } from "vitest";
import { format } from "../../src/output/milestones.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const e = (level: string, source: string, message: string, path = "main"): LogEntry =>
  ({ nodeId: path, path, level, source, message }) as unknown as LogEntry;

describe("format", () => {
  test("an action launch renders a ▶ pointer", () => {
    expect(format(e("child", "launch", "→ probe_1 · log"))?.text).toBe("▶ main/probe_1");
  });

  test("a failed lifecycle persists with a ✗", () => {
    const r = format(e("event", "lifecycle", "done · failed"));
    expect(r?.text).toContain("✗");
    expect(r?.persist).toBe(true);
  });

  test("an error shows only its first line", () => {
    const r = format(e("error", "error", "boom\nmore"));
    expect(r?.text).toContain("✗ main · boom");
    expect(r?.text).not.toContain("more");
  });

  test("tags decorate the node name", () => {
    const r = format(e("event", "ev", "ping", "main/hc_1"), ["ready"]);
    expect(r?.text).toBe("⚡ main/hc_1 [ready] · ping");
  });

  test("info/console entries are not milestones", () => {
    expect(format(e("info", "console", "hello"))).toBeNull();
  });
});
