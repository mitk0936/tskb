import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LogEntry } from "../../foundation/LogEntry.ts";
import type { ArtifactView, NodeView, RunView } from "./views.ts";

/**
 * `report.html` — the run as one self-contained page: the run view, every log entry, the
 * snapshot payloads, the run's images (as base64), d3, and the viewer itself, all inlined so
 * the file opens straight from disk, survives being zipped or attached, and needs no server.
 *
 * Heavy by design. Images are kept out of the main JSON — each sits in its own inert
 * `<script type="text/plain">` block the viewer decodes only when it shows that image — so the
 * page's one `JSON.parse` stays proportional to the log, not to the screenshots. The viewer
 * paints a loader first and swaps it out once the data is parsed.
 */

/** Snapshot payloads larger than this are embedded as truncated text, not parsed JSON. */
const SNAPSHOT_CAP = 2 * 1024 * 1024;
/** A single image larger than this is listed but not embedded. */
const IMAGE_CAP = 25 * 1024 * 1024;
/** Images stop being embedded once this many bytes are in the page. */
const IMAGES_TOTAL_CAP = 200 * 1024 * 1024;
/** Text artifacts (logs, json, md, …) are embedded up to this size. */
const TEXT_CAP = 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export interface ReportInput {
  /** The om's name, as given to `om(name)`. */
  readonly name: string;
  /** The run folder (absolute). */
  readonly folder: string;
  readonly run: RunView;
  readonly entries: readonly LogEntry[];
  /** The curated artifacts, as in `run.artifacts`, with the node that registered each. */
  readonly artifacts: ReadonlyArray<ArtifactView & { readonly nodeId: string }>;
}

/** One file shown in the report: a curated artifact, or an image found in the run folder. */
interface ReportFile {
  readonly name: string;
  /** Path relative to the run folder (forward slashes), or absolute when outside it. */
  readonly rel: string;
  /** Absolute path, for "copy path" / `file://` links. */
  readonly file: string;
  readonly mime: string;
  readonly size: number;
  readonly curated: boolean;
  readonly nodeId?: string;
  readonly ts?: number;
  readonly description?: string;
  /** Id of the `<script>` block holding the base64 payload, when embedded. */
  readonly asset?: string;
  /** Inline text content, for text artifacts under {@link TEXT_CAP}. */
  readonly text?: string;
  /** Why the content is not in the page, when it is not. */
  readonly omitted?: string;
}

interface ReportSnapshot {
  readonly seq: number;
  readonly name: string;
  readonly nodeId: string;
  readonly ts: number;
  readonly rel: string;
  readonly file: string;
  /** The parsed payload, or the (possibly truncated) raw text when it is too large or not JSON. */
  readonly value?: unknown;
  readonly text?: string;
  readonly truncated?: boolean;
}

/** Writes `report.html` for a finished run. */
export async function writeReport(file: string, input: ReportInput): Promise<void> {
  const assets: Array<{ id: string; mime: string; data: string }> = [];
  const files = await collectFiles(input, assets);
  const snapshots = await collectSnapshots(input);
  const root = await projectRoot(input.folder);
  const payload = {
    version: 1,
    name: input.name,
    folder: input.folder,
    projectRoot: root,
    sources: definitionSources(input.run.root, root),
    code: await definitionCode(input.run.root),
    library: librarySites(input.run.root),
    generatedAt: Date.now(),
    run: input.run,
    entries: input.entries,
    snapshots,
    files,
  };
  const [d3, css, client] = await Promise.all([
    readFile(d3Path(), "utf8"),
    readFile(assetPath("report.css"), "utf8"),
    readFile(assetPath("report.js"), "utf8"),
  ]);
  await writeFile(file, renderPage(input, payload, assets, { d3, css, client }), "utf8");
}

