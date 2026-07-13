import { defer, type Deferred } from "../foundation/Deferred.ts";
import { events, type Emitter, type EventHandler } from "../foundation/events.ts";
import { CancelledError } from "../foundation/CancelledError.ts";
import { renderValue } from "../foundation/format.ts";
import type { ActionRef } from "../foundation/ActionRef.ts";
import { createProc } from "../system/proc.ts";
import type { LogStore } from "../output/log/LogStore.ts";
import type { SnapshotStore } from "../output/snapshot/SnapshotStore.ts";
import type { ActionContext, Exec, InstanceEvents, NodeStatus, RunHandle } from "./types.ts";

/** Everything a node needs to exist, minus its behavior. */
export interface NodeInit {
  readonly store: LogStore;
  readonly name: string;
  readonly uuid: string;
  /** `${name}_${shortId}`, or `main` for the root. */
  readonly id: string;
  /** Ancestry of ids joined by `/`. */
  readonly path: string;
  readonly parentId: string | null;
  /** The parent's signal — this node's controller chains off it. */
  readonly parentSignal: AbortSignal | null;
  /** The run's snapshot store — backs `ctx.snapshot`. */
  readonly snapshots: SnapshotStore;
  /** Report an assertion outcome to the run verdict. */
  readonly onAssert: (pass: boolean, path: string, message: string) => void;
  /** Bubble a milestone line into this node's parent log (no-op for the root). */
  readonly bubble: (message: string) => void;
}

/**
 * One node in the {@link ExecutionTree}: its identity, tags, timing, and terminal
 * state, plus the run handle (`done`/`ref`/`once`/`tag`/`cancel`). Self-contained —
 * `run(exec, args)` executes the body inside the error boundary and settles the
 * node; it never throws (the failure is delivered through `.done`).
 */
export class ActionRun<
  Result = unknown,
  Events extends object = object,
  Handle = unknown,
