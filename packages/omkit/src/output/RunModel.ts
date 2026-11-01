import type { LogEntry } from "../foundation/LogEntry.ts";
import { format, type Rendered } from "./milestones.ts";

export type RunNodeStatus = "running" | "ok" | "failed" | "cancelled";

/** One node of the live tree: where it is, how it's doing, and the tags it has picked up. */
export interface RunNode {
  /** The node's execution path, e.g. `main/dev`. */
  readonly path: string;
  readonly status: RunNodeStatus;
  readonly tags: readonly string[];
  /** Epoch millis of the node's first entry. */
  readonly startedAt: number;
  /** Epoch millis it settled; absent while it runs. */
  readonly endedAt?: number;
  /** First line of the node's latest output (console or proc), for a live "what is it doing" row. */
  readonly last?: string;
}

/** A compact roll-up of the live tree, for a one-line status strip. */
export interface RunSummary {
  /** Paths of nodes still running, most-recently-active first. */
  readonly running: readonly string[];
  readonly ok: number;
  readonly failed: number;
  readonly cancelled: number;
}

/** How many milestone lines to keep. Older lines fall off the top so a long run can't grow without bound. */
export const MILESTONE_CAP = 500;

interface MutableNode {
  path: string;
  status: RunNodeStatus;
  tags: string[];
  order: number;
  startedAt: number;
  endedAt?: number;
  last?: string;
}

/**
 * Folds a run's {@link LogEntry} stream into live, bounded state: a per-node status map (the tree)
 * and a capped tail of milestone lines. One reducer shared by every frontend — the bare
 * `LiveRenderer` and the interactive app both drive it — so "how a run looks" has one definition.
 */
export class RunModel {
  private readonly _nodes = new Map<string, MutableNode>();
  private readonly _milestones: string[] = [];
  private seq = 0;

  /** Apply one entry: update node/tag state, append its milestone line (if any), and return it. */
  apply(entry: LogEntry): Rendered | null {
    const node = this.touch(entry);
    if (entry.level === "tag" && entry.source === "tag") {
      node.tags.push(entry.message);
      return null; // tags decorate a node's lines; they aren't a line of their own
    }
    this.transition(node, entry);
    if (isActivity(entry)) {
      const line = entry.message.split("\n", 1)[0]!.trim();
      if (line) node.last = line;
    }
    const rendered = format(entry, node.tags);
    if (rendered) this.push(rendered.text);
    return rendered;
  }

  /** The live tree: every node touched so far, with its current status and tags. */
  nodes(): readonly RunNode[] {
    return [...this._nodes.values()].map(view);
  }

  /** One node of the live tree by id, as it stands now — for a caller rendering one entry. */
  node(nodeId: string): RunNode | undefined {
    const n = this._nodes.get(nodeId);
    return n && view(n);
  }

  /** The capped tail of milestone lines, oldest first. */
  milestones(): readonly string[] {
    return [...this._milestones];
  }

  /** A compact roll-up for a status strip: who's still running, and how many finished each way. */
  summary(): RunSummary {
    let ok = 0;
    let failed = 0;
    let cancelled = 0;
    const running: MutableNode[] = [];
    for (const n of this._nodes.values()) {
      if (n.status === "ok") ok++;
      else if (n.status === "failed") failed++;
      else if (n.status === "cancelled") cancelled++;
      else running.push(n);
    }
    running.sort((a, b) => b.order - a.order); // most-recently-active first
    return { running: running.map((n) => n.path), ok, failed, cancelled };
  }

  private touch(entry: LogEntry): MutableNode {
    const existing = this._nodes.get(entry.nodeId);
    if (existing) {
      existing.order = this.seq++; // most-recent activity wins the ordering
      return existing;
    }
    const node: MutableNode = {
      path: entry.path,
      status: "running",
      tags: [],
      order: this.seq++,
      startedAt: entry.ts,
    };
    this._nodes.set(entry.nodeId, node);
    return node;
  }

  private transition(node: MutableNode, entry: LogEntry): void {
    if (entry.level === "event" && entry.source === "lifecycle") {
      // A node reports `done · <status>` when it settles; "launched" leaves it running.
      if (entry.message.startsWith("done · ")) {
        node.status = statusOf(entry.message.slice("done · ".length));
        node.endedAt = entry.ts;
      }
    } else if (entry.level === "event" && entry.source === "cancel") {
      node.status = "cancelled";
      node.endedAt ??= entry.ts;
    }
  }

  private push(text: string): void {
    this._milestones.push(text);
    if (this._milestones.length > MILESTONE_CAP) this._milestones.shift();
  }
}

/**
 * What a node is doing, for its "latest line": its output and its own events (a watcher's
 * `update · …`), not its lifecycle or a cancellation, which its status already says.
 */
function isActivity(e: LogEntry): boolean {
  if (e.level === "info" || e.level === "error") return true;
  return e.level === "event" && e.source !== "lifecycle" && e.source !== "cancel";
}

function view(n: MutableNode): RunNode {
  return {
    path: n.path,
    status: n.status,
    tags: [...n.tags],
    startedAt: n.startedAt,
    ...(n.endedAt === undefined ? {} : { endedAt: n.endedAt }),
    ...(n.last === undefined ? {} : { last: n.last }),
  };
}

function statusOf(s: string): RunNodeStatus {
  return s === "ok" ? "ok" : s === "cancelled" ? "cancelled" : "failed";
}
