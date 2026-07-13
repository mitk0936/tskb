import { describe, it, expect } from "vitest";
import { actionScope, captureConsole } from "../../src/output/log/console-capture.js";
import type { Logger, LogInput, LogEntry } from "../../src/output/log/LogsCollector.js";

/** A Logger that just records what was appended; attach/subscribe are unused no-ops. */
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

/** Patch, run `fn`, always restore — so a failing assertion never leaves console patched. */
function withCapture(logger: Logger, fn: () => void): void {
  const restore = captureConsole(logger);
  try {
    fn();
  } finally {
    restore();
  }
}

describe("captureConsole", () => {
  it("appends console.log under the 'console' source at info level", () => {
    const { entries, logger } = fakeLogger();
    withCapture(logger, () => console.log("hi"));
    expect(entries).toEqual([{ source: "console", level: "info", message: "hi" }]);
  });

  it("formats with util.format semantics (substitution + object inspection)", () => {
    const { entries, logger } = fakeLogger();
    withCapture(logger, () => {
      console.log("x=%d", 5);
      console.log({ a: 1 });
    });
    expect(entries.map((e) => e.message)).toEqual(["x=5", "{ a: 1 }"]);
  });

  it("maps each method to its level", () => {
    const { entries, logger } = fakeLogger();
    withCapture(logger, () => {
      console.info("i");
      console.debug("d");
      console.warn("w");
      console.error("e");
    });
    expect(entries.map((e) => e.level)).toEqual(["info", "debug", "warn", "error"]);
  });

  it("splits multi-line output into one entry per non-empty line", () => {
    const { entries, logger } = fakeLogger();
    withCapture(logger, () => console.log("a\nb"));
    expect(entries.map((e) => e.message)).toEqual(["a", "b"]);
  });

  it("skips output that formats to an empty string", () => {
    const { entries, logger } = fakeLogger();
    withCapture(logger, () => {
      console.log();
      console.log("");
    });
    expect(entries).toEqual([]);
  });

  it("attributes to the current action path from actionScope", () => {
    const { entries, logger } = fakeLogger();
    withCapture(logger, () => {
      actionScope.run("Build", () => console.log("hi"));
    });
    expect(entries).toEqual([{ source: "Build › console", level: "info", message: "hi" }]);
  });

  it("restore() reinstalls the original method", () => {
    const { logger } = fakeLogger();
    const original = console.log;
    const restore = captureConsole(logger);
    expect(console.log).not.toBe(original);
    restore();
    expect(console.log).toBe(original);
  });
});