> implements RunHandle<Result, Events, Handle> {
  readonly id: string;
  readonly uuid: string;
  readonly name: string;
  readonly path: string;
  readonly parentId: string | null;
  readonly tags: string[] = [];
  /** The captured args this node ran with (for the log header); set at run start. */
  args: readonly unknown[] = [];
  readonly children: ActionRun[] = [];
  readonly controller = new AbortController();

  status: NodeStatus = "running";
  value: Result | undefined;
  error: unknown;
  startedAt = 0;
  endedAt = 0;
  duration = 0;

  private readonly store: LogStore;
  private readonly snapshots: SnapshotStore;
  private readonly onAssert: (pass: boolean, path: string, message: string) => void;
  private readonly bubble: (message: string) => void;
  private readonly emitter: Emitter<InstanceEvents<Events, Result>> = events();
  private readonly settled: Deferred<Result> = defer<Result>();
  private readonly handle: Deferred<Handle> = defer<Handle>();
  private attached = false;

  constructor(init: NodeInit) {
    this.id = init.id;
    this.uuid = init.uuid;
    this.name = init.name;
    this.path = init.path;
    this.parentId = init.parentId;
    this.store = init.store;
    this.snapshots = init.snapshots;
    this.onAssert = init.onAssert;
    this.bubble = init.bubble;

    // Chain cancellation: parent abort ⇒ this subtree aborts.
    const parent = init.parentSignal;
    if (parent) {
      if (parent.aborted) this.controller.abort();
      else parent.addEventListener("abort", () => this.controller.abort(), { once: true });
    }
    // A void-handle awaiter shouldn't surface an unhandled rejection at settle.
    void this.handle.promise.catch(() => {});
  }

  /** A stable reference for headers/attribution (tags are the accumulated set now). */
  toRef(): ActionRef {
    return { id: this.id, name: this.name, path: this.path, tags: [...this.tags] };
  }

  /** This node's abort signal — handed to the exec as `ctx.signal`. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  // ── Run handle surface ─────────────────────────────────────────────────────

  get done(): Promise<Result> {
    return this.settled.promise;
  }

  /** The attached handle; rejects on failure/cancel. */
  get ref(): Promise<Handle> {
    return this.handle.promise;
  }

  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): void {
    this.emitter.listen(key, handler);
  }

  once<K extends keyof InstanceEvents<Events, Result>>(
    key: K
  ): Promise<InstanceEvents<Events, Result>[K] | undefined> {
    if (key === "done") {
      return this.settled.promise.then(
        (v) => v as InstanceEvents<Events, Result>[K],
        () => undefined
      );
    }
    return new Promise((resolve) => {
      let done = false;
      const settle = (v: InstanceEvents<Events, Result>[K] | undefined): void => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      const doneKey = "done" as keyof InstanceEvents<Events, Result>;
      this.emitter.listenOnce(key, (p) => settle(p));
      this.emitter.listenOnce(doneKey, () => settle(undefined));
    });
  }

  tag(name: string): this {
    this.tags.push(name);
    this.log("tag", "tag", name);
    return this;
  }

  cancel(): void {
    this.controller.abort();
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /** Run the body inside the error boundary, settling the node. Never rejects. */
  async run(exec: Exec<Events, Handle, Result>, args: readonly unknown[]): Promise<void> {
    this.args = args;
    this.startedAt = Date.now();
    this.lifecycle("launched");
    try {
      const result = await exec(this.context(), ...(args as never[]));
      this.succeed(result);
    } catch (error) {
      this.fail(error);
    }
  }

  private context(): ActionContext<Events, Handle> {
    return {
      signal: this.signal,
      logs: this.store,
      emit: ((key: keyof Events, payload: unknown) => {
        (this.emitter.emit as (k: keyof Events, p?: unknown) => void)(key, payload);
        const rendered = payload === undefined ? "" : ` · ${renderValue(payload)}`;
        this.log("event", "event", `${String(key)}${rendered}`);
        this.bubble(`⚡ ${String(key)}${rendered}`);
      }) as unknown as Emitter<Events>["emit"],
      attach: (handle: Handle) => this.attach(handle),
      tag: (name: string) => void this.tag(name),
      assert: (condition: boolean, message: string) => this.assertInvariant(condition, message),
      snapshot: (name: string, value: unknown) => this.captureSnapshot(name, value),
      proc: createProc(
        (source, level, message) =>
          this.store.append({ nodeId: this.id, path: this.path, level, source, message }),
        this.signal
      ),
    };
  }

  private assertInvariant(condition: boolean, message: string): void {
    const line = `${condition ? "⊨ pass" : "⊭ FAIL"} · ${message}`;
    this.log("assert", "assert", line);
    this.bubble(line);
    this.onAssert(condition, this.path, message);
  }

  private async captureSnapshot(name: string, value: unknown): Promise<string> {
    const file = await this.snapshots.write(name, value, this.id);
    this.log("snapshot", "snapshot", `${name} → ${file}`);
    this.bubble(`📸 ${name} → ${file}`);
    return file;
  }

  private attach(handle: Handle): void {
    if (this.attached) return;
    this.attached = true;
    this.handle.resolve(handle);
    this.sysEmit("attached");
    this.bubble("attached");
  }

  private succeed(result: Result): void {
    this.finishTiming();
    this.status = "ok";
    this.value = result;
    this.lifecycle("done · ok");
    this.bubble("✓ done · ok");
    this.settled.resolve(result);
    this.sysEmit("done", result);
    // Settle a never-attached void handle so `.ref` awaiters resolve instead of hang.
    this.handle.resolve(undefined as Handle);
  }

  private fail(error: unknown): void {
    this.finishTiming();
    // Classify: an aborted signal ⇒ intentional teardown, not a fault. The thrown
    // error is then just the killed-child artifact (often blank), so we drop it and
    // record a clean stop; a genuine failure keeps its error and the ✗ styling.
    if (this.signal.aborted) {
      this.status = "cancelled";
      this.error = error;
      this.lifecycle("done · cancelled");
      this.bubble("⊘ done · cancelled");
      this.sysEmit("done", undefined);
      this.settled.reject(new CancelledError());
      this.handle.reject(new CancelledError());
      return;
    }
    this.status = "failed";
    this.error = error;
    this.log("error", "error", messageOf(error));
    this.bubble(`✗ ${firstLine(messageOf(error))}`);
    this.sysEmit("error", error);
    this.lifecycle("done · failed");
    this.bubble("✗ done · failed");
    this.sysEmit("done", undefined);
    this.settled.reject(error);
    this.handle.reject(error);
  }

  /** The framework's own emits (loosely typed — sidesteps EmitArgs for void payloads). */
  private sysEmit(key: "attached" | "done" | "error", payload?: unknown): void {
    (this.emitter.emit as unknown as (k: string, p?: unknown) => void)(key, payload);
  }

  private finishTiming(): void {
    this.endedAt = Date.now();
    this.duration = this.endedAt - this.startedAt;
  }

  /**
   * A lifecycle transition (`launched`, `done · ok|failed|cancelled`) — logged as an
   * `event` on this node so it joins the unified event stream (`events.log`) and the
   * node's own log, distinct from user emits by its `lifecycle` source.
   */
  private lifecycle(message: string): void {
    this.log("event", "lifecycle", message);
  }

  private log(level: string, source: string, message: string): void {
    this.store.append({ nodeId: this.id, path: this.path, level, source, message });
  }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

const firstLine = (message: string): string => message.split("\n", 1)[0] ?? message;