function renderPage(
  input: ReportInput,
  payload: unknown,
  assets: ReadonlyArray<{ id: string; mime: string; data: string }>,
  code: { d3: string; css: string; client: string }
): string {
  const title = `Run: ${input.name}`;
  const blobs = assets
    .map((a) => `<script type="text/plain" id="${a.id}" data-mime="${a.mime}">${a.data}</script>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${code.css}</style>
</head>
<body>
<div id="loader" role="status" aria-live="polite">
  <div class="loader-card">
    <div class="loader-spin"></div>
    <div class="loader-title">${escapeHtml(title)}</div>
    <div class="loader-step" id="loader-step">Loading the run record…</div>
  </div>
</div>
<div id="app" hidden></div>
<script id="omkit-data" type="application/json">${inertJson(payload)}</script>
${blobs}
<script>${inertScript(code.d3)}</script>
<script>${inertScript(code.client)}</script>
</body>
</html>
`;
}

async function collectFiles(
  input: ReportInput,
  assets: Array<{ id: string; mime: string; data: string }>
): Promise<ReportFile[]> {
  const out: ReportFile[] = [];
  const seen = new Set<string>();
  let budget = IMAGES_TOTAL_CAP;
  const artifactTs = artifactTimes(input.entries);

  const add = async (
    abs: string,
    meta: Omit<ReportFile, "rel" | "file" | "size" | "asset" | "text" | "omitted">
  ): Promise<void> => {
    const key = path.resolve(abs).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const base: Omit<ReportFile, "size"> = { ...meta, file: abs, rel: relTo(input.folder, abs) };
    let size: number;
    try {
      size = (await stat(abs)).size;
    } catch {
      out.push({ ...base, size: 0, omitted: "file not found" });
      return;
    }
    if (meta.mime.startsWith("image/")) {
      if (size > IMAGE_CAP) {
        out.push({ ...base, size, omitted: `larger than ${mb(IMAGE_CAP)}` });
      } else if (size > budget) {
        out.push({ ...base, size, omitted: `page image budget (${mb(IMAGES_TOTAL_CAP)}) spent` });
      } else {
        budget -= size;
        const id = `asset-${assets.length + 1}`;
        assets.push({ id, mime: meta.mime, data: (await readFile(abs)).toString("base64") });
        out.push({ ...base, size, asset: id });
      }
    } else if (isText(meta.mime) && size <= TEXT_CAP) {
      out.push({ ...base, size, text: await readFile(abs, "utf8") });
    } else {
      out.push({
        ...base,
        size,
        omitted: isText(meta.mime) ? `larger than ${mb(TEXT_CAP)}` : "binary",
      });
    }
  };

  for (const a of input.artifacts) {
    const ts = artifactTs.get(`${a.nodeId}\0${path.resolve(a.file)}`);
    await add(a.file, {
      name: a.name,
      mime: a.mime,
      curated: true,
      nodeId: a.nodeId,
      ...(ts === undefined ? {} : { ts }),
      ...(a.description === undefined ? {} : { description: a.description }),
    });
  }
  // Images the run left in its folder without labelling them still belong in the picture.
  for (const abs of await walk(input.folder)) {
    const mime = IMAGE_MIME[path.extname(abs).toLowerCase()];
    if (mime) await add(abs, { name: path.basename(abs), mime, curated: false });
  }
  return out;
}

async function collectSnapshots(input: ReportInput): Promise<ReportSnapshot[]> {
  const out: ReportSnapshot[] = [];
  let seq = 0;
  for (const e of input.entries) {
    if (e.level !== "snapshot") continue;
    const split = e.message.lastIndexOf(" → ");
    if (split < 0) continue;
    const name = e.message.slice(0, split);
    const abs = e.message.slice(split + 3);
    const base = {
      seq: ++seq,
      name,
      nodeId: e.nodeId,
      ts: e.ts,
      file: abs,
      rel: relTo(input.folder, abs),
    };
    try {
      const raw = await readFile(abs, "utf8");
      if (raw.length > SNAPSHOT_CAP) {
        out.push({ ...base, text: raw.slice(0, SNAPSHOT_CAP), truncated: true });
      } else {
        try {
          out.push({ ...base, value: JSON.parse(raw) as unknown });
        } catch {
          out.push({ ...base, text: raw });
        }
      }
    } catch {
      out.push({ ...base, text: "(snapshot file not found)" });
    }
  }
  return out;
}

/** `ts` of each `artifact` timeline line, keyed by `(nodeId, file)` — the latest wins. */
function artifactTimes(entries: readonly LogEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (e.level !== "artifact") continue;
    const split = e.message.lastIndexOf(" → ");
    if (split >= 0) out.set(`${e.nodeId}\0${path.resolve(e.message.slice(split + 3))}`, e.ts);
  }
  return out;
}

