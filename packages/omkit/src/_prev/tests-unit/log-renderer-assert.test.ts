import { describe, it, expect } from "vitest";
import { LogRenderer } from "../../src/output/log/LogRenderer.js";
import type { LogEntry } from "../../src/output/log/LogsCollector.js";

const entry = (over: Partial<LogEntry>): LogEntry => ({
  sequence: 1,
  timestamp: 0,
  source: "assert",
  level: "info",
  message: "",
  ...over,
});

describe("LogRenderer assert milestone", () => {
  it("renders an assert entry as its own ⊨ marker line", () => {
    const renderer = new LogRenderer();
    const line = renderer.render(
      entry({ level: "assert", message: "Explorer · ✗ sidebar visible" })
    );
    expect(line).toBe("⊨ Explorer · ✗ sidebar visible");
  });

  it("breaks grouping: an action line after an assert re-headers", () => {
    const renderer = new LogRenderer();
    renderer.render(entry({ source: "Build", level: "info", message: "step 1" }));
    renderer.render(entry({ level: "assert", message: "Build · ✓ ok" }));
    const after = renderer.render(entry({ source: "Build", level: "info", message: "step 2" }));
    expect(after).toBe("▸ Build\n\tstep 2");
  });
});
