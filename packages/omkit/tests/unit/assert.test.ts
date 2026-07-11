import { describe, it, expect, vi } from "vitest";
import { createAssert, AssertionError } from "../../src/output/log/assert.js";
import type { Logger, LogInput, LogEntry } from "../../src/output/log/LogsCollector.js";

/** A Logger that records appends; attach/subscribe are unused no-ops. */
function fakeLogger(): { entries: LogInput[]; logger: Logger } {
  const entries: LogInput[] = [];
  const logger: Logger = {
    append: (e) => entries.push(e),
    attach: () => {},
    subscribe: () =>
      (async function* (): AsyncGenerator<LogEntry> {
        /* no entries */
      })(),
  };
  return { entries, logger };
}

describe("createAssert", () => {
  it("logs a ✓ line and reports a pass (no error) when value is true", () => {
    const { entries, logger } = fakeLogger();
    const onResult = vi.fn();
    const assert = createAssert("Explorer", logger, onResult);

    const result = assert(true, "page loaded");

    expect(result).toBe(true);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(true, undefined);
    expect(entries).toEqual([
      { source: "assert", level: "assert", message: "Explorer · ✓ page loaded" },
    ]);
  });

  it("logs a ✗ line and reports a fail with an AssertionError when value is false", () => {
    const { entries, logger } = fakeLogger();
    const onResult = vi.fn();
    const assert = createAssert("Explorer", logger, onResult);

    const result = assert(false, "sidebar visible");

    expect(result).toBe(false);
    expect(entries).toEqual([
      {
        source: "assert",
        level: "assert",
        message: "Explorer · ✗ sidebar visible",
      },
    ]);
    expect(onResult).toHaveBeenCalledTimes(1);
    const [pass, error] = onResult.mock.calls[0];
    expect(pass).toBe(false);
    expect(error).toBeInstanceOf(AssertionError);
    expect(error.message).toContain("sidebar visible");
  });

  it("returns the pass boolean so callers can branch", () => {
    const { logger } = fakeLogger();
    const assert = createAssert("A", logger, vi.fn());
    expect(assert(true, "x")).toBe(true);
    expect(assert(false, "y")).toBe(false);
  });
});
