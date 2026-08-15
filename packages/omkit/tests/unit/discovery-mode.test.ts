import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import {
  setDiscovering,
  setRegistrationSink,
  type OmRegistrationMessage,
} from "../../src/core/discovery-mode.ts";

let seen: OmRegistrationMessage[] = [];

beforeEach(() => {
  seen = [];
  setRegistrationSink((r) => seen.push(r));
  setDiscovering(true);
});

afterEach(() => {
  setDiscovering(false);
  setRegistrationSink(null);
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("discovery mode", () => {
  test("an om registers and its body never runs", async () => {
    let ran = false;
    await om("disc-basic")
      .describe({ summary: "A described om" })
      .mcp()
      .run(async () => {
        ran = true;
      });

    expect(ran).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      name: "disc-basic",
      description: { summary: "A described om" },
      mcp: { mode: "settling" },
    });
    // The identity input: the file this om is defined in, with no `:line` suffix.
    expect(seen[0]!.file).toMatch(/discovery-mode\.test\.ts$/);
  });

  test("no ExecutionTree is built and no log folder is created", async () => {
    await om("disc-no-folder").run(async () => {});
    expect(ExecutionTree.current).toBeNull();
    // `new ExecutionTree(...)` creates the run folder in its constructor, so a leaked tree
    // would leave one behind. `logs/` is relative to cwd, the repo root here.
    const logs = path.resolve("logs");
    const stale = fs.existsSync(logs)
      ? fs
          .readdirSync(logs, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name.startsWith("disc-no-folder-"))
      : [];
    expect(stale).toEqual([]);
  });

  test("two oms in one file both register — the single-run guard never fires", async () => {
    await om("disc-one").run(async () => {});
    await om("disc-two").run(async () => {});
    expect(seen.map((r) => r.name)).toEqual(["disc-one", "disc-two"]);
  });

  test("an om with REQUIRED args registers without prompting and without throwing", async () => {
    // This is the test that proves the guard sits in `launch()`. `OmBuilderArgs.run`
    // resolves args *inside* the run body, so a guard placed one level higher would reach
    // `resolveArgs` first and either prompt into a child nobody can answer or fail with
    // MissingArgsError. Neither is a discovery outcome.
    await om("disc-required")
      .mcp()
      .args(z.object({ token: z.string(), rows: z.number() }))
      .run(async () => {});

    expect(seen).toHaveLength(1);
    expect(seen[0]!.inputSchema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["token", "rows"]),
    });
    expect(seen[0]!.schemaError).toBeUndefined();
  });

  test("a defaulted field is reported as not required (io: input)", async () => {
    await om("disc-defaulted")
      .mcp()
      .args(z.object({ headless: z.boolean().default(true), token: z.string() }))
      .run(async () => {});
    expect(seen[0]!.inputSchema?.required).toEqual(["token"]);
  });

  test("an unconvertible schema degrades to a reason instead of throwing", async () => {
    await om("disc-unconvertible")
      .mcp()
      .args(z.object({ at: z.date() }))
      .run(async () => {});

    expect(seen).toHaveLength(1);
    expect(seen[0]!.inputSchema).toBeUndefined();
    expect(typeof seen[0]!.schemaError).toBe("string");
  });

  test("an om with no .args() registers with no schema at all", async () => {
    await om("disc-no-args")
      .mcp()
      .run(async () => {});
    expect(seen[0]!.inputSchema).toBeUndefined();
    expect(seen[0]!.schemaError).toBeUndefined();
  });
});

describe("action.describeArgs()", () => {
  // Actions register nothing — they are read off the module's exports. `describeArgs` is
  // the conversion done *by the copy of omkit that defined the action*, so the discovery
  // child never has to convert a schema built by a different zod instance.
  const noop = async (): Promise<void> => {};

  test("converts a declared schema", () => {
    const seed = action("seed")
      .mcp()
      .args(z.object({ rows: z.number() }))
      .run(noop);
    expect(seed.describeArgs()).toEqual({
      inputSchema: expect.objectContaining({ type: "object" }),
      schemaError: undefined,
    });
  });

  test("reports a reason for an unconvertible schema instead of throwing", () => {
    const at = action("at")
      .mcp()
      .args(z.object({ when: z.date() }))
      .run(noop);
    const described = at.describeArgs();
    expect(described.inputSchema).toBeUndefined();
    expect(typeof described.schemaError).toBe("string");
  });

  test("an action with no .args() describes nothing", () => {
    expect(action("bare").run(noop).describeArgs()).toEqual({
      inputSchema: undefined,
      schemaError: undefined,
    });
  });
});
