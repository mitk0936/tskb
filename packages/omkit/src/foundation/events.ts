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
  emit<K extends keyof Events>(key: K, ...args: EmitArgs<Events[K]>): void;
  listen<K extends keyof Events>(key: K, handler: EventHandler<Events[K]>): () => void;
  listenOnce<K extends keyof Events>(key: K, handler: EventHandler<Events[K]>): () => void;
  /** Observe every live emit, whatever the key — the cross-cutting hook (e.g. logging). */
  onAny(handler: (key: keyof Events, payload: unknown) => void): () => void;
}

export const events = <Events extends object>(): Emitter<Events> => {
  const handlers = new Map<keyof Events, Set<EventHandler<unknown>>>();
  const snapshots = new Map<keyof Events, unknown>();
  const anyHandlers = new Set<(key: keyof Events, payload: unknown) => void>();

  const emit = <K extends keyof Events>(key: K, ...args: EmitArgs<Events[K]>): void => {
    const payload = args[0] as Events[K];
    snapshots.set(key, payload);
    for (const handler of [...anyHandlers]) handler(key, payload);
    const set = handlers.get(key);
    if (!set) return;
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
    if (snapshots.has(key)) handler(snapshots.get(key) as Events[K], { isSnapshot: true });
    return () => {
      set.delete(handler as EventHandler<unknown>);
    };
  };

  const listenOnce = <K extends keyof Events>(
    key: K,
    handler: EventHandler<Events[K]>
  ): (() => void) => {
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

  const onAny = (handler: (key: keyof Events, payload: unknown) => void): (() => void) => {
    anyHandlers.add(handler);
    return () => {
      anyHandlers.delete(handler);
    };
  };

  return { emit, listen, listenOnce, onAny };
};
