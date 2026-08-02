import path from "node:path";
import { newUuid, makeId, omHash } from "../foundation/ids.ts";
import { fsSafe } from "../foundation/fsSafe.ts";
import { siteFile } from "../foundation/callsite.ts";
import { defer, type Deferred } from "../foundation/Deferred.ts";
import { LogStore } from "../output/log/LogStore.ts";
import { RunFolder } from "../output/folder/RunFolder.ts";
import { RawStream } from "../output/log/RawStream.ts";
import { SnapshotStore } from "../output/snapshot/SnapshotStore.ts";
import { ArtifactStore, type ArtifactRecord } from "../output/artifact/ArtifactStore.ts";
import { ConsoleCapture } from "../output/console/ConsoleCapture.ts";
import { LiveRenderer } from "../output/LiveRenderer.ts";
import { writeNodeLogs } from "../output/writers/NodeLogWriter.ts";
import { writeRollup } from "../output/writers/RollupWriter.ts";
import { writeResult } from "../output/writers/ResultWriter.ts";
import type { ArtifactView, NodeView, RunView } from "../output/writers/views.ts";
import { ActionRun, type NodeInit } from "./ActionRun.ts";
import { procRegistry } from "../system/proc.ts";
import { currentNode } from "./context.ts";
import { activeSupervisor } from "./interaction.ts";
import type { Exec, LaunchSpec, OmDescription } from "./types.ts";
import type { LogEntry } from "../foundation/LogEntry.ts";

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
  readonly folder: RunFolder;
  readonly root: ActionRun;
  /**
   * The om's `.describe(…)` summary, carried here from the builder so it survives the
   * terminal `.run(...)` call. Stored so it is retrievable; nothing reads it yet.
   */
  readonly description: OmDescription | undefined;

  private readonly rawStream: RawStream;
  private readonly consoleCapture: ConsoleCapture;
  private readonly snapshotStore: SnapshotStore;
  private readonly artifactStore = new ArtifactStore();
  private readonly registry: ActionRun[] = [];
  private readonly unsettled = new Set<Promise<unknown>>();
  private readonly originalLog = console.log.bind(console);
  private streaming: Promise<void> | undefined;
  private liveRendering: Promise<void> | undefined;
  private forwarding: Promise<void> | undefined;
  private assertionsPassed = 0;
  private assertionsFailed = 0;
  // The root's args are resolved *inside* its body (prompting is async), so unlike a
  // child node's they cannot be handed to `run()` up front — they are recorded here
  // instead and projected onto the root by `nodeView`.
  private rootArgs: readonly unknown[] = [];
  private readonly faults: Array<{ action: string; error: string }> = [];

  static graceMs = 5000; // teardown waits this long for nodes to settle, then finalizes anyway

  private phase: "open" | "closing" | "closed" = "open";
  // Memoizes the in-flight finalize work so the grace timer's fire-and-forget call
  // and runRoot's awaited call share (and both wait on) the same execution — a plain
  // boolean guard would let the second caller return early while the first is still
  // mid-flight (writes/uninstall not yet done), resolving `om()` too soon.
  private finalizing: Promise<void> | undefined;
  private graceTimer: NodeJS.Timeout | undefined;
  private readonly teardownGrace: Deferred<void> = defer<void>();
  private readonly onSigint = (): void => this.teardown("interrupted (SIGINT)");

  // Process hooks — installed at run start, removed at finalize (they must not outlive the run).
  private readonly onUncaught = (e: unknown): void => this.onFatal("uncaughtException", e);
  private readonly onUnhandled = (e: unknown): void => this.onFatal("unhandledRejection", e);

  constructor(name: string, definedAt?: string, description?: OmDescription) {
    this.description = description;
    // The run's identity: its name + where om() is written (not how it was launched),
    // so same-named oms in different files get distinct log folders.
    this.folder = new RunFolder(name, omHash(name, siteFile(definedAt)));
    this.snapshotStore = new SnapshotStore(this.folder);
    this.folder.ensure();
    this.root = new ActionRun({
      ...this.nodeDeps(),
      name: "main",
      definedAt, // where om() was called — the run's script
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

  /** Record the run's resolved args, so the root's log header reports them. */
  setRootArgs(args: unknown): void {
    this.rootArgs = [args];
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
      definedAt: spec.definedAt,
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
    // Launch reference — the parent's pointer to the child's own (absolute) log, plus where
    // the action is defined, so `main` (and any parent) shows each child's script.
    const defined = spec.definedAt ? ` · defined ${spec.definedAt}` : "";
    this.append(parent, "child", "launch", `→ ${id} · ${this.logFile(nodePath)}${defined}`);
    for (const t of spec.tags) node.tag(t);
    // Arm the body now, but commit it on a microtask: this lets `withCache`/`tag` chained on
    // the returned handle (before the caller's first await) apply before the body starts.
    // The tracked promise is registered synchronously (so `drive()` waits on it), and the
    // microtask is scheduled unconditionally so a fire-and-forget launch still commits.
    node.arm(spec.body, spec.args);
    const settled = defer<void>();
    this.trackNode(settled.promise);
    queueMicrotask(() => {
      void currentNode.run(node, () => node.commit()).then(() => settled.resolve());
    });
    return node;
  }

  private append(node: ActionRun, level: string, source: string, message: string): void {
    this.store.append({ nodeId: node.id, path: node.path, level, source, message });
  }

  /** The shared services every node is built with (log store, snapshots, assert tally). */
  private nodeDeps(): {
    store: LogStore;
    snapshots: SnapshotStore;
    artifacts: ArtifactStore;
    artifactsFolder: string;
    onAssert: NodeInit["onAssert"];
    onUnhandledFailure: NodeInit["onUnhandledFailure"];
  } {
    return {
      store: this.store,
      snapshots: this.snapshotStore,
      artifacts: this.artifactStore,
      artifactsFolder: this.folder.path(),
      onAssert: (pass, actionPath, message) => this.recordAssert(pass, actionPath, message),
      onUnhandledFailure: (actionPath, error) => {
        this.recordFault(actionPath, error);
        this.teardown(`${actionPath} failed`);
      },
    };
  }

  private recordFault(action: string, error: unknown): void {
    this.faults.push({ action, error: messageOf(error) });
  }

  private recordAssert(pass: boolean, actionPath: string, message: string): void {
    if (pass) {
      this.assertionsPassed++;
      return;
    }
    this.assertionsFailed++;
    // A failure during teardown is cascade, not a real fault.
    if (!this.root.signal.aborted) {
      this.recordFault(actionPath, `assertion failed: ${message}`);
    }
  }

  /** Tear the whole run down (aborts the root, cascading to every node). Idempotent. */
  cancel(): void {
    this.teardown("cancelled");
  }

  /**
   * The sole teardown path: `open → closing`, narrate the reason once, abort the root
   * (cascading to every node — procs killed, waits unblocked, daemons stopped). Later
   * calls are no-ops. A single grace timer guarantees finalize even if a node's cleanup
   * wedges after its proc is already dead, so the run always writes its log.
   */
  teardown(reason: string): void {
    if (this.phase !== "open") return;
    this.phase = "closing";
    this.narrate(`tearing down · ${reason}`);
    this.root.cancel();
    // Not unref'd: it must hold the process alive long enough to finalize.
    this.graceTimer = setTimeout(() => {
      this.teardownGrace.resolve(); // break drive()'s wait on a node that won't settle
      void this.finalize(); // …and finalize even if drive() was never reached (hung body)
    }, ExecutionTree.graceMs);
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
    if (!this.root.signal.aborted) this.recordFault(kind, error);
    this.teardown(kind);
  }

  /** Run the `om` body as the root node, then drive to finalize. */
  async runRoot(body: Exec<object, unknown, unknown>): Promise<void> {
    this.narrate(`run started · ${this.folder.name()}`);
    this.consoleCapture.install();
    // `on`, not `once`: SIGINT must stay caught for the life of the run so it can't
    // fall through to Node's hard-kill default before finalize writes the log.
    process.on("SIGINT", this.onSigint);
    process.on("uncaughtException", this.onUncaught);
    process.on("unhandledRejection", this.onUnhandled);
    this.streaming = this.rawStream.run(this.store);
    const supervisor = activeSupervisor();
    if (supervisor) {
      // Supervised: the supervisor owns the terminal. Forward every entry up the channel
      // instead of rendering, and tear down on its cancel request.
      supervisor.onCancel(() => this.cancel());
      this.forwarding = (async () => {
        for await (const entry of this.store.subscribe({ replay: true })) supervisor.log(entry);
      })();
    } else {
      // Bare: live, curated milestones to the terminal — a single in-place status line on a TTY.
      // Straight to process.stdout, which patch-console doesn't intercept (no capture feedback).
      this.liveRendering = new LiveRenderer(process.stdout).run(this.store);
    }

    const rootPromise = currentNode.run(this.root, () => this.root.run(body, []));
    this.trackNode(rootPromise);
    await rootPromise;

    await this.drive();
    await this.finalize();
  }

  /**
   * Track a launched node's `run()` promise until it settles (drives `drive()`'s
   * wait). `run()` itself never rejects — the node's own constructor already
   * swallows its settled rejection (via the private field, not the `.result` getter,
   * so it doesn't mark the node observed and defeat the unobserved-failure check).
   */
  private trackNode(promise: Promise<void>): void {
    const tracked = promise.finally(() => this.unsettled.delete(tracked));
    this.unsettled.add(tracked);
  }

  private async drive(): Promise<void> {
    // Drain every launched node. Teardown aborts them (procs reaped, waits unblocked),
    // so they settle and this returns. The grace timer resolves `teardownGrace` if a
    // node's own cleanup wedges — the OS process is already dead by then.
    while (this.unsettled.size > 0) {
      const graced = await Promise.race([
        Promise.allSettled([...this.unsettled]).then(() => false),
        this.teardownGrace.promise.then(() => true),
      ]);
      if (graced) break;
    }
  }

  private finalize(): Promise<void> {
    if (!this.finalizing) this.finalizing = this.finalizeOnce();
    return this.finalizing;
  }

  private async finalizeOnce(): Promise<void> {
    if (this.phase === "open") this.teardown("completed");
    this.phase = "closed";
    if (this.graceTimer) clearTimeout(this.graceTimer);
    // Reap any Windows grandchild a mashed Ctrl+C orphaned before killTree could reach it
    // (no-op elsewhere, and when nothing was tracked).
    procRegistry.sweep();
    this.narrate("finished");
    this.store.close();
    await this.streaming;
    await this.liveRendering;
    await this.forwarding;

    const flat = this.registry.map((node) => this.nodeView(node));
    const entries = this.store.entries();
    const at = (name: string): string => path.join(this.folder.path(), name);
    const assertSummary = `⊨ ${this.assertionsPassed} passed · ⊭ ${this.assertionsFailed} failed`;
    const summary = this.summaryLines(at, assertSummary);
    await writeNodeLogs(flat, entries, summary);
    await writeRollup(at("events.log"), flat, entries, (e) => e.level === "event");
    await writeRollup(at("asserts.log"), flat, entries, (e) => e.level === "assert", assertSummary);
    await writeRollup(at("snapshots.log"), flat, entries, (e) => e.level === "snapshot");
    await writeRollup(at("artifacts.log"), flat, entries, (e) => e.level === "artifact");
    await writeResult(at("result.json"), this.runView());

    // Only now let go of the process hooks — a Ctrl+C during the writes must still be
    // caught (as a no-op) so it can't fall through to Node's kill-without-log default.
    process.off("SIGINT", this.onSigint);
    process.off("uncaughtException", this.onUncaught);
    process.off("unhandledRejection", this.onUnhandled);
    this.consoleCapture.uninstall();
    ExecutionTree.current = null;
    const supervisor = activeSupervisor();
    // Forward the same recap block the bare run prints to its terminal, so a supervising
    // frontend (the ink console) can show it verbatim — see printSummary.
    if (supervisor) supervisor.settled(this.verdictOk(), this.folder.path(), summary);
    else this.printSummary(summary);
    if (!this.verdictOk()) process.exitCode = 1;
  }

  /**
   * The end-of-run recap: the run folder, sibling log paths, and the assert tally.
   * Shared verbatim between the terminal (via {@link printSummary}) and the tail of
   * `main.log` (as the footer passed to `writeNodeLogs`), so both close the same way.
   */
  private summaryLines(at: (name: string) => string, assertSummary: string): string[] {
    return [
      `om → ${this.folder.path()}`,
      `  main log  → ${at("main.log")}`,
      `  events    → ${at("events.log")}`,
      `  asserts   → ${at("asserts.log")}   ${assertSummary}`,
      `  snapshots → ${at("snapshots.log")}`,
      `  artifacts → ${at("artifacts.log")}`,
    ];
  }

  /** The recap to the terminal (files are already written). */
  private printSummary(lines: readonly string[]): void {
    const term = this.originalLog;
    term("");
    for (const line of lines) term(line);
  }

  private verdictOk(): boolean {
    return this.faults.length === 0;
  }

  private nodeView(node: ActionRun): NodeView {
    return {
      id: node.id,
      uuid: node.uuid,
      name: node.name,
      definedAt: node.definedAt,
      path: node.path,
      parentId: node.parentId,
      tags: [...node.tags],
      // The root never has args passed to `run()`; its own are resolved mid-body.
      args: [...(node.parentId === null ? this.rootArgs : node.args)],
      status: node.status,
      startedAt: node.startedAt,
      endedAt: node.endedAt,
      duration: node.duration,
      logFile: this.logFile(node.path),
      children: node.children.map((child) => this.nodeView(child)),
    };
  }

  /** Test seam: the projected run view (same object written to result.json). */
  runViewForTest(): RunView {
    return this.runView();
  }

  /** Test seam: the run's curated artifacts. */
  artifactsForTest(): readonly ArtifactRecord[] {
    return this.artifactStore.all();
  }

  /** Test seam: every log entry recorded for this run. */
  entriesForTest(): readonly LogEntry[] {
    return this.store.entries();
  }

  private runView(): RunView {
    return {
      ok: this.faults.length === 0,
      failures: [...this.faults],
      assertions: { passed: this.assertionsPassed, failed: this.assertionsFailed },
      startedAt: this.root.startedAt,
      endedAt: this.root.endedAt,
      duration: this.root.duration,
      rawStream: this.rawStreamPath(),
      root: this.nodeView(this.root),
      artifacts: this.curatedArtifacts(),
    };
  }

  /**
   * The run's curated artifacts, keyed by `(nodeId, name)`: one action re-registering
   * a name (e.g. re-labelling the same file after regenerating it) updates that entry
   * in place rather than appending a second one, so `result.json` always reflects the
   * latest registration per name. Keying on the pair — not `name` alone — matters
   * because two *different* actions can independently choose the same name (two
   * screenshot steps both calling `ctx.artifact("screenshot", …)`); those describe two
   * distinct files and both must survive into `result.json`, not collapse into one.
   * Position follows first registration; `artifacts.log` (a chronological rollup, like
   * `events.log`/`asserts.log`) is unaffected either way and still lists every call.
   *
   * The pair is joined with `\0` — the same separator `omHash` uses, and for the same
   * reason: a step name may legitimately contain colons (`TSKB:root:watch:docs`) and an
   * artifact name is free-form, so any printable separator can be forged inside a key.
   */
  private curatedArtifacts(): readonly ArtifactView[] {
    const byKey = new Map<string, ArtifactView>();
    for (const { name, file, description, mime, nodeId } of this.artifactStore.all()) {
      byKey.set(`${nodeId}\0${name}`, {
        name,
        file,
        mime,
        ...(description === undefined ? {} : { description }),
      });
    }
    return [...byKey.values()];
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

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);
