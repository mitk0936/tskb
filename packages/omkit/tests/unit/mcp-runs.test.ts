import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectServer, fixtureClient, textOf, waitForSettled } from "../support/mcp-harness.ts";
import type { OmkitClient } from "../../src/client/index.ts";

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-mcp-runs-"));

// One discovery fork for the file; each test still gets its own server and transport.
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

describe("start_om", () => {
  test("returns a handle immediately for a long-lived om", async () => {
    open = await connectServer(client, workdir);
    const started = Date.now();
    const result = await open.callTool({ name: "start_om", arguments: { name: "waits" } });
    const handle = result.structuredContent as {
      runId: string;
      folderName: string;
      mode: string;
    };

    expect(handle.runId).toMatch(/^[0-9a-f]{8}$/);
    expect(handle.folderName).toMatch(/^waits-[0-9a-f]{8}$/);
    expect(handle.mode).toBe("long-lived");
    // "Immediately" means it did not wait for the run: `waits` never settles on its own.
    expect(Date.now() - started).toBeLessThan(20_000);

    await open.callTool({ name: "cancel_run", arguments: { runId: handle.runId } });
  }, 60_000);

  test("accepts a settling om too — 'start this and come back' is a valid use", async () => {
    open = await connectServer(client, workdir);
    const result = await open.callTool({
      name: "start_om",
      arguments: { name: "settles", args: { rows: 1 } },
    });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { mode: string }).mode).toBe("settling");
  }, 60_000);

  test("rejects bad args before starting anything", async () => {
    open = await connectServer(client, workdir);
    const result = await open.callTool({ name: "start_om", arguments: { name: "settles" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/missing required argument "rows"/);
  }, 60_000);
});

describe("get_run", () => {
  test("reports a live run as running, then its verdict once settled", async () => {
    open = await connectServer(client, workdir);
    const started = (
      await open.callTool({ name: "start_om", arguments: { name: "settles", args: { rows: 1 } } })
    ).structuredContent as { runId: string };

    const settled = await waitForSettled(open, started.runId);
    expect(settled.ok).toBe(true);
    expect(fs.existsSync(path.join(settled.folder, "result.json"))).toBe(true);
  }, 60_000);

  test("a running run reports no folder — the dated one does not exist yet", async () => {
    open = await connectServer(client, workdir);
    const handle = (await open.callTool({ name: "start_om", arguments: { name: "waits" } }))
      .structuredContent as { runId: string };

    const seen = (await open.callTool({ name: "get_run", arguments: { run: handle.runId } }))
      .structuredContent as { status: string; folder: string };
    expect(seen.status).toBe("running");
    expect(seen.folder).toBe("");

    await open.callTool({ name: "cancel_run", arguments: { runId: handle.runId } });
  }, 60_000);

  test("an unknown handle is a tool error, not a crash", async () => {
    open = await connectServer(client, workdir);
    const result = await open.callTool({ name: "get_run", arguments: { run: "deadbeef" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/no run/);
  }, 60_000);
});

describe("resources", () => {
  test("get_run returns resource links, and the latest template reads one back", async () => {
    open = await connectServer(client, workdir);
    const handle = (
      await open.callTool({ name: "start_om", arguments: { name: "settles", args: { rows: 1 } } })
    ).structuredContent as { runId: string; folderName: string };
    await waitForSettled(open, handle.runId);

    const settled = await open.callTool({ name: "get_run", arguments: { run: handle.runId } });
    const links = (settled.content as Array<{ type: string; uri?: string; name?: string }>).filter(
      (c) => c.type === "resource_link"
    );
    expect(links.map((l) => l.name)).toContain("main.log");
    expect(links.every((l) => l.uri!.startsWith("omkit://runs/"))).toBe(true);

    // The payoff of the run-folder-identity contract: `latest` resolves without anyone
    // having to know the dated path.
    const read = await open.readResource({
      uri: `omkit://runs/${handle.folderName}/latest/main.log`,
    });
    const contents = read.contents as Array<{ text?: string; mimeType?: string }>;
    expect(contents[0]!.mimeType).toBe("text/plain");
    expect(contents[0]!.text).toContain("main");
  }, 60_000);

  test("both URI templates are advertised", async () => {
    open = await connectServer(client, workdir);
    const { resourceTemplates } = await open.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate).sort()).toEqual([
      "omkit://runs/{run}/latest/{file}",
      "omkit://runs/{run}/{date}/{time}/{file}",
    ]);
  }, 60_000);

  test("reading outside logs/ is refused rather than served", async () => {
    open = await connectServer(client, workdir);
    // `{run}` cannot contain a slash per the URI template, so the traversal is attempted
    // in the one place it could reach — and confinement still refuses it.
    await expect(
      open.readResource({ uri: "omkit://runs/..%2F..%2Fetc/latest/passwd" })
    ).rejects.toThrow();
  }, 60_000);
});