/**
 * The project the run belongs to, for project-relative paths: the nearest ancestor of the run
 * folder holding `.git`, else the folder `logs/` sits in (the root omkit was given), else cwd.
 */
async function projectRoot(folder: string): Promise<string> {
  let dir = path.resolve(folder);
  for (;;) {
    try {
      await stat(path.join(dir, ".git"));
      return dir;
    } catch {
      /* keep climbing */
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.env.OMKIT_ROOT ? path.resolve(process.env.OMKIT_ROOT) : process.cwd();
}

/** Each distinct `definedAt` site → its file, relative to the project root, forward-slashed, no line. */
function definitionSources(root: NodeView, projectDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (n: NodeView): void => {
    for (const site of [n.definedAt, n.calledAt]) {
      if (!site || site in out) continue;
      const file = site.replace(/:\d+(:\d+)?$/, "");
      out[site] = path.relative(projectDir, file).split(path.sep).join("/") || file;
    }
    n.children.forEach(visit);
  };
  visit(root);
  return out;
}

/**
 * The deepest statement containing `pos`. For an action's `.run(…)` line that is the whole
 * `export const x = action(…)…` statement (nothing nests the chain); for a call site inside a
 * body — `await step("x", async () => …)`, `await command(…)` — it is that one statement, the
 * callback included, rather than the om that happens to contain it.
 */
function innermostStatement(
  ts: typeof import("typescript"),
  sf: import("typescript").SourceFile,
  pos: number
): import("typescript").Node | undefined {
  let found: import("typescript").Node | undefined;
  const visit = (node: import("typescript").Node): void => {
    if (pos < node.getStart(sf) || pos >= node.getEnd()) return;
    const parent = node.parent as { statements?: readonly import("typescript").Node[] } | undefined;
    if (parent?.statements?.includes(node)) found = node;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/**
 * The 1-based line range to show for a site: its innermost statement, or — when the file will
 * not parse or nothing encloses the line — a window around it.
 */
function excerptRange(
  ts: typeof import("typescript"),
  file: string,
  text: string,
  line: number,
  total: number
): { from: number; to: number } {
  try {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const lineStart = sf.getPositionOfLineAndCharacter(
      Math.min(line, sf.getLineStarts().length) - 1,
      0
    );
    // the line's first token, so indentation doesn't fall outside the statement it opens
    const pos = lineStart + (/^\s*/.exec(text.slice(lineStart))?.[0].length ?? 0);
    const stmt = innermostStatement(ts, sf, pos);
    if (stmt) {
      return {
        from: sf.getLineAndCharacterOfPosition(stmt.getStart(sf, true)).line + 1,
        to: sf.getLineAndCharacterOfPosition(stmt.getEnd()).line + 1,
      };
    }
  } catch {
    /* fall back to the window around the line */
  }
  return { from: Math.max(1, line - 10), to: Math.min(total, line + 20) };
}

/** omkit's own package folder — `src/output/writers` (or `dist/…`) is three levels in. */
const OMKIT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Sites inside omkit itself or an installed package — a battery's definition or a step's
 * wrapper — where the viewer shows the user's call instead of library source.
 */
function librarySites(root: NodeView): string[] {
  const out = new Set<string>();
  const inside = (file: string): boolean => {
    const rel = path.relative(OMKIT_DIR, file);
    return (!rel.startsWith("..") && !path.isAbsolute(rel)) || /[\\/]node_modules[\\/]/.test(file);
  };
  const visit = (n: NodeView): void => {
    for (const site of [n.definedAt, n.calledAt]) {
      if (site && inside(site.replace(/:\d+(:\d+)?$/, ""))) out.add(site);
    }
    n.children.forEach(visit);
  };
  visit(root);
  return [...out];
}

/** A definition's source, as the viewer's `<>` popover shows it. */
interface DefinitionCode {
  /** 1-based line the excerpt starts at. */
  readonly start: number;
  readonly text: string;
  readonly lang: "ts" | "js";
  readonly truncated?: boolean;
}

/** Longest excerpt shown per definition; a body past this is cut, and says so. */
const CODE_LINES = 300;

/**
 * Each distinct `definedAt` site → the source of the definition there: the whole top-level
 * statement holding that line (`export const x = action(…)…run(…)`, or the `om(…).run(…)` call),
 * found with the TypeScript parser so it is the real extent, not a guess at one. A site whose
 * file is gone or unparseable gets a window of lines around it instead, or nothing.
 */
async function definitionCode(root: NodeView): Promise<Record<string, DefinitionCode>> {
  const sites = new Set<string>();
  const visit = (n: NodeView): void => {
    if (n.definedAt) sites.add(n.definedAt);
    if (n.calledAt) sites.add(n.calledAt);
    n.children.forEach(visit);
  };
  visit(root);
  if (sites.size === 0) return {};
  // Loaded only here: the parser is heavy, and a run that never writes a report never pays for it.
  const ts = (await import("typescript")).default;
  const out: Record<string, DefinitionCode> = {};
  const texts = new Map<string, string | null>();
  for (const site of sites) {
    const m = /^(.*):(\d+)(?::\d+)?$/.exec(site);
    if (!m) continue;
    const file = m[1]!;
    const line = Number(m[2]);
    if (!texts.has(file)) texts.set(file, await readFile(file, "utf8").catch(() => null));
    const text = texts.get(file);
    if (!text) continue;
    const lang = /\.[cm]?tsx?$/i.test(file) ? "ts" : "js";
    const lines = text.split(/\r?\n/);
    const { from, to } = excerptRange(ts, file, text, line, lines.length);
    const truncated = to - from + 1 > CODE_LINES;
    out[site] = {
      start: from,
      text: lines.slice(from - 1, truncated ? from - 1 + CODE_LINES : to).join("\n"),
      lang,
      ...(truncated ? { truncated } : {}),
    };
  }
  return out;
}

async function walk(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  let names;
  try {
    names = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const d of names) {
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(abs, depth + 1)));
    else if (d.isFile()) out.push(abs);
  }
  return out.sort();
}

function relTo(folder: string, abs: string): string {
  const rel = path.relative(folder, abs);
  return rel.startsWith("..") || path.isAbsolute(rel) ? abs : rel.split(path.sep).join("/");
}

function isText(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/x-ndjson" ||
    mime === "image/svg+xml"
  );
}

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/** JSON safe to sit inside a `<script>` block: no `</script>`, no `<!--`. */
function inertJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** JS safe to sit inside a `<script>` block. */
function inertScript(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
}

/** The viewer's own files, next to this module (`report/`) in both `src` and `dist`. */
function assetPath(name: string): string {
  return fileURLToPath(new URL(`./report/${name}`, import.meta.url));
}

/** d3's UMD bundle — the package's `exports` hide `dist/`, so go via its resolved entry. */
function d3Path(): string {
  const entry = createRequire(import.meta.url).resolve("d3");
  return path.join(path.dirname(entry), "..", "dist", "d3.min.js");
}
