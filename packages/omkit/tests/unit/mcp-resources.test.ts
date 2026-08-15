import { beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  latestRun,
  mimeOf,
  readRunFile,
  resolveRunFolder,
  runFileLinks,
} from "../../src/mcp/resources.ts";

let root: string;
const RUN = "smoke-a1b2c3d4";
const FIRST = ["2026-08-01", "10-00-00"];

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-res-"));
  const runs = path.join(root, "logs", RUN);
  for (const [date, time] of [FIRST, ["2026-08-04", "09-00-00"], ["2026-08-04", "11-30-00"]]) {
    fs.mkdirSync(path.join(runs, date!, time!), { recursive: true });
    fs.writeFileSync(path.join(runs, date!, time!, "main.log"), `${date} ${time}\n`, "utf8");
  }
  fs.writeFileSync(path.join(root, "secret.txt"), "not yours", "utf8");
});

const first = (): string => path.join(root, "logs", RUN, FIRST[0]!, FIRST[1]!);

describe("resolveRunFolder", () => {
  test("accepts a folder inside logs/", () => {
    expect(resolveRunFolder(root, first())).toBe(fs.realpathSync.native(first()));
  });

  test("refuses a path that escapes logs/ with ..", () => {
    expect(resolveRunFolder(root, path.join(root, "logs", "..", "secret.txt"))).toBeUndefined();
  });

  test("refuses an absolute path elsewhere on the machine", () => {
    expect(resolveRunFolder(root, os.homedir())).toBeUndefined();
  });

  test("refuses logs/ itself — a run folder, not the root", () => {
    expect(resolveRunFolder(root, path.join(root, "logs"))).toBeUndefined();
  });

  test("refuses a file, since a run folder is a directory", () => {
    expect(resolveRunFolder(root, path.join(first(), "main.log"))).toBeUndefined();
  });
});

describe("latestRun", () => {
  test("picks the newest date, then the newest time within it", () => {
    // Names are zero-padded and fixed-width, so lexical sort is chronological sort.
    expect(latestRun(root, RUN)!.endsWith(path.join("2026-08-04", "11-30-00"))).toBe(true);
  });

  test("an om that has never run resolves to nothing rather than throwing", () => {
    expect(latestRun(root, "never-00000000")).toBeUndefined();
  });

  test("a traversal in the folder name is refused", () => {
    expect(latestRun(root, "../..")).toBeUndefined();
  });
});

describe("readRunFile", () => {
  const segments = [RUN, FIRST[0]!, FIRST[1]!, "main.log"];

  test("reads a text file with its MIME type", () => {
    const read = readRunFile(root, segments)!;
    expect(read.mimeType).toBe("text/plain");
    expect(read.text).toContain("2026-08-01");
  });

  test("refuses a traversal in the file segment", () => {
    expect(
      readRunFile(root, [RUN, FIRST[0]!, FIRST[1]!, "../../../../secret.txt"])
    ).toBeUndefined();
  });

  test("truncates an oversized text file and says so", () => {
    fs.writeFileSync(path.join(first(), "big.log"), "x".repeat(400 * 1024), "utf8");
    const read = readRunFile(root, [RUN, FIRST[0]!, FIRST[1]!, "big.log"])!;
    expect(read.text!.length).toBeLessThan(400 * 1024);
    expect(read.text).toMatch(/truncated/i);
  });

  test("a binary file comes back base64 with an image MIME type", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    fs.writeFileSync(path.join(first(), "shot.png"), png);
    const read = readRunFile(root, [RUN, FIRST[0]!, FIRST[1]!, "shot.png"])!;
    expect(read.mimeType).toBe("image/png");
    expect(read.blob).toBe(png.toString("base64"));
    expect(read.text).toBeUndefined();
  });

  test("an oversized binary is described rather than inlined or refused", () => {
    // A read carrying neither `text` nor `blob` is not a valid MCP result, so the answer
    // is a plain-text explanation with the path.
    fs.writeFileSync(path.join(first(), "huge.png"), Buffer.alloc(400 * 1024));
    const read = readRunFile(root, [RUN, FIRST[0]!, FIRST[1]!, "huge.png"])!;
    expect(read.blob).toBeUndefined();
    expect(read.mimeType).toBe("text/plain");
    expect(read.text).toMatch(/over the .* cap/);
  });

  test("a missing file resolves to nothing", () => {
    expect(readRunFile(root, [RUN, FIRST[0]!, FIRST[1]!, "nope.log"])).toBeUndefined();
  });

  test("a directory is not a file", () => {
    expect(readRunFile(root, [RUN, FIRST[0]!])).toBeUndefined();
  });
});

describe("runFileLinks", () => {
  test("puts curated artifacts first, with their name and description", () => {
    const dir = path.join(root, "logs", "curated-11111111", "2026-08-05", "12-00-00");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "shot.png"), Buffer.from([0x89]));
    fs.writeFileSync(path.join(dir, "main.log"), "hi\n", "utf8");
    fs.writeFileSync(
      path.join(dir, "result.json"),
      JSON.stringify({
        artifacts: [
          {
            name: "Landing screenshot",
            file: path.join(dir, "shot.png"),
            description: "after login",
            mime: "image/png",
          },
        ],
      }),
      "utf8"
    );

    const links = runFileLinks(root, dir);
    expect(links[0]).toMatchObject({
      type: "resource_link",
      name: "Landing screenshot",
      description: "after login",
      mimeType: "image/png",
    });
    // Curation raises signal; it does not gate access — the rest is still listed.
    expect(links.map((l) => l.name)).toContain("main.log");
    // …and the curated file is not listed twice.
    expect(links.filter((l) => l.uri.endsWith("shot.png"))).toHaveLength(1);
  });

  test("uses omkit:// URIs the resource templates can resolve", () => {
    const links = runFileLinks(root, first());
    expect(links.every((l) => l.uri.startsWith(`omkit://runs/${RUN}/`))).toBe(true);
  });

  test("a folder outside logs/ yields nothing rather than leaking a listing", () => {
    expect(runFileLinks(root, root)).toEqual([]);
  });
});

describe("mimeOf", () => {
  test("maps the extensions a run folder actually contains", () => {
    expect(mimeOf("a/result.json")).toBe("application/json");
    expect(mimeOf("a/raw.jsonl")).toBe("application/x-ndjson");
    expect(mimeOf("a/main.log")).toBe("text/plain");
    expect(mimeOf("a/shot.png")).toBe("image/png");
  });

  test("an unknown extension falls back to octet-stream, not to text", () => {
    expect(mimeOf("a/thing.bin")).toBe("application/octet-stream");
  });
});
