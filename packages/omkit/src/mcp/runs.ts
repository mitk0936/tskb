import { newUuid, shortId } from "../foundation/ids.ts";
import type { LogEntry } from "../foundation/LogEntry.ts";
import type { RunSession, RunUp, Verdict } from "../client/types.ts";

/**
 * How many log entries a live run keeps for `tail_run`. A watch-mode om can emit for
 * hours, so the buffer is bounded and the oldest entries are dropped; `raw.jsonl` on disk
 * remains the complete record, and a settled run is read from there instead.
 */
const BUFFER_LIMIT = 5000;

export interface LiveRun {
  readonly id: string;
  /** The om or action name the client asked for. */
  readonly name: string;
  /** `<name>-<hash8>` — known before the run creates its dated folder. */
  readonly folderName: string;
  readonly session: RunSession;
  readonly startedAt: number;
  status: "running" | "settled";
  /** Set once the body has returned — for a long-lived run, once its stack is up. */
  up?: RunUp;
  /**
   * Resolves with the `up` report, or with undefined if the run settles (or dies) without
   * ever getting there — so a caller waiting to drive the stack is never left hanging.
   */
  readonly whenUp: Promise<RunUp | undefined>;
  verdict?: Verdict;
  /** The tail buffer. Entries are appended in sequence order, oldest dropped first. */
  readonly entries: LogEntry[];
  /** The oldest sequence still buffered, so `tail_run` can say it dropped lines. */
  dropped: number;
}

/**
 * Every run this server started, live or settled.
 *
 * Runs are kept after settling so a client that started one can still ask what happened
 * without knowing its folder — the dated folder only becomes knowable once the child has
 * created it, which is why the tools key on a `runId` at all.
 */
export class RunRegistry {
  private readonly runs = new Map<string, LiveRun>();

  /**
   * Take ownership of a session. Subscription happens here, not at the call site, because
   * `session.on("log")` must be attached before the first entry arrives — a tail that
   * starts at the tool boundary has already missed the run's opening lines.
   */
  start(name: string, folderName: string, session: RunSession): LiveRun {
    let resolveUp!: (info: RunUp | undefined) => void;
    const whenUp = new Promise<RunUp | undefined>((resolve) => (resolveUp = resolve));
    const run: LiveRun = {
      id: shortId(newUuid()),
      name,
      folderName,
      session,
      startedAt: Date.now(),
      status: "running",
      entries: [],
      dropped: 0,
      whenUp,
    };
    session.on("up", (info) => {
      run.up = info;
      resolveUp(info);
    });
    session.on("log", (entry) => {
      run.entries.push(entry);
      if (run.entries.length > BUFFER_LIMIT) {
        run.entries.splice(0, run.entries.length - BUFFER_LIMIT);
        run.dropped = run.entries[0]!.sequence;
      }
    });
    void session.result.then((verdict) => {
      run.status = "settled";
      run.verdict = verdict;
      resolveUp(run.up); // no-op if `up` already resolved it; otherwise: never got there
    });
    this.runs.set(run.id, run);
    return run;
  }

  get(id: string): LiveRun | undefined {
    return this.runs.get(id);
  }

  all(): LiveRun[] {
    return [...this.runs.values()];
  }

  /** Cancel every live run — the server is going away and its children must not outlive it. */
  cancelAll(): void {
    for (const run of this.runs.values()) {
      if (run.status === "running") run.session.cancel();
    }
  }
}
