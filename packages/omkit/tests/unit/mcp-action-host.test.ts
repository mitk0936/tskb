import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { hostFolderName, hostOmName } from "../../src/mcp/action-identity.ts";
import { connectServer, fixtureClient, waitForSettled } from "../support/mcp-harness.ts";
import type { OmkitClient } from "../../src/client/index.ts";

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-host-"));

let client: OmkitClient;
beforeAll(async () => {
  client = await fixtureClient();
}, 40_000);

afterAll(() => {
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

let open: Client | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("action-backed tools", () => {
  test("run_om runs an exposed action through the shipped host om", async () => {
    open = await connectServer(client, workdir);
    const result = await open.callTool({
      name: "run_om",
      arguments: { name: "seed", args: { rows: 7 } },
    });
    expect(result.isError).toBeFalsy();
    const verdict = result.structuredContent as {
      ok: boolean;
      folder: string;
      assertions: { passed: number; failed: number };
    };
    // The action asserts on the rows it was handed, so a passing assert proves the args
    // travelled: server → OMKIT_ACTION_ARGS → host → the action's own parameter.
    expect(verdict.ok).toBe(true);
    expect(verdict.assertions.passed).toBe(1);
    // It lands in the same logs/ tree as an om's run, under the server's root.
    expect(fs.realpathSync(verdict.folder).startsWith(fs.realpathSync(path.join(workdir, "logs")))) //
      .toBe(true);
  }, 60_000);

  test("the folder name the server predicts is the folder the run actually creates", async () => {
    // `start_om` has to answer before the child exists, so it derives the folder name from
    // the same rule the runtime applies. This is the test that catches the derivation
    // drifting from `RunFolder.name()` — including `fsSafe` turning the `@` into a `-`.
    open = await connectServer(client, workdir);
    const handle = (
      await open.callTool({ name: "start_om", arguments: { name: "seed", args: { rows: 1 } } })
    ).structuredContent as { runId: string; folderName: string };
    const settled = await waitForSettled(open, handle.runId);

    expect(path.basename(path.resolve(settled.folder, "../.."))).toBe(handle.folderName);
  }, 60_000);

  test("identity is stable across runs, so 'latest' keeps working", async () => {
    open = await connectServer(client, workdir);
    const folders: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const handle = (
        await open.callTool({ name: "start_om", arguments: { name: "seed", args: { rows: 1 } } })
      ).structuredContent as { runId: string };
      folders.push((await waitForSettled(open, handle.runId)).folder);
    }
    // Same folder family across runs — that is what makes `omkit://runs/<family>/latest/…`
    // resolve to "the last time this ran".
    //
    // Deliberately NOT asserting the two dated folders differ: run folders are stamped
    // `<date>/<time>` at second resolution (RunFolder → `hms`), so two runs inside the
    // same second genuinely share one folder and the later overwrites the earlier. That
    // is pre-existing omkit behaviour, not something this server introduces, and an
    // assistant firing runs back-to-back will hit it.
    expect(path.basename(path.resolve(folders[0]!, "../.."))).toBe(
      path.basename(path.resolve(folders[1]!, "../.."))
    );
  }, 90_000);

  test("an action whose schema will not convert is refused, not run", async () => {
    open = await connectServer(client, workdir);
    // `at` declares `z.date()`, so it listed as unavailable rather than callable.
    const result = await open.callTool({ name: "run_om", arguments: { name: "at" } });
    expect(result.isError).toBe(true);
  }, 60_000);
});

describe("host identity", () => {
  test("same-named actions in different files get different host names", () => {
    // The suffix hashes the action's *defining file*, so the two never share a folder.
    expect(hostOmName("seed", "/a/seed.ts")).not.toBe(hostOmName("seed", "/b/seed.ts"));
    expect(hostFolderName("seed", "/a/seed.ts")).not.toBe(hostFolderName("seed", "/b/seed.ts"));
  });

  test("the folder name is filesystem-safe — the @ does not survive to disk", () => {
    expect(hostOmName("seed", "/a/seed.ts")).toMatch(/^seed@[0-9a-f]{8}$/);
    expect(hostFolderName("seed", "/a/seed.ts")).toMatch(/^seed-[0-9a-f]{8}-[0-9a-f]{8}$/);
  });
});
