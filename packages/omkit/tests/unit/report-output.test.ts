import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { action, om, step } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

// A 1×1 transparent PNG — enough bytes to prove an image travels into the page as base64.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

let root: string;
let previousRoot: string | undefined;

beforeEach(() => {
  previousRoot = process.env.OMKIT_ROOT;
  root = mkdtempSync(path.join(tmpdir(), "omkit-report-"));
  process.env.OMKIT_ROOT = root;
});

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
  if (previousRoot === undefined) delete process.env.OMKIT_ROOT;
  else process.env.OMKIT_ROOT = previousRoot;
  rmSync(root, { recursive: true, force: true });
});

interface NodeMeta {
  description?: { summary: string };
  mcp?: { mode: string };
  inputSchema?: unknown;
  calledAt?: string;
}

interface Payload {
  name: string;
  run: {
    ok: boolean;
    root: { children: { name: string; definedAt?: string; calledAt?: string }[] };
  };
  entries: { level: string; message: string }[];
  snapshots: { name: string; value: unknown }[];
  sources: Record<string, string>;
  code: Record<string, { start: number; text: string; lang: string }>;
  files: { name: string; curated: boolean; asset?: string; mime: string }[];
}

async function readReport(): Promise<{ html: string; payload: Payload }> {
  const html = await readFile(path.join(ExecutionTree.last!.folder.path(), "report.html"), "utf8");
  const match = /<script id="omkit-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  expect(match).not.toBeNull();
  return { html, payload: JSON.parse(match![1]!) as Payload };
}

describe("report.html", () => {
  test("every run writes one, carrying the run view and its timeline", async () => {
    await om("report-basic").run(async (ctx) => {
      await step("child", async (c) => {
        c.assert(true, "it holds");
        console.log("hello from child");
      });
      await ctx.snapshot("state", { answer: 42 });
    });

    const { html, payload } = await readReport();
    expect(payload.name).toBe("report-basic");
    expect(payload.run.ok).toBe(true);
    expect(payload.run.root.children.map((c) => c.name)).toEqual(["child"]);
    // a step is defined where it is written — this file — not inside omkit's step()
    const child = payload.run.root.children[0]!;
    expect(child.definedAt).toMatch(/report-output\.test\.ts:\d+$/);
    expect(child.calledAt).toBe(child.definedAt);
    expect(child).toMatchObject({ kind: "step" });
    expect(payload.entries.some((e) => e.message === "hello from child")).toBe(true);
    expect(payload.snapshots).toEqual([
      expect.objectContaining({ name: "state", value: { answer: 42 } }),
    ]);
    // each definition site maps to a copyable file path: forward slashes, no line number
    const sources = Object.values(payload.sources);
    expect(sources.some((src) => src.endsWith("tests/unit/report-output.test.ts"))).toBe(true);
    for (const src of sources) expect(src).not.toMatch(/\\|:\d+$/);
    // …and to the definition's own source: the whole om(...).run(...) statement, not a guess
    const code = Object.values(payload.code);
    expect(
      code.some(
        (c) => c.text.includes('om("report-basic").run(') && c.text.includes("hello from child")
      )
    ).toBe(true);
    // the loader is in the markup before any script, and d3 + the viewer are inlined
    expect(html.indexOf('id="loader"')).toBeLessThan(html.indexOf("<script"));
    expect(html).toContain("d3js.org");
    expect(html).toContain("omkit run report");
  });

  test("images are embedded as base64 blocks, curated or not", async () => {
    await om("report-images").run(async (ctx) => {
      const shot = path.join(ctx.artifactsFolder, "shot.png");
      writeFileSync(shot, PNG);
      ctx.artifact("shot", shot, { description: "a screenshot" });
      writeFileSync(path.join(ctx.artifactsFolder, "stray.png"), PNG);
    });

    const { html, payload } = await readReport();
    const shot = payload.files.find((f) => f.name === "shot")!;
    const stray = payload.files.find((f) => f.name === "stray.png")!;
    expect(shot).toMatchObject({ curated: true, mime: "image/png" });
    expect(stray).toMatchObject({ curated: false, mime: "image/png" });
    expect(html).toContain(
      `id="${shot.asset}" data-mime="image/png">${PNG.toString("base64")}</script>`
    );
    expect(html).toContain(`id="${stray.asset}"`);
  });

  test("each node carries its definition's description, MCP exposure, and args schema", async () => {
    const waitPage = action("wait-page")
      .describe({ summary: "Wait for the page." })
      .mcp({ mode: "long-lived" })
      .args(z.object({ title: z.string(), timeoutMs: z.number().default(10) }))
      .run(async () => undefined);
    const plain = action("plain").run(async () => undefined);

    await om("report-meta")
      .describe({ summary: "The whole run." })
      .run(async () => {
        await waitPage({ title: "x", timeoutMs: 1 }).result;
        await plain().result;
      });

    const parsed = JSON.parse(
      await readFile(path.join(ExecutionTree.last!.folder.path(), "result.json"), "utf8")
    ) as { root: NodeMeta & { children: (NodeMeta & { name: string })[] } };
    expect(parsed.root.description).toEqual({ summary: "The whole run." });
    const [described, bare] = parsed.root.children;
    expect(described).toMatchObject({
      name: "wait-page",
      // every launch records the line that called it, even when the definition is elsewhere
      calledAt: expect.stringMatching(/report-output\.test\.ts:\d+$/),
      description: { summary: "Wait for the page." },
      mcp: { mode: "long-lived" },
      inputSchema: { type: "object", properties: { title: { type: "string" } } },
    });
    expect(bare!.description).toBeUndefined();
    expect(bare!.mcp).toBeUndefined();
    expect(bare!.inputSchema).toBeUndefined();
    // a defined action is not marked; only inline step(...) nodes are
    expect(described).not.toHaveProperty("kind");
  });

  test("each node records what it returned, or a note when JSON cannot carry it", async () => {
    await om("report-values").run(async () => {
      await step("object", async () => ({ files: 42, warnings: [{ code: "TS6133" }] }));
      await step("handle", async () => () => "not json");
      await step("nothing", async () => undefined);
      // awaited through the event gate rather than `.result` — the value is recorded the same
      await action("gated")
        .run(async () => ({ via: "once" }))()
        .once("done");
    });

    const parsed = JSON.parse(
      await readFile(path.join(ExecutionTree.last!.folder.path(), "result.json"), "utf8")
    ) as { root: { children: { name: string; value?: unknown; valueNote?: string }[] } };
    const [object, handle, nothing, gated] = parsed.root.children;
    expect(gated!.value).toEqual({ via: "once" });
    expect(object!.value).toEqual({ files: 42, warnings: [{ code: "TS6133" }] });
    expect(handle!.value).toBeUndefined();
    expect(handle!.valueNote).toBe("function (not JSON)");
    expect(nothing).not.toHaveProperty("value");
    expect(nothing).not.toHaveProperty("valueNote");
  });

  test("run data cannot close the data block early", async () => {
    await om("report-inert").run(async () => {
      console.log("</script><script>alert(1)</script>");
    });

    const { payload } = await readReport();
    expect(payload.entries.some((e) => e.message === "</script><script>alert(1)</script>")).toBe(
      true
    );
  });
});
