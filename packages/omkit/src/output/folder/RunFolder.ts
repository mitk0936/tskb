import { mkdirSync } from "node:fs";
import path from "node:path";
import { ymd, hms, pad } from "../../foundation/format.ts";
import { fsSafe } from "../../foundation/fsSafe.ts";
import { newUuid, shortId } from "../../foundation/ids.ts";

/** Suffixed attempts (`-02` … `-99`) before falling back to a random, certainly-unique one. */
const MAX_NUMBERED_ATTEMPTS = 99;

/**
 * Where `logs/` goes: the project root a frontend named, or the working directory when nobody
 * named one.
 *
 * A run's cwd is not a statement about which project it belongs to — `omkit run` sets it to the
 * om file's own directory so relative paths in a body resolve the way their author reads them,
 * which meant one project scattered its records across every folder that happened to contain an
 * om, while the MCP server wrote them wherever the server was started. Two names for one thing.
 * The root is passed explicitly and separately so the record's location is a property of the
 * project, and the cwd stays free to mean what it already meant.
 */
function logsRoot(): string {
  const root = process.env.OMKIT_ROOT;
  return root ? path.resolve(root, "logs") : path.resolve("logs");
}

/**
 * Owns this run's single output directory — `logs/<name>-<hash>/<date>/<time>/` —
 * where `raw.jsonl`, the per-action `.log` files, rollups, and `result.json` all
 * live. The path is computed once, lazily, and always returned absolute so links
 * written into logs resolve regardless of cwd.
 */
export class RunFolder {
  private dir: string | undefined;
  private ensured = false;

  constructor(
    private readonly runName: string,
    private readonly hash: string
  ) {}

  /** `<name>-<hash8>` — the run's folder name, unique per (defining file, name). */
  name(): string {
    return `${fsSafe(this.runName)}-${this.hash}`;
  }

  /**
   * The absolute run directory — claimed on first access, stable thereafter.
   *
   * Claiming and knowing the path are the same act: the directory is what makes a run's
   * identity exclusive, so there is no meaningful "what would the path be" to answer
   * before it exists.
   */
  path(): string {
    if (!this.dir) this.claim();
    return this.dir!;
  }

  /** Absolute path to `name` inside the run folder; ensures the folder exists. */
  file(name: string): string {
    return path.join(this.path(), name);
  }

  /** Create the run folder synchronously (idempotent). */
  ensure(): void {
    this.path();
  }

  /**
   * Take exclusive ownership of a `<date>/<time>` directory.
   *
   * `hms` has second resolution, so two runs of the same om starting within one second
   * would otherwise share a folder — and that is not merely "the later one wins":
   * `RawStream` opens `raw.jsonl` with `flags: "w"`, so two live runs both truncate it and
   * then write at their own offsets, leaving bytes that are not valid JSONL. The MCP
   * server makes this easy to reach, since `start_om` can put two children in flight.
   *
   * Finer timestamps would only lower the odds. `mkdirSync` without `recursive` throws
   * `EEXIST` **atomically**, and that atomicity holds between processes — so the directory
   * creation is itself the lock. The common case keeps a clean `16-39-29`; only a real
   * collision produces `16-39-29-02`, zero-padded so lexical order stays chronological
   * (which is what `latest` relies on).
   */
  private claim(): void {
    const now = new Date();
    const parent = path.resolve(logsRoot(), this.name(), ymd(now));
    mkdirSync(parent, { recursive: true });
    const base = hms(now, "-");

    for (let attempt = 0; attempt <= MAX_NUMBERED_ATTEMPTS; attempt += 1) {
      // A random suffix as the last resort: bounded loops beat an unbounded one, and a
      // hundred collisions inside one second means something stranger is going on.
      const suffix =
        attempt === 0
          ? ""
          : attempt === MAX_NUMBERED_ATTEMPTS
            ? `-${shortId(newUuid())}`
            : `-${pad(attempt + 1)}`;
      const candidate = path.join(parent, `${base}${suffix}`);
      try {
        mkdirSync(candidate); // deliberately not recursive — EEXIST is the lock
        this.dir = candidate;
        this.ensured = true;
        return;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
  }
}
