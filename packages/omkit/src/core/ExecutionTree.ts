import path from "node:path";
import { newUuid, makeId } from "../foundation/ids.ts";
import { fsSafe } from "../foundation/fsSafe.ts";
import { defer, type Deferred } from "../foundation/Deferred.ts";
import { LogStore } from "../output/log/LogStore.ts";
import { RunFolder } from "../output/folder/RunFolder.ts";
import { RawStream } from "../output/log/RawStream.ts";
import { SnapshotStore } from "../output/snapshot/SnapshotStore.ts";
import { ConsoleCapture } from "../output/console/ConsoleCapture.ts";
import { LiveRenderer } from "../output/LiveRenderer.ts";
import { writeNodeLogs } from "../output/writers/NodeLogWriter.ts";
import { writeRollup } from "../output/writers/RollupWriter.ts";
import { writeResult } from "../output/writers/ResultWriter.ts";
import type { NodeView, RunView } from "../output/writers/views.ts";
import { ActionRun, type NodeInit } from "./ActionRun.ts";
import { currentNode } from "./context.ts";
import type { Exec, LaunchSpec } from "./types.ts";

/**
 * The run: a module singleton that owns the log store, the run folder, the node
 * registry, and the process-wide teardown. `launch` creates a child node under the
 * ambient current action and runs it; `runRoot` runs the `om` body as the root and
 * drives the whole thing to `finalize`, which always produces the artifacts.
 */
export class ExecutionTree {
  static current: ExecutionTree | null = null;

  /** The most recent run — kept for test/debug introspection (not nulled at finalize). */
  static last: ExecutionTree | null = null;

  /** The ambient-run guard: an action can only run inside a root `om(...)`. */
  static require(): ExecutionTree {
    if (!ExecutionTree.current) {
      throw new Error("no active om() run — an action can only run inside a root om(...)");
    }
    return ExecutionTree.current;
  }

  /** For tests: drop the singleton so the next `om(...)` starts clean. */
  static reset(): void {
    ExecutionTree.current = null;
  }

  readonly store = new LogStore();
  readonly folder = new RunFolder();
  readonly root: ActionRun;

  private readonly rawStream: RawStream;
  private readonly consoleCapture: ConsoleCapture;
  private readonly snapshotStore = new SnapshotStore(this.folder);
  private readonly registry: ActionRun[] = [];
  private readonly unsettled = new Set<Promise<unknown>>();
  private readonly originalLog = console.log.bind(console);
  private streaming: Promise<void> | undefined;
  private liveRendering: Promise<void> | undefined;
  private assertionsPassed = 0;
  private assertionsFailed = 0;
  private readonly extraFailures: Array<{ action: string; error: string }> = [];
  private phase: "open" | "closing" | "closed" = "open";

  // Teardown escape: `forced` makes drive() stop waiting on a node that won't settle
  // (its proc is already killed by killTree on abort) so the run can never hang. Set
  // by a 2nd Ctrl+C or, automatically, by the grace timer armed at teardown.
  private sigints = 0;
  private forced = false;
  private readonly forcedWake: Deferred<void> = defer<void>();
  private graceTimer: NodeJS.Timeout | undefined;

  // Process hooks — installed at run start, removed at finalize (they must not outlive the run).
  private readonly onSigint = (): void => this.handleSigint();
  private readonly onUncaught = (e: unknown): void => this.onFatal("uncaughtException", e);
  private readonly onUnhandled = (e: unknown): void => this.onFatal("unhandledRejection", e);

  constructor() {
    this.folder.ensure();
    this.root = new ActionRun({
      ...this.nodeDeps(),
      name: "main",
      uuid: newUuid(),
      id: "main",
      path: "main",
      parentId: null,
      parentSignal: null,
      bubble: () => {}, // the root has no parent to bubble into
    });
    this.registry.push(this.root);
    this.rawStream = new RawStream(this.rawStreamPath());
    this.consoleCapture = new ConsoleCapture(this.store, () =>
      (currentNode.getStore() ?? this.root).toRef()
    );
    ExecutionTree.last = this;
  }

  /** Launch an instance under the ambient current node (or the root). */
  launch(spec: LaunchSpec): ActionRun {
    if (this.phase !== "open") {
      throw new Error(`cannot launch ${spec.name}: the run is "${this.phase}", not "open"`);
    }
    const parent = currentNode.getStore() ?? this.root;
    const uuid = newUuid();
    const id = makeId(spec.name, uuid);
    const nodePath = `${parent.path}/${id}`;
    const node = new ActionRun({
      ...this.nodeDeps(),
      name: spec.name,
      uuid,
      id,
      path: nodePath,
      parentId: parent.id,
      parentSignal: parent.signal,
      // The child folds its milestones (events/asserts/snapshots/done, icon-prefixed)
      // into the parent's log, attributed to this child's id.
      bubble: (message) => this.append(parent, "child", id, message),
    });
    parent.children.push(node);
    this.registry.push(node);
    // Launch reference — the parent's pointer to the child's own (absolute) log.
    this.append(parent, "child", "launch", `→ ${id} · ${this.logFile(nodePath)}`);
    for (const t of spec.tags) node.tag(t);
    const promise = currentNode.run(node, () => node.run(spec.body, spec.args));
    this.trackNode(node, promise);
    return node;
  }

