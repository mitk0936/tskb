import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { SpinHost } from "../../src/orchestration/spin/SpinHost.js";
import { action } from "../../src/orchestration/action/action.js";

// RunFolder derives its `logs/<name>/…` folder from the entry-script basename
// (process.argv[1]). Under Vitest every parallel worker shares the basename
// "forks", so separate test files would all write into the same second-stamped run
// folder and delete each other's files mid-run. Stub the name to one dedicated to
// this file, and clean up only that subtree — isolating this file's runs entirely.
const LOGS_NAME = "spin-console-capture-test";
let savedArgv1: string;
beforeAll(() => {
  savedArgv1 = process.argv[1];
  process.argv[1] = LOGS_NAME;
});
afterAll(() => {
  process.argv[1] = savedArgv1;
  fs.rmSync(`logs/${LOGS_NAME}`, { recursive: true, force: true });
});

describe("SpinHost console capture", () => {
  it("attributes a top-level action's console output to its path", async () => {
    const speaker = action("Speaker").run(() => {
      console.log("hello");
      console.warn("careful");
    });
    const host = new SpinHost(speaker());
    await host.done;

    const entries = host.logs.snapshot();
    expect(entries).toContainEqual(
      expect.objectContaining({ source: "Speaker › console", level: "info", message: "hello" })
    );
    expect(entries).toContainEqual(
      expect.objectContaining({ source: "Speaker › console", level: "warn", message: "careful" })
    );
  });

  it("attributes a nodded child's console output to the parent › child path", async () => {
    const child = action("Child").run(() => {
      console.log("deep");
    });
    const parent = action("Parent").run((ctx) => {
      ctx.nod(child());
    });
    const host = new SpinHost(parent());
    await host.done;

    expect(host.logs.snapshot()).toContainEqual(
      expect.objectContaining({
        source: "Parent › Child › console",
        level: "info",
        message: "deep",
      })
    );
  });

  it("does not feedback-loop: one console.log yields exactly one console entry", async () => {
    const speaker = action("Once").run(() => {
      console.log("solo");
    });
    const host = new SpinHost(speaker());
    await host.done; // resolving at all proves the drain didn't loop forever

    const consoleEntries = host.logs.snapshot().filter((e) => e.source.endsWith("console"));
    expect(consoleEntries).toHaveLength(1);
    expect(consoleEntries[0].message).toBe("solo");
  });

  it("restores console.log after the run finalizes", async () => {
    const original = console.log;
    const noop = action("Noop").run(() => {});
    const host = new SpinHost(noop());
    await host.done;

    expect(console.log).toBe(original);
  });
});
