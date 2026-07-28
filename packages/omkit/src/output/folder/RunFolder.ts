import { mkdirSync } from "node:fs";
import path from "node:path";
import { ymd, hms } from "../../foundation/format.ts";
import { fsSafe } from "../../foundation/fsSafe.ts";

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

  /** The absolute run directory, computed once and created on first access. */
  path(): string {
    if (this.dir) return this.dir;
    const now = new Date();
    this.dir = path.resolve("logs", this.name(), ymd(now), hms(now, "-"));
    return this.dir;
  }

  /** Absolute path to `name` inside the run folder; ensures the folder exists. */
  file(name: string): string {
    this.ensure();
    return path.join(this.path(), name);
  }

  /** Create the run folder synchronously (idempotent). */
  ensure(): void {
    if (this.ensured) return;
    mkdirSync(this.path(), { recursive: true });
    this.ensured = true;
  }
}
