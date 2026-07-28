import { describe, expect, test } from "vitest";
import { parseCli } from "../../src/cli/index.ts";
import { inspectArgs } from "../../src/client/runner.ts";

describe("parseCli — inspect flags", () => {
  test("no inspect flag → no inspector", () => {
    const p = parseCli(["run", "oms/dev.ts"]);
    expect(p.inspect).toBeUndefined();
  });

  test("--inspect enables the inspector on the default port", () => {
    const p = parseCli(["run", "oms/dev.ts", "--inspect"]);
    expect(p.inspect).toEqual({ port: 9229 });
  });

  test("Node-style inline port: --inspect=9191", () => {
    const p = parseCli(["--inspect=9191"]);
    expect(p.inspect).toEqual({ port: 9191 });
  });

  test("the inspect flag doesn't swallow the command or target", () => {
    const p = parseCli(["run", "tskb:dev", "--inspect=9191"]);
    expect(p.command).toBe("run");
    expect(p.target).toBe("tskb:dev");
    expect(p.inspect).toEqual({ port: 9191 });
  });
});

describe("inspectArgs — child execArgv assembly", () => {
  test("no inspect options → no extra args", () => {
    expect(inspectArgs(undefined)).toEqual([]);
  });

  test("inspect → --inspect=<port>", () => {
    expect(inspectArgs({ port: 9229 })).toEqual(["--inspect=9229"]);
  });
});
