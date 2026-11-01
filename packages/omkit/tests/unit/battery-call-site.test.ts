import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { command } from "../../src/actions/command.ts";
import { pollUntil } from "../../src/actions/poll-until.ts";
import { portFree } from "../../src/actions/port-free.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

/** The line after the one `lineOf()` is called on — where the call under test is written. */
const lineOf = (): number => {
  const frames = [...new Error().stack!.matchAll(/battery-call-site\.test\.ts:(\d+)/g)];
  return Number(frames[1]![1]) + 1; // [0] is this helper, [1] its caller
};
const calledAt = (name: string) =>
  ExecutionTree.last!.runViewForTest().root.children.find((c) => c.name === name)?.calledAt;

// Batteries built inside a factory (named per call) launch from omkit's own file; the node must
// still record the user's line, or the report loses the `x = battery(…)` label and call site.
describe("battery calledAt is the user's call, not the battery's file", () => {
  test("pollUntil", async () => {
    let line = 0;
    await om("call-site").run(async () => {
      line = lineOf();
      await pollUntil("ready", () => true).result;
    });
    expect(calledAt("ready")).toMatch(new RegExp(`battery-call-site\.test\.ts:${line}$`));
  });

  test("command (shell form)", async () => {
    let line = 0;
    await om("call-site").run(async () => {
      line = lineOf();
      await command("node -e 0").result;
    });
    expect(calledAt("node -e 0")).toMatch(new RegExp(`battery-call-site\.test\.ts:${line}$`));
  });

  test("command (direct-exec form)", async () => {
    let line = 0;
    await om("call-site").run(async () => {
      line = lineOf();
      await command(process.execPath, { args: ["-e", "0"] }).result;
    });
    expect(calledAt(`${process.execPath} -e 0`)).toMatch(
      new RegExp(`battery-call-site\.test\.ts:${line}$`)
    );
  });

  test("portFree (a module-level battery) — the control", async () => {
    let line = 0;
    await om("call-site").run(async () => {
      line = lineOf();
      await portFree(1, { timeoutMs: 2000 }).result;
    });
    expect(calledAt("portFree")).toMatch(new RegExp(`battery-call-site\.test\.ts:${line}$`));
  });
});

const argsOf = (name: string) =>
  ExecutionTree.last!.runViewForTest().root.children.find((c) => c.name === name)?.args;

// The report's `x = battery(…)` label and its Args tab come from the recorded args.
describe("factory batteries record the call's args", () => {
  test("pollUntil records description, predicate and options", async () => {
    const predicate = () => true;
    await om("call-args").run(async () => {
      await pollUntil("ready", predicate, { intervalMs: 5 }).result;
    });
    expect(argsOf("ready")).toEqual(["ready", "[Function predicate]", { intervalMs: 5 }]);
  });

  test("command records the command and its options, but never env", async () => {
    await om("call-args").run(async () => {
      await command(process.execPath, {
        args: ["-e", "0"],
        cwd: ".",
        env: { ...process.env, SECRET_TOKEN: "do-not-record" },
      }).result;
    });
    const args = argsOf(`${process.execPath} -e 0`);
    expect(args).toEqual([process.execPath, { args: ["-e", "0"], cwd: "." }]);
    expect(JSON.stringify(args)).not.toContain("do-not-record");
  });
});
