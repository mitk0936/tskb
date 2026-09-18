import fs from "node:fs";
import path from "node:path";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Files above this are truncated (text) or described rather than inlined (binary). */
const MAX_BYTES = 256 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".log": "text/plain",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const TEXT_MIME = /^(text\/|application\/(json|x-ndjson|xml))/;

export function mimeOf(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** True when `candidate` sits strictly inside `root` — not equal to it, not above it. */
function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Resolve a path and refuse anything that is not strictly inside `<root>/logs`.
 *
 * URIs are untrusted input — a model can propose any string — so this runs on every read,
 * not just at the template. Two checks, because `..` and a symlink escape by different
 * routes: the lexical one catches `logs/../secret`, and the realpath one catches
 * `logs/link → /etc`. `logs/` itself is refused: it is the root, not a run.
 */
export function resolveUnderLogs(root: string, target: string): string | undefined {
  const logs = path.resolve(root, "logs");
  if (!inside(logs, path.resolve(target))) return undefined;
  try {
    const realLogs = fs.realpathSync.native(logs);
    const real = fs.realpathSync.native(path.resolve(target));
    return inside(realLogs, real) ? real : undefined;
  } catch {
    return undefined; // does not exist — nothing to read either way
  }
}

/** A run folder the caller named directly (a path from `get_run`, or one a client kept). */
export function resolveRunFolder(root: string, candidate: string): string | undefined {
  const resolved = resolveUnderLogs(root, candidate);
  if (!resolved) return undefined;
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/** The newest child directory of `dir`, by name. */
function newestChild(dir: string): string | undefined {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .pop();
}

/**
 * The newest run of one om. Folder names are `<date>/<time>` with zero-padded, fixed-width
 * components (`2026-08-04/11-30-00`), so lexical sort is chronological sort — no parsing,
 * and no dependence on filesystem mtime.
 *
 * This is what the run-folder-identity constraint is *for*: "a script or an assistant can
 * always find the latest run of X without parsing scrollback".
 */
export function latestRun(root: string, folderName: string): string | undefined {
  const base = resolveUnderLogs(root, path.join(root, "logs", folderName));
  if (!base) return undefined;
  try {
    const date = newestChild(base);
    if (!date) return undefined;
    const time = newestChild(path.join(base, date));
    return time ? path.join(base, date, time) : undefined;
  } catch {
    return undefined;
  }
}

export interface RunFileRead {
  readonly path: string;
  readonly mimeType: string;
  readonly text?: string;
  readonly blob?: string;
}

/** Read one file from a run folder, confined, size-capped, and typed by extension. */
export function readRunFile(root: string, segments: string[]): RunFileRead | undefined {
  const target = resolveUnderLogs(root, path.join(root, "logs", ...segments));
  if (!target) return undefined;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return undefined;
  }
  if (!stat.isFile()) return undefined;

  const mimeType = mimeOf(target);
  if (!TEXT_MIME.test(mimeType)) {
    // Binary is all-or-nothing: half a PNG is not a smaller PNG. Too large comes back as a
    // plain-text explanation rather than an error — the client asked a reasonable question
    // and deserves an answer, and a read with neither `text` nor `blob` is not a valid
    // MCP result.
    if (stat.size > MAX_BYTES) {
      return {
        path: target,
        mimeType: "text/plain",
        text: `${path.basename(target)} is ${stat.size} bytes, over the ${MAX_BYTES}-byte inline cap. Read it from disk at ${target}.`,
      };
    }
    return { path: target, mimeType, blob: fs.readFileSync(target).toString("base64") };
  }

  const raw = fs.readFileSync(target, "utf8");
  const text =
    stat.size > MAX_BYTES
      ? `${raw.slice(0, MAX_BYTES)}\n\n… truncated at ${MAX_BYTES} bytes of ${stat.size}. ` +
        `Use tail_run with a cursor to page through this run's log.`
      : raw;
  return { path: target, mimeType, text };
}

/**
 * A curated artifact as `result.json` records it. Re-declared rather than imported from
 * `output/writers/views.ts`: `mcp/` may not reach into the output layer.
 */
interface ArtifactRecordLike {
  readonly name: string;
  readonly file: string;
  readonly description?: string;
  readonly mime: string;
}

export interface ResourceLink {
  readonly type: "resource_link";
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType: string;
}

/**
 * The run's files as `resource_link` blocks rather than inlined content, so a model reads
 * only what it needs — `raw.jsonl` on a long run is megabytes. Curated artifacts come
 * first, carrying the name and description the om gave them; the rest of the folder
 * follows, unlabelled. Curation raises signal; it does not gate access.
 */
export function runFileLinks(root: string, folder: string): ResourceLink[] {
  const resolved = resolveRunFolder(root, folder);
  if (!resolved) return [];
  const logs = fs.realpathSync.native(path.resolve(root, "logs"));
  const rel = path.relative(logs, resolved).split(path.sep);
  const uriFor = (file: string): string => `omkit://runs/${[...rel, file].join("/")}`;

  let curated: ArtifactRecordLike[] = [];
  try {
    const result = JSON.parse(fs.readFileSync(path.join(resolved, "result.json"), "utf8")) as {
      artifacts?: ArtifactRecordLike[];
    };
    curated = result.artifacts ?? [];
  } catch {
    curated = [];
  }

  const links: ResourceLink[] = curated.map((a) => ({
    type: "resource_link" as const,
    uri: uriFor(path.basename(a.file)),
    name: a.name,
    ...(a.description ? { description: a.description } : {}),
    mimeType: a.mime,
  }));
  const named = new Set(curated.map((a) => path.basename(a.file)));

  for (const item of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!item.isFile() || named.has(item.name)) continue;
    links.push({
      type: "resource_link" as const,
      uri: uriFor(item.name),
      name: item.name,
      mimeType: mimeOf(item.name),
    });
  }
  return links;
}