  private append(node: ActionRun, level: string, source: string, message: string): void {
    this.store.append({ nodeId: node.id, path: node.path, level, source, message });
  }

  /** The shared services every node is built with (log store, snapshots, assert tally). */
  private nodeDeps(): {
    store: LogStore;
    snapshots: SnapshotStore;
    onAssert: NodeInit["onAssert"];
  } {
    return {
      store: this.store,
      snapshots: this.snapshotStore,
      onAssert: (pass, actionPath, message) => this.recordAssert(pass, actionPath, message),
    };
  }

  private recordAssert(pass: boolean, actionPath: string, message: string): void {
    if (pass) {
      this.assertionsPassed++;
      return;
    }
    this.assertionsFailed++;
    // A failure during teardown is cascade, not a real fault.
    if (!this.root.signal.aborted) {
      this.extraFailures.push({ action: actionPath, error: `assertion failed: ${message}` });
    }
  }

  /**
   * Ctrl+C, kept caught (`process.on`, not `once`) so a second press can't fall
   * through to Node's hard-kill default. 1st → begin teardown; 2nd → force finalize
   * now (don't wait on a node whose cleanup is wedged — its proc is already killed);
   * 3rd → give up and exit hard.
   */
  private handleSigint(): void {
    this.sigints += 1;
    if (this.sigints === 1) {
      this.beginTeardown("interrupted (SIGINT)");
      this.originalLog("  ↳ stopping… (Ctrl+C again to force)");
      return;
    }
    if (this.sigints === 2) {
      this.originalLog("  ↳ forcing shutdown…");
      this.force();
      return;
    }
    process.exit(130);
  }

  /** Tear the whole run down (aborts the root, cascading to every node). Idempotent. */
  cancel(): void {
    this.beginTeardown("cancelled");
  }

  /**
   * The sole abort path: `open → closing`, narrate the reason once, and abort the
   * root controller (cascading to every node — procs killed, waits unblocked,
   * daemons stopped). Later triggers are no-ops. Arms a grace timer so a node whose
   * cleanup wedges after its proc is already dead can't hang the run forever.
   */
  private beginTeardown(reason: string): void {
    if (this.phase !== "open") return;
    this.phase = "closing";
    this.narrate(`tearing down · ${reason}`);
    this.root.cancel();
    // Not unref'd: during teardown this timer must hold the process alive long
    // enough to force finalize (and write the artifacts) if a node's cleanup wedges.
    // Cleared in finalize the moment the run drains on its own.
    this.graceTimer = setTimeout(() => this.force(), TEARDOWN_GRACE_MS);
  }

  /** Stop waiting on unsettled nodes and let finalize run now. Idempotent. */
  private force(): void {
    this.forced = true;
    this.forcedWake.resolve();
  }

  /** An escaped throw/rejection: log it, record it (unless already tearing down), tear down. */
  private onFatal(kind: string, error: unknown): void {
    this.store.append({
      nodeId: "process",
      path: "process",
      level: "error",
      source: kind,
      message: messageOf(error),
    });
    if (!this.root.signal.aborted)
      this.extraFailures.push({ action: kind, error: messageOf(error) });
    this.beginTeardown(kind);
  }

  /** Run the `om` body as the root node, then drive to finalize. */
  async runRoot(body: Exec<object, unknown, unknown>): Promise<void> {
    this.narrate(`run started · ${this.folder.name()}`);
    this.consoleCapture.install();
    // `on`, not `once`: we must keep catching SIGINT so a second Ctrl+C escalates
    // through handleSigint instead of falling through to Node's hard-kill default.
    process.on("SIGINT", this.onSigint);
    process.on("uncaughtException", this.onUncaught);
    process.on("unhandledRejection", this.onUnhandled);
    this.streaming = this.rawStream.run(this.store);
    // Live, curated milestones to the terminal, through the pre-patch writer.
    this.liveRendering = new LiveRenderer(this.originalLog).run(this.store);

    const rootPromise = currentNode.run(this.root, () => this.root.run(body, []));
    this.trackNode(this.root, rootPromise);
    await rootPromise;
    // Orchestrator crash ⇒ tear the whole run down so a daemon it launched can't hang.
    if (this.root.status === "failed") this.beginTeardown("body error");

    await this.drive();
    await this.finalize();
  }

