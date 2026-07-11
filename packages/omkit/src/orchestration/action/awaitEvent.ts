import type { Emitter } from "../events/events.ts";

/**
 * A promise for the next emit of `key`. It **never rejects**: it resolves with
 * the event's payload, or with `undefined` if the action settles (`done` — which
 * always fires) before `key` ever does. A retained snapshot resolves it
 * immediately. (Not used for `key === "done"`, which reads the settled Outcome.)
 */
export function awaitEvent<E extends object, K extends keyof E>(
  emitter: Emitter<E>,
  key: K
): Promise<E[K] | undefined> {
  return new Promise<E[K] | undefined>((resolve) => {
    const offs: Array<() => void> = [];
    let settled = false;
    // First of [the event | done] to fire wins; the rest are unsubscribed.
    const settle = (act: () => void): void => {
      if (settled) return;
      settled = true;
      for (const off of offs) off();
      act();
    };
    // listenOnce is keyed by E; the system `done` key is always present on an
    // instance's event map, so reach it through a loosened view.
    const listen = emitter.listenOnce as (
      k: PropertyKey,
      h: (payload: unknown) => void
    ) => () => void;

    offs.push(listen(key, (payload) => settle(() => resolve(payload as E[K]))));
    // `done` fires once on any settle (success or failure); if it beats `key`,
    // the event will never come — resolve `undefined` rather than reject.
    if ((key as PropertyKey) !== "done") {
      offs.push(listen("done", () => settle(() => resolve(undefined))));
    }
    // A retained snapshot fires a listen synchronously during registration; if
    // that already settled us, drop any listeners registered afterwards.
    if (settled) for (const off of offs) off();
  });
}