/**
 * Publish the two templates. Read-only by construction: there is no write path here, and
 * no way to delete a run folder through MCP.
 *
 * `list` is `undefined` deliberately — enumerating every file of every historical run
 * would be a large, mostly-useless listing. `get_run` returns resource links for the run a
 * client actually asked about, which is the path that matters.
 */
export function registerResources(server: McpServer, opts: { root: string }): void {
  const respond = (uri: URL, read: RunFileRead | undefined) => {
    if (!read) {
      throw new Error(`no such run file, or it is outside this project's logs/: ${uri.href}`);
    }
    // A resource's contents are a discriminated union — `text` or `blob`, never both as
    // optionals — so the two shapes are built separately rather than spread conditionally.
    const base = { uri: uri.href, mimeType: read.mimeType };
    return {
      contents: [
        read.blob !== undefined ? { ...base, blob: read.blob } : { ...base, text: read.text ?? "" },
      ],
    };
  };

  server.registerResource(
    "run-latest",
    new ResourceTemplate("omkit://runs/{run}/latest/{file}", { list: undefined }),
    {
      title: "The newest run of one om",
      description:
        "A file from the most recent run of `{run}` (the `folderName` from list_oms). Try " +
        "main.log for the narrative, result.json for the verdict, artifacts.log for files.",
    },
    async (uri, { run, file }) => {
      const folder = latestRun(opts.root, String(run));
      if (!folder) throw new Error(`no runs recorded for ${String(run)}`);
      const logs = fs.realpathSync.native(path.resolve(opts.root, "logs"));
      const rel = path.relative(logs, folder).split(path.sep);
      return respond(uri, readRunFile(opts.root, [...rel, String(file)]));
    }
  );

  server.registerResource(
    "run-at",
    new ResourceTemplate("omkit://runs/{run}/{date}/{time}/{file}", { list: undefined }),
    { title: "A file from one specific run" },
    async (uri, { run, date, time, file }) =>
      respond(uri, readRunFile(opts.root, [run, date, time, file].map(String)))
  );
}