describe("tail_run", () => {
  test("pages a settled run's log from a cursor", async () => {
    open = await connectServer(client, workdir);
    const handle = (
      await open.callTool({ name: "start_om", arguments: { name: "settles", args: { rows: 1 } } })
    ).structuredContent as { runId: string };
    await waitForSettled(open, handle.runId);

    const first = (
      await open.callTool({ name: "tail_run", arguments: { run: handle.runId, limit: 2 } })
    ).structuredContent as {
      entries: Array<{ sequence: number; message: string }>;
      nextCursor: number;
      status: string;
    };
    expect(first.status).toBe("settled");
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).toBe(first.entries[1]!.sequence);

    // Resuming from nextCursor never repeats a line already returned.
    const second = (
      await open.callTool({
        name: "tail_run",
        arguments: { run: handle.runId, cursor: first.nextCursor, limit: 100 },
      })
    ).structuredContent as { entries: Array<{ sequence: number }> };
    expect(second.entries.every((e) => e.sequence > first.nextCursor)).toBe(true);
  }, 60_000);

  test("reads from the live buffer while the run is still going", async () => {
    open = await connectServer(client, workdir);
    const handle = (await open.callTool({ name: "start_om", arguments: { name: "waits" } }))
      .structuredContent as { runId: string };

    // `waits` logs "up" and then blocks, so entries exist well before it settles.
    let seen: { entries: unknown[]; status: string } = { entries: [], status: "running" };
    for (let i = 0; i < 40 && seen.entries.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      seen = (await open.callTool({ name: "tail_run", arguments: { run: handle.runId } }))
        .structuredContent as { entries: unknown[]; status: string };
    }
    expect(seen.status).toBe("running");
    expect(seen.entries.length).toBeGreaterThan(0);

    await open.callTool({ name: "cancel_run", arguments: { runId: handle.runId } });
  }, 60_000);

  test("an unknown handle is a tool error", async () => {
    open = await connectServer(client, workdir);
    const result = await open.callTool({ name: "tail_run", arguments: { run: "deadbeef" } });
    expect(result.isError).toBe(true);
  }, 60_000);
});

describe("cancel_run", () => {
  test("tears a long-lived run down and it still writes its folder", async () => {
    open = await connectServer(client, workdir);
    const handle = (await open.callTool({ name: "start_om", arguments: { name: "waits" } }))
      .structuredContent as { runId: string };

    const cancelled = await open.callTool({
      name: "cancel_run",
      arguments: { runId: handle.runId },
    });
    expect(cancelled.isError).toBeFalsy();
    expect((cancelled.structuredContent as { cancelled: boolean }).cancelled).toBe(true);

    // Cancellation is a teardown, not a kill: the run still narrates itself to disk.
    const settled = await waitForSettled(open, handle.runId);
    expect(fs.existsSync(path.join(settled.folder, "main.log"))).toBe(true);
  }, 60_000);

  test("cancelling an already-settled run reports false rather than erroring", async () => {
    open = await connectServer(client, workdir);
    const handle = (
      await open.callTool({ name: "start_om", arguments: { name: "settles", args: { rows: 1 } } })
    ).structuredContent as { runId: string };
    await waitForSettled(open, handle.runId);

    const result = await open.callTool({ name: "cancel_run", arguments: { runId: handle.runId } });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { cancelled: boolean }).cancelled).toBe(false);
  }, 60_000);

  test("an unknown handle is a tool error", async () => {
    open = await connectServer(client, workdir);
    const result = await open.callTool({ name: "cancel_run", arguments: { runId: "deadbeef" } });
    expect(result.isError).toBe(true);
  }, 60_000);
});
