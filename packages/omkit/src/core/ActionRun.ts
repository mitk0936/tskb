import { defer, type Deferred } from "../foundation/Deferred.ts";
import { events, type Emitter, type EventHandler } from "../foundation/events.ts";
import { CancelledError } from "../foundation/CancelledError.ts";
import { renderValue } from "../foundation/format.ts";
import type { ActionRef } from "../foundation/ActionRef.ts";
import { createProc } from "../system/proc.ts";
import { FolderCache } from "../system/fs/FolderCache.ts";
import type { LogStore } from "../output/log/LogStore.ts";
import type { SnapshotStore } from "../output/snapshot/SnapshotStore.ts";
import type { ActionContext, Activity, Exec, InstanceEvents, NodeStatus } from "./types.ts";

/** Everything a node needs to exist, minus its behavior. */
export interface NodeInit {
  readonly store: LogStore;
  readonly name: string;
  /** `file:line` where the action was defined (the `.run(...)` site) — for the log header. */
  readonly definedAt: string | undefined;
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
  /** Absolute path to the run's output folder — backs `ctx.artifactsFolder`. */
  readonly artifactsFolder: string;
  /** Report an assertion outcome to the run verdict. */
  readonly onAssert: (pass: boolean, path: string, message: string) => void;
  /** Called when this node fails while unobserved — the tree tears down + records a fault. */
  readonly onUnhandledFailure: (path: string, error: unknown) => void;
  /** Bubble a milestone line into this node's parent log (no-op for the root). */
  readonly bubble: (message: string) => void;
}

/**
 * One node in the {@link ExecutionTree}: its identity, tags, timing, and terminal
 * state, plus the run handle (`result`/`ref`/`once`/`tag`/`cancel`). Self-contained —
 * `run(exec, args)` executes the body inside the error boundary and settles the
 * node; it never throws (the failure is delivered through `.result`).
 */
export class ActionRun<
  Result = unknown,
  Events extends object = object,
  Handle = unknown,