  private trackNode(node: ActionRun, promise: Promise<void>): void {
    const tracked = promise.finally(() => this.unsettled.delete(tracked));
    this.unsettled.add(tracked);
    // Absorb an un-awaited failure/cancel so it can't surface as an unhandled rejection.
    void node.done.catch(() => {});
  }

  private async drive(): Promise<void> {
    // Drain every launched node. Teardown aborts them (killTree reaps the procs,
    // waits unblock, daemons stop), so they settle and this returns. `force` (2nd
    // Ctrl+C or the grace timer) breaks the wait if a node's *own* cleanup wedges —
    // the OS process is already dead by then, so nothing is orphaned, only the log
    // records the node as unsettled.
    while (this.unsettled.size > 0 && !this.forced) {
      await Promise.race([Promise.allSettled([...this.unsettled]), this.forcedWake.promise]);
    }
  }

  private async finalize(): Promise<void> {
    if (this.phase === "open") this.beginTeardown("completed");
    this.phase = "closed";
    if (this.graceTimer) clearTimeout(this.graceTimer);
    process.off("SIGINT", this.onSigint);
    process.off("uncaughtException", this.onUncaught);
    process.off("unhandledRejection", this.onUnhandled);
    this.narrate("finished");
    this.store.close();
    await this.streaming;
    await this.liveRendering;

    const flat = this.registry.map((node) => this.nodeView(node));
    const entries = this.store.entries();
    const at = (name: string): string => path.join(this.folder.path(), name);
    const assertSummary = `⊨ ${this.assertionsPassed} passed · ⊭ ${this.assertionsFailed} failed`;
    await writeNodeLogs(flat, entries);
    await writeRollup(at("events.log"), flat, entries, (e) => e.level === "event");
    await writeRollup(at("asserts.log"), flat, entries, (e) => e.level === "assert", assertSummary);
    await writeRollup(at("snapshots.log"), flat, entries, (e) => e.level === "snapshot");
    await writeResult(at("result.json"), this.runView());

    this.consoleCapture.uninstall();
    ExecutionTree.current = null;
    this.printSummary(at, assertSummary);
    if (!this.verdictOk()) process.exitCode = 1;
    // A forced finalize means a node's cleanup is still wedged (its proc already
    // dead) — a pending handle could hold the loop open, so exit rather than hang.
    if (this.forced) process.exit(process.exitCode ?? 0);
  }

  /** The end-of-run links + assert summary, to the terminal (files are already written). */
  private printSummary(at: (name: string) => string, assertSummary: string): void {
    const term = this.originalLog;
    term("");
    term(`om → ${this.folder.path()}`);
    term(`  main log  → ${at("main.log")}`);
    term(`  events    → ${at("events.log")}`);
    term(`  asserts   → ${at("asserts.log")}   ${assertSummary}`);
    term(`  snapshots → ${at("snapshots.log")}`);
  }

  private verdictOk(): boolean {
    return !this.registry.some((n) => n.status === "failed") && this.extraFailures.length === 0;
  }

  private nodeView(node: ActionRun): NodeView {
    return {
      id: node.id,
      uuid: node.uuid,
      name: node.name,
      path: node.path,
      parentId: node.parentId,
      tags: [...node.tags],
      args: [...node.args],
      status: node.status,
      startedAt: node.startedAt,
      endedAt: node.endedAt,
      duration: node.duration,
      logFile: this.logFile(node.path),
      children: node.children.map((child) => this.nodeView(child)),
    };
  }

  private runView(): RunView {
    const failures = [
      ...this.registry
        .filter((node) => node.status === "failed")
        .map((node) => ({ action: node.path, error: messageOf(node.error) })),
      ...this.extraFailures,
    ];
    return {
      ok: failures.length === 0,
      failures,
      assertions: { passed: this.assertionsPassed, failed: this.assertionsFailed },
      startedAt: this.root.startedAt,
      endedAt: this.root.endedAt,
      duration: this.root.duration,
      rawStream: this.rawStreamPath(),
      root: this.nodeView(this.root),
    };
  }

  /**
   * Absolute `.log` path for a node — root is `main.log`, children drop the `main/`
   * prefix. Each id segment is sanitized so names with filesystem-illegal characters
   * (e.g. `TSKB:root:watch:docs`) still produce a valid path.
   */
  private logFile(nodePath: string): string {
    const rel = nodePath === "main" ? "main" : nodePath.slice("main/".length);
    const safe = rel.split("/").map(fsSafe).join(path.sep);
    return path.join(this.folder.path(), `${safe}.log`);
  }

  private rawStreamPath(): string {
    return path.join(this.folder.path(), "raw.jsonl");
  }

  private narrate(message: string): void {
    this.store.append({ nodeId: "run", path: "run", level: "run", source: "run", message });
  }
}

/** How long teardown waits for nodes to settle before forcing finalize (ms). */
const TEARDOWN_GRACE_MS = 8000;

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);
