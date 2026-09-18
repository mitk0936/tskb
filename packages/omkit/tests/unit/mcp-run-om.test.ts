import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.ts";
import { createOmkitClient, readRegistrations } from "../../src/client/index.ts";
import type { OmkitClient } from "../../src/client/index.ts";
import type { RegistrationSet } from "../../src/client/registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "../fixtures/registrations");
// Runs land in `<root>/logs`, so give them a throwaway root rather than the repo.
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-mcp-run-"));

const fixtureFiles = ["oms/exposed.ts", "oms/hidden.ts", "oms/settles.ts", "oms/fails.ts"].map(
  (f) => path.join(fixtures, f)
);

/**
 * A real client with only `discoverRegistrations` overridden: the set comes from a real
 * fork over the fixtures, and `run` is untouched, so these tests fork real oms and read
 * back real verdicts. The override exists because the AST scan matches the literal
 * `"omkit"` and these fixtures import omkit relatively — not because anything is faked.
 */
let set: RegistrationSet;
beforeAll(async () => {
  set = await readRegistrations(fixtureFiles);
}, 40_000);

afterAll(() => {
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

async function connect(registrations: RegistrationSet = set): Promise<Client> {
  const real = createOmkitClient({ tsconfig: path.join(fixtures, "tsconfig.omkit.json") });
  const omkit: OmkitClient = { ...real, discoverRegistrations: async () => registrations };
  const server = createMcpServer({ client: omkit, root: workdir });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test", version: "0" });
  await Promise.all([mcp.connect(ct), server.connect(st)]);
  return mcp;
}

let open: Client | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

/**
 * The text a tool result carries. Read the block rather than stringifying the whole
 * result: JSON.stringify escapes the quotes omkit puts around an argument name, so
 * `missing required argument "rows"` becomes `...\"rows\"` and a plain regex misses it.
 */
const textOf = (result: { content?: unknown }): string =>
  ((result.content ?? []) as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");

describe("run_om", () => {
  test("runs a settling om and returns its verdict", async () => {
    open = await connect();
    const result = await open.callTool({
      name: "run_om",
      arguments: { name: "settles", args: { rows: 2 } },
    });
    expect(result.isError).toBeFalsy();
    const verdict = result.structuredContent as {
      ok: boolean;
      folder: string;
      assertions: { passed: number; failed: number };
    };
    expect(verdict.ok).toBe(true);
    expect(verdict.assertions.passed).toBe(1);
    expect(fs.existsSync(path.join(verdict.folder, "result.json"))).toBe(true);
  }, 60_000);

  test("the run folder lands under the server's root, where resources will look for it", async () => {
    open = await connect();
    const result = await open.callTool({
      name: "run_om",
      arguments: { name: "settles", args: { rows: 1 } },
    });
    const { folder } = result.structuredContent as { folder: string };
    // Not the om file's directory — `<root>/logs`, or `omkit://runs/...` would resolve
    // to nothing for a run this very server started.
    expect(fs.realpathSync(folder).startsWith(fs.realpathSync(path.join(workdir, "logs")))).toBe(
      true
    );
  }, 60_000);

  test("a failing om reports ok:false with its failures, not a thrown error", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "fails" } });
    expect(result.isError).toBeFalsy();
    const verdict = result.structuredContent as {
      ok: boolean;
      failures: Array<{ action: string; error: string }>;
    };
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.length).toBeGreaterThan(0);
  }, 60_000);

  test("refuses a long-lived om and names start_om", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "exposed" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/start_om/);
  }, 60_000);

  test("refuses an om that never called .mcp()", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "hidden" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/no om or action/);
  }, 60_000);

  test("rejects missing required args before spawning anything", async () => {
    open = await connect();
    const result = await open.callTool({ name: "run_om", arguments: { name: "settles" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/missing required argument "rows"/);
  }, 60_000);
});

describe("the settling backstop", () => {
  test("an om declared settling that never settles is cancelled and reported", async () => {
    // `mislabelled` says `mode: "settling"` but behaves like a daemon. Without a backstop
    // the tool call blocks until the *client* gives up, which surfaces as a transport
    // timeout with no run folder and nothing to read. The backstop turns an author's
    // mistake into a message that names it.
    const registrations = await readRegistrations([path.join(fixtures, "oms/mislabelled.ts")]);
    open = await connect(registrations);
    const result = await open.callTool(
      { name: "run_om", arguments: { name: "mislabelled", settleTimeoutMs: 3000 } },
      undefined,
      { timeout: 120_000 }
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/did not settle/);
    expect(textOf(result)).toMatch(/long-lived/);
  }, 120_000);
});
