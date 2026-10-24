import { callerSite } from "../foundation/callsite.ts";
import { currentNode } from "./context.ts";

/** Calls recorded per handle; past this the trace goes quiet, so a polling loop can't flood the log. */
export const REF_CALL_CAP = 500;

/** One method call on a traced handle, as {@link traceHandle} reports it. */
export interface RefCall {
  /** The calling node's id. */
  readonly from: string;
  readonly site: string | undefined;
  readonly key: string;
  readonly ms: number;
  readonly outcome: "ok" | "failed";
}

/** Members never recorded: promise/serialization/inspection plumbing, not the caller's intent. */
const QUIET = new Set([
  "then",
  "catch",
  "finally",
  "toJSON",
  "toString",
  "valueOf",
  "inspect",
  "constructor",
]);

/**
 * Wrap an attached handle so each public method call on it is reported — who called (the
 * ambient node), from where, how long it took, and whether it threw. Shallow by design: what
 * a method returns is handed back untraced. Methods run bound to the real object, so private
 * fields keep working; symbol, `_`-prefixed and {@link QUIET} members pass through unrecorded.
 * A primitive or nullish handle is returned as is.
 */
export const traceHandle = <H>(
  handle: H,
  report: { call: (call: RefCall) => void; capped: () => void }
): H => {
  if (handle === null || (typeof handle !== "object" && typeof handle !== "function"))
    return handle;
  const cache = new Map<PropertyKey, { orig: unknown; fn: unknown }>();
  let count = 0;
  return new Proxy(handle as object, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      // a non-configurable, read-only property must come back as itself (a Proxy invariant)
      const own = Reflect.getOwnPropertyDescriptor(target, prop);
      if (own && !own.configurable && !own.writable) return value;
      const hit = cache.get(prop);
      if (hit && hit.orig === value) return hit.fn;
      const name = String(prop);
      const quiet = typeof prop === "symbol" || name.startsWith("_") || QUIET.has(name);
      const method = value as (...args: unknown[]) => unknown;
      const fn = (...args: unknown[]): unknown => {
        const from = currentNode.getStore()?.id;
        if (quiet || !from || count >= REF_CALL_CAP) return method.apply(target, args);
        if (++count === REF_CALL_CAP) report.capped();
        const site = callerSite();
        const t0 = Date.now();
        const done = (outcome: "ok" | "failed"): void =>
          report.call({ from, site, key: name, ms: Date.now() - t0, outcome });
        let out: unknown;
        try {
          out = method.apply(target, args);
        } catch (error) {
          done("failed");
          throw error;
        }
        if (out !== null && typeof (out as { then?: unknown })?.then === "function") {
          (out as PromiseLike<unknown>).then(
            () => done("ok"),
            () => done("failed")
          );
        } else done("ok");
        return out;
      };
      cache.set(prop, { orig: value, fn });
      return fn;
    },
  }) as H;
};
