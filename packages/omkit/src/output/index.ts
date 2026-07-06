/**
 * The output layer's barrel — the composition root ({@link Output}) and its member
 * classes. There is **no module singleton** here: each run's {@link SpinHost} owns
 * its own `Output`, and threads it to actions as `ctx.output` (and to the spin body
 * as `ctx.snapshot` / `ctx.artifactsFolder`), so nothing binds to process-global
 * state and runs stay isolated.
 */
export { Output } from "./Output.ts";
export { RunFolder } from "./folder/RunFolder.ts";
export { type SnapshotRef, SnapshotStore } from "./snapshot/SnapshotStore.ts";
export { RunLog } from "./log/RunLog.ts";
