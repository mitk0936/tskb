import type { LogEntry } from "../foundation/LogEntry.ts";
import { format, type Rendered } from "./milestones.ts";

export type RunNodeStatus = "running" | "ok" | "failed" | "cancelled";

/** One node of the live tree: where it is, how it's doing, and the tags it has picked up. */
export interface RunNode {
  /** The node's execution path, e.g. `main/dev`. */
  readonly path: string;
  readonly status: RunNodeStatus;
  readonly tags: readonly string[];
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
    const rendered = format(entry, node.tags);
    if (rendered) this.push(rendered.text);
    return rendered;
  }

  /** The live tree: every node touched so far, with its current status and tags. */
  nodes(): readonly RunNode[] {
    return [...this._nodes.values()].map((n) => ({
      path: n.path,
      status: n.status,
      tags: [...n.tags],
    }));
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
    const node: MutableNode = { path: entry.path, status: "running", tags: [], order: this.seq++ };
    this._nodes.set(entry.nodeId, node);
    return node;
  }

  private transition(node: MutableNode, entry: LogEntry): void {
    if (entry.level === "event" && entry.source === "lifecycle") {
      // A node reports `done · <status>` when it settles; "launched" leaves it running.
      if (entry.message.startsWith("done · ")) {
        node.status = statusOf(entry.message.slice("done · ".length));
      }
    } else if (entry.level === "event" && entry.source === "cancel") {
      node.status = "cancelled";
    }
  }

  private push(text: string): void {
    this._milestones.push(text);
    if (this._milestones.length > MILESTONE_CAP) this._milestones.shift();
  }
}

function statusOf(s: string): RunNodeStatus {
  return s === "ok" ? "ok" : s === "cancelled" ? "cancelled" : "failed";
}