> implements Activity<Result, Events, Handle> {
  readonly id: string;
  readonly uuid: string;
  readonly name: string;
  readonly definedAt: string | undefined;
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
  private readonly artifactsFolder: string;
  private readonly onAssert: (pass: boolean, path: string, message: string) => void;
  private readonly onUnhandledFailure: (path: string, error: unknown) => void;
  private readonly bubble: (message: string) => void;
  private readonly emitter: Emitter<InstanceEvents<Events, Result>> = events();
  private readonly settled: Deferred<Result> = defer<Result>();
  private readonly handle: Deferred<Handle> = defer<Handle>();
  private attached = false;
  private observed = false;
  private refObserved = false;
  private cancelLogged = false;
  // The armed body + args, set at launch and run once by `commit()` on a microtask — the
  // window during which `withCache` may still wrap the body. `committed` closes that window.
  private armedExec: Exec<Events, Handle, Result> | undefined;
  private armedArgs: readonly unknown[] = [];
  private committed = false;
  // Set only by the parent-signal abort listener (an ANCESTOR cancelling this node).
  // Distinguishes a run/ancestor teardown from this node's own subtree-abort on failure,
  // so the unobserved-failure check below isn't fooled by our own controller.abort().
  private cascadeCancelled = false;

  constructor(init: NodeInit) {
    this.id = init.id;
    this.uuid = init.uuid;
    this.name = init.name;
    this.definedAt = init.definedAt;
    this.path = init.path;
    this.parentId = init.parentId;
    this.store = init.store;
    this.snapshots = init.snapshots;
    this.artifactsFolder = init.artifactsFolder;
    this.onAssert = init.onAssert;
    this.onUnhandledFailure = init.onUnhandledFailure;
    this.bubble = init.bubble;

    // Chain cancellation: an ancestor's abort ⇒ this subtree aborts (and is flagged as a
    // cascade, so a concurrent own-failure isn't misread as a fresh unhandled fault).
    const parent = init.parentSignal;
    const onAncestorAbort = (): void => {
      this.cascadeCancelled = true;
      this.noteCancelled(); // this node is being cancelled by an ancestor's teardown
      this.controller.abort();
    };
    if (parent) {
      if (parent.aborted) onAncestorAbort();
      else parent.addEventListener("abort", onAncestorAbort, { once: true });
    }
    // A void-handle awaiter shouldn't surface an unhandled rejection at settle.
    void this.handle.promise.catch(() => {});
    // An unobserved failure is routed to teardown explicitly; swallow the raw rejection
    // here (via the field, not the `done` getter) so it isn't also an unhandledRejection.
    void this.settled.promise.catch(() => {});
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

  get result(): Promise<Result> {
    this.observed = true;
    // The outcome itself: resolves the value, rejects with the error (CancelledError on cancel).
    // Reading it marks the failure observed, so a `.result.catch(fn)` handles a fire-and-forget
    // crash without tearing the run down.
    return this.settled.promise;
  }

  /** The attached handle; rejects on failure/cancel. */
  get ref(): Promise<Handle> {
    this.refObserved = true;
    return this.handle.promise;
  }

  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): void {
    // A late `on("error")` (e.g. attached after an `await`, once the body has already
    // failed) still receives the failure: the emitter snapshots the last "error" payload
    // and replays it to a new listener.
    if (key === "error") this.observed = true;
    this.emitter.listen(key, handler);
  }

  once<K extends keyof InstanceEvents<Events, Result>>(
    key: K
  ): Promise<InstanceEvents<Events, Result>[K] | undefined> {
    // `done` is the outcome itself — identical to `.result` (resolve the value, reject on failure).
    if (key === "done") return this.result as Promise<InstanceEvents<Events, Result>[K]>;
    // Awaiting an event observes the activity: resolve the payload when it fires, but if the
    // activity settles first, resolve `undefined` on success and **reject** on failure/cancel —
    // so an event gate surfaces a failure instead of hanging (or, for `error`, hand back the error).
    this.observed = true;
    return new Promise((resolve, reject) => {
      let done = false;
      const win = (): boolean => (done ? false : (done = true));
      this.emitter.listenOnce(key, (p) => {
        if (win()) resolve(p);
      });
      this.settled.promise.then(
        () => {
          if (win()) resolve(undefined);
        },
        (error: unknown) => {
          if (win()) key === "error" ? resolve(error as never) : reject(error);
        }
      );
    });
  }

  tag(name: string): this {
    this.tags.push(name);
    this.log("tag", "tag", name);
    return this;
  }

  withCache(...paths: string[]): Activity<Result | undefined, Events, Handle> {
    if (this.committed) {
      throw new Error("withCache: already launched — chain it before the first await");
    }
    // Validate + canonicalize eagerly (fails fast on a relative path), then wrap the armed
    // body so a fingerprint hit skips it. Applied before `commit()` runs the body.
    const targets = FolderCache.resolvePaths(paths);
    const inner = this.armedExec;
    if (inner) this.armedExec = cacheGate(inner, targets) as Exec<Events, Handle, Result>;
    return this as unknown as Activity<Result | undefined, Events, Handle>;
  }

  cancel(): void {
    this.noteCancelled(); // a direct cancel of this activity
    this.controller.abort();
  }

  /**
   * Log a cancellation milestone on this node (once) and bubble it to the parent, so a
   * cancellation is visible per-action and up the tree into `main`. Only while the node is
   * still running — a node that already settled isn't "cancelled" by a later teardown — and
   * never for the root, whose cancellation is the run-level `tearing down · …` narration.
   */
  private noteCancelled(): void {
    if (this.cancelLogged || this.parentId === null || this.status !== "running") return;
    this.cancelLogged = true;
    this.log("event", "cancel", "cancelled");
    this.bubble("⊘ cancelled");
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /**
   * Arm the node with its body + args. The body is not run here — {@link commit} runs it
   * one microtask later, leaving a window in which `withCache` can still wrap it.
   */
  arm(exec: Exec<Events, Handle, Result>, args: readonly unknown[]): void {
    this.armedExec = exec;
    this.armedArgs = args;
  }

  /** Run the armed body once (idempotent). Called on a microtask after the launching call. */
  commit(): Promise<void> {
    if (this.committed) return Promise.resolve();
    this.committed = true;
    const exec = this.armedExec;
    this.armedExec = undefined;
    return exec ? this.run(exec, this.armedArgs) : Promise.resolve();
  }

  /** Run the body inside the error boundary, settling the node. Never rejects. */
  async run(exec: Exec<Events, Handle, Result>, args: readonly unknown[]): Promise<void> {
    this.args = args;
    this.startedAt = Date.now();
    this.lifecycle("launched");
    // Cancelled before the body could start — the run tore down between the launching call
    // and this microtask. Record a clean stop without invoking the body, so a daemon that
    // only listens for `abort` (its listener would never fire, the abort having already
    // happened) can't wedge teardown.
    if (this.controller.signal.aborted) {
      this.fail(new CancelledError());
      return;
    }
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
      artifactsFolder: this.artifactsFolder,
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
    // A failed action's work is over: abort its OWN subtree (children → CancelledError,
    // procs killed). This is local cleanup, independent of the run verdict. It sets our
    // signal.aborted, which is why the check below uses `cascadeCancelled`, not
    // `signal.aborted`, to tell an unhandled fault from a run/ancestor teardown.
    this.controller.abort();
    // If, one microtask on, no one is positioned to receive this error (no `.result`/`.ref`/
    // `.once` read, no `on("error")`, no `.result.catch`) and we weren't caught in an ancestor's
    // teardown, it's unhandled — tell the tree to tear the run down and record the fault.
    // `sysEmit("error")` above already ran, so a live error handler has set `observed`.
    queueMicrotask(() => {
      const observed = this.observed || (this.refObserved && !this.attached);
      if (!observed && !this.cascadeCancelled) this.onUnhandledFailure(this.path, error);
    });
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

/**
 * Wrap an exec so it skips (returns `undefined`, logging `cached, skipping`) when the
 * input `targets` are unchanged since the last successful run, else runs the inner body
 * and records the fresh fingerprint. Backs {@link ActionRun.withCache}.
 */
const cacheGate = <E extends object, H, R>(
  inner: Exec<E, H, R>,
  targets: string[]
): Exec<E, H, R | undefined> =>
  (async (ctx, ...args): Promise<R | undefined> => {
    const fp = await FolderCache.fingerprint(targets);
    if ((await FolderCache.read(targets)) === fp) {
      console.log("cached, skipping");
      return undefined;
    }
    const result = await inner(ctx, ...(args as never[]));
    await FolderCache.write(targets, fp);
    return result;
  }) as Exec<E, H, R | undefined>;
