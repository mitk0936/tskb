import { log } from "./log-collector/global.ts";
import { captureSnapshot } from "./output.ts";

/** Passed to every handler so it can tell a replayed snapshot from a live emit. */
export interface EventMeta {
  /** True when called with the retained last value on subscribe; false for a live emit. */
  readonly isSnapshot: boolean;
}

export type EventHandler<P> = (payload: P, meta: EventMeta) => void;

/** No payload arg for `void` events, a required one otherwise. */
type EmitArgs<P> = [P] extends [void] ? [] : [payload: P];

/**
 * A typed pub/sub keyed by an event map (`{ key: payload }`). It snapshots the
 * last payload per key, so a late `listen`/`listenOnce` is replayed that value
 * immediately (with `isSnapshot: true`) before receiving live emits.
 */
export interface Emitter<Events extends object> {
  /** Emit `key`'s payload to current listeners and retain it as the snapshot. */
  emit<K extends keyof Events>(key: K, ...args: EmitArgs<Events[K]>): void;
  /** Subscribe to `key`. Fires immediately with the snapshot if one exists. Returns an unsubscribe. */
  listen<K extends keyof Events>(key: K, handler: EventHandler<Events[K]>): () => void;
  /** Like {@link Emitter.listen} but auto-unsubscribes after the first delivery (snapshot counts). */
  listenOnce<K extends keyof Events>(key: K, handler: EventHandler<Events[K]>): () => void;
}

export const events = <Events extends object>(namespace?: string): Emitter<Events> => {
  const handlers = new Map<keyof Events, Set<EventHandler<unknown>>>();
  const snapshots = new Map<keyof Events, unknown>();

  const emit = <K extends keyof Events>(key: K, ...args: EmitArgs<Events[K]>): void => {
    const payload = args[0] as Events[K];
    snapshots.set(key, payload);

    // Every emit also lands in the global log, so events share the timeline with
    // process output and end up in the drained log file. Fields are `·`-delimited
    // — namespace (the emitting action) · key · payload. String payloads show
    // inline; richer payloads are no longer dropped — they're written to a
    // snapshot file and linked (`→ <path>`), so the durable record keeps them.
    const fields = [namespace, String(key)];
    if (typeof payload === "string") {
      fields.push(payload);
    } else if (payload !== undefined) {
      const name = `event-${[namespace, String(key)].filter(Boolean).join("-")}`;
      fields.push(`→ ${captureSnapshot(name, payload).rel}`);
    }
    log.append({
      source: "event",
      level: "event",
      message: fields.filter(Boolean).join(" · "),
    });

    const set = handlers.get(key);
    if (!set) return;
    // Copy so a handler unsubscribing (or listenOnce) mid-emit doesn't disturb iteration.
    for (const handler of [...set]) handler(payload, { isSnapshot: false });
  };

  const listen = <K extends keyof Events>(
    key: K,
    handler: EventHandler<Events[K]>
  ): (() => void) => {
    let set = handlers.get(key);
    if (!set) {
      set = new Set();
      handlers.set(key, set);
    }
    set.add(handler as EventHandler<unknown>);

    // Snapshot on subscribe, if one has ever been emitted for this key.
    if (snapshots.has(key)) handler(snapshots.get(key) as Events[K], { isSnapshot: true });

    return () => {
      set.delete(handler as EventHandler<unknown>);
    };
  };

  const listenOnce = <K extends keyof Events>(
    key: K,
    handler: EventHandler<Events[K]>
  ): (() => void) => {
    // A retained snapshot satisfies "once" immediately — deliver and we're done.
    if (snapshots.has(key)) {
      handler(snapshots.get(key) as Events[K], { isSnapshot: true });
      return () => {};
    }

    const off = listen(key, (payload, meta) => {
      off();
      handler(payload, meta);
    });
    return off;
  };

  return { emit, listen, listenOnce };
};
