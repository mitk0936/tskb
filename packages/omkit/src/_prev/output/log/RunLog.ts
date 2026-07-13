import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { LogRenderer, type DisplayItem } from "./LogRenderer.ts";
import type { LogEntry, LogsCollector } from "./LogsCollector.ts";
import { closeStream } from "../../system/fs/streams.ts";
import type { RunFolder } from "../folder/RunFolder.ts";
import type { SnapshotStore } from "../snapshot/SnapshotStore.ts";
import { ymd, hms } from "../../utils/format.ts";

/**
 * Writes the run's two log files: `run.jsonl` (the complete, authoritative record,
 * streamed live so it survives a hard kill) and `run.log` (the human timeline).
 *
 * Two phases: {@link stream} runs for the whole run, appending each entry to both
 * files as it arrives; {@link write} runs once at finalize, re-rendering `run.log`
 * from the finished `run.jsonl` in collapsed form. Depends on a {@link RunFolder}
 * (where the files land) and a {@link SnapshotStore} (to off-load collapsed runs).
 */
export class RunLog {
  private readonly folder: RunFolder;

  private readonly snapshots: SnapshotStore;

  // Path of `assertions.log`, set the first time an assertion is streamed (lazily
  // created). Stays `undefined` for a run with no assertions, so the finalize step
  // links it only when it exists. See {@link assertionsLog}.
  private assertionsPath: string | undefined;

  constructor(folder: RunFolder, snapshots: SnapshotStore) {
    this.folder = folder;
    this.snapshots = snapshots;
  }

  /** The `assertions.log` path if any assertion was logged this run, else `undefined`. */
  get assertionsLog(): string | undefined {
    return this.assertionsPath;
  }

  /**
   * Streams every log entry to `run.jsonl` (the complete, authoritative record) and a
   * live `run.log` incrementally as they arrive, so output survives a hard kill or lost
   * SIGINT. The log is closed once at finalize, after which {@link write} re-renders
   * `run.log` from `run.jsonl` in collapsed form.
   *
   * Subscribes **synchronously, before any `await`** — so a fast synchronous producer
   * that appends (and trims the in-memory history) before the file setup finishes still
   * has its entries buffered on the subscription queue rather than lost. `replay: true`
   * covers anything already logged when this is called.
   */
  async stream(logs: LogsCollector): Promise<void> {
    const entries = logs.subscribe({ replay: true });
    await this.folder.ensure();

    const jsonl = createWriteStream(this.folder.resolve("run.jsonl"));
    const pretty = createWriteStream(this.folder.resolve("run.log"));
    const renderer = new LogRenderer();

    pretty.write(this.header() + "\n");

    // The dedicated assertions file is a filtered projection of the same stream:
    // opened lazily on the first `assert` entry (so runs with none produce no file),
    // one `⊨ …` line each. Assertions still ride the main run.jsonl / run.log too.
    let assertions: ReturnType<typeof createWriteStream> | undefined;

    try {
      for await (const entry of entries) {
        jsonl.write(JSON.stringify(entry) + "\n");
        pretty.write(renderer.render(entry) + "\n");
        if (entry.level === "assert") {
          if (!assertions) {
            this.assertionsPath = this.folder.resolve("assertions.log");
            assertions = createWriteStream(this.assertionsPath);
          }
          assertions.write(LogRenderer.marker("assert", entry.message) + "\n");
        }
      }
    } finally {
      // End AND wait for both streams to fully close before resolving. {@link write}
      // re-renders run.log at finalize (from this run.jsonl); if a buffered chunk from
      // this stream landed *after* write() truncated run.log, the OS would zero-fill the
      // gap — a multi-MB run of NUL bytes. `run` awaits this promise before calling
      // write(), so this writer is guaranteed done first (and run.jsonl is complete).
      await Promise.all([
        closeStream(jsonl),
        closeStream(pretty),
        ...(assertions ? [closeStream(assertions)] : []),
      ]);
    }
  }

  /**
   * Renders the final, collapsed `run.log` from the authoritative `run.jsonl` (the
   * complete record {@link stream} wrote), **streaming** it line by line so the whole
   * run is never held in memory. Grouping/indentation is applied here so the stored
   * `run.jsonl` stays presentation-free; large same-source runs are collapsed —
   * off-loaded to a text snapshot and replaced inline by their head plus a pointer — so
   * one proc's burst can't drown the timeline. `run.jsonl` is left as-is. Returns the
   * `run.log` path (surfaced to the terminal).
   *
   * Call only after {@link stream} has closed (the run's log is ended), so `run.jsonl`
   * is complete and no longer being written.
   *
   * When this run logged any assertions, `summary` bubbles a footer into `run.log`
   * (only) — the pass/fail tally and a link to `assertions.log` — so results surface
   * in the persistent log rather than the live process output.
   */
  async write(summary?: { passed: number; failed: number }): Promise<string> {
    await this.folder.ensure();
    const jsonlFile = this.folder.resolve("run.jsonl");
    const file = this.folder.resolve("run.log");

    const out = createWriteStream(file);
    out.write(this.header());

    const renderer = new LogRenderer();
    const writes: Promise<void>[] = [];
    const emit = (item: DisplayItem): void => {
      if (item.kind === "line") {
        out.write(item.text + "\n");
      } else {
        const snap = this.snapshots.captureText(`output-${item.run.source}`, item.run.lines);
        writes.push(snap.written);
        out.write(LogRenderer.renderCollapsed(item.run, { rel: snap.rel }) + "\n");
      }
    };

    try {
      const rl = createInterface({ input: createReadStream(jsonlFile), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line) continue;
        let entry: LogEntry;
        try {
          entry = JSON.parse(line) as LogEntry;
        } catch {
          continue; // a torn final line (dirty exit) — skip it
        }
        for (const item of renderer.push(entry)) emit(item);
      }
    } catch {
      // run.jsonl missing/unreadable (e.g. a very early crash) — write what we have.
    }
    for (const item of renderer.end()) emit(item);

    // Bubble the assertion summary + the dedicated-log link into the run.log footer —
    // only when this run logged assertions (`assertionsPath` is set on the first one).
    if (this.assertionsPath && summary) {
      out.write(
        LogRenderer.marker(
          "assert",
          `assertions · ${summary.passed} passed · ${summary.failed} failed`
        ) + "\n"
      );
      out.write(LogRenderer.marker("assert", `assertions → ${this.assertionsPath}`) + "\n");
    }

    await closeStream(out); // flush + close run.log before reporting it written
    await Promise.all(writes); // ensure every off-loaded run is on disk
    return file;
  }

  /** A compact header block for the top of run.log — legend + run identity. */
  private header(): string {
    const now = new Date();
    return [
      `─── ${this.folder.name()} · ${ymd(now)} ${hms(now)} ───`,
      `● run  ⚡ event  ▸ action  📎 snapshot  ⇥ output  ⊨ assert`,
      "",
    ].join("\n");
  }
}
