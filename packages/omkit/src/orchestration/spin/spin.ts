import { action } from "../action/action.ts";
import { SpinHost } from "./SpinHost.ts";
import type { Nod, SpinBody } from "./types.ts";

/**
 * Runs a linear orchestration. You pass a plain (async) function; omkit hosts it
 * in a single in-flight action and hands it a {@link Nod}. Because that host
 * stays in-flight while your body `await`s, the spin never idles shut between
 * steps — so you write `await` / `if` control flow instead of nested callbacks.
 * When the body returns, the daemons it nodded in keep the spin alive until
 * teardown.
 *
 * A failing action **never throws into the body** — `await nod(x).done` yields an
 * {@link import("./action.ts").Outcome} you inspect, and the spin keeps going
 * (the failure is recorded in the verdict and sets exit code 1):
 *
 *   spin({ drain: false }, async ({ nod }) => {
 *     const ans = await nod(prompt({ … })).done;       // Outcome — never throws
 *     if (ans.ok && ans.value === "yes") await nod(test).done;
 *     nod(devServer);                                   // fire-and-forget daemon
 *     const chrome = nod(chromedriver({ … }));
 *     nod(chromePage(chrome.ref));                      // data deps via .ref
 *   });
 *
 * Auto-drains by default;
 */
export function spin(body: SpinBody) {
  // `run(...)` below assigns `host` synchronously, before the action's async body
  // ever runs — so the closures here capture the spin safely.
  let hostRun: SpinHost;

  const hostAction = action("omkit:Spin").run(async (ctx) => {
    const nod: Nod = (instance) => {
      hostRun.run(instance);
      return instance;
    };

    await body({
      nod,
      // TODO: maybe add a reason for cancel ???
      cancel: () => hostRun.cancel(),
      signal: ctx.signal,
      // The host action runs inside the SpinHost, so its ctx already carries the
      // run's output subsystem — surface the folder and a snapshot convenience to
      // the body from there rather than reaching for a module singleton.
      artifactsFolder: ctx.artifactsFolder,
      snapshot: (name, value) => ctx.output.snapshots.snapshot(name, value),
    });
  });

  const mainSpinAction = hostAction();
  hostRun = new SpinHost(mainSpinAction);
  // The body is the orchestrator, not a peer action: if it throws, tear the whole
  // spin down. Regular action failures only get recorded (they don't stop the
  // spin), but the orchestrator crashing must end the run — otherwise any daemon
  // it already nodded keeps the process alive forever on a pipeline bug.
  void mainSpinAction.done.then((outcome) => {
    if (!outcome.ok) hostRun.cancel();
  });
}
