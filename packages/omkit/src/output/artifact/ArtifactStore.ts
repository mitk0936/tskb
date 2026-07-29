import path from "node:path";

/** One curated artifact — a file the om chose to label. */
export interface ArtifactRecord {
  readonly name: string;
  /** Absolute path to the file. */
  readonly file: string;
  readonly description?: string;
  readonly mime: string;
  /** The node that registered it. */
  readonly nodeId: string;
}

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
  ".zip": "application/zip",
};

/**
 * The run's curated artifacts — the files an om labelled via `ctx.artifact`, in
 * registration order. Holds no I/O: the om already wrote the file, this records what it
 * means. Unregistered files stay in the run folder and stay listed by anything
 * enumerating it; curation raises signal, it does not gate access.
 */
export class ArtifactStore {
  private readonly records: ArtifactRecord[] = [];

  register(
    name: string,
    file: string,
    nodeId: string,
    opts: { description?: string; mime?: string } = {}
  ): ArtifactRecord {
    // `file` is documented absolute; a caller that passes a relative path still gets
    // one back — resolved against process.cwd(), same base `path.resolve` uses by
    // default — so every consumer (the return value, the timeline message, the
    // on-disk rollups) carries a path that means the same thing without them.
    const resolved = path.resolve(file);
    const record: ArtifactRecord = {
      name,
      file: resolved,
      nodeId,
      mime: opts.mime ?? mimeOf(resolved),
      ...(opts.description === undefined ? {} : { description: opts.description }),
    };
    this.records.push(record);
    return record;
  }

  all(): readonly ArtifactRecord[] {
    return this.records;
  }
}

function mimeOf(file: string): string {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}
