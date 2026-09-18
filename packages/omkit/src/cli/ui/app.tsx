import { useEffect, useRef, useState, type ReactElement } from "react";
import { useApp, useInput } from "ink";
import { RunModel, type RunSummary } from "../../output/RunModel.ts";
import { OmList } from "./views/OmList.tsx";
import { RunView } from "./views/RunView.tsx";
import { Spinner } from "./Spinner.tsx";
import type { OmkitClient, RunSession, PromptRequest, Verdict } from "../../client/types.ts";
import type { DiscoveredOm } from "../../client/registry.ts";

/**
 * How often the run screen redraws while the log streams in.
 *
 * An Ink frame costs ~25ms at minimum and grows with the milestone tail, so redrawing per log
 * entry caps the app at roughly 40 entries/second — far under what a build, a test suite, or a
 * dev server emits. The app then falls permanently behind: `settled` is the *last* message on
 * the channel, so it only arrives once every backlogged entry has been drawn, and the run looks
 * hung long after the child has finished. Folding into the model is cheap; drawing is not, so
 * the two run at different rates.
 */
const REDRAW_MS = 80;

/** The interactive app: discover → list/search → run → live milestones + prompts. */
export function App({
  client,
  onExit,
  oms: initialOms,
}: {
  client: OmkitClient;
  /** Called with the run's verdict (if any) just before Ink unmounts, so the caller can print
   *  a durable summary — Ink erases its own frame on exit. */
  onExit?: (verdict: Verdict | undefined) => void;
  /** Oms discovered by the caller (pre-flight). When given, the app skips its own discovery. */
  oms?: DiscoveredOm[];
}): ReactElement {
  const { exit } = useApp();
  const [oms, setOms] = useState<DiscoveredOm[]>(initialOms ?? []);
  const [session, setSession] = useState<RunSession | null>(null);
  // A per-run RunModel folds the log stream into a capped milestone tail plus a live node summary;
  // these snapshots are what the view renders. The cap is what keeps a long run from growing forever.
  const [lines, setLines] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<RunSummary | undefined>();
  const [prompt, setPrompt] = useState<PromptRequest | undefined>();
  const [verdict, setVerdict] = useState<Verdict | undefined>();
  const [tearing, setTearing] = useState(false);

  // Refs so the Ctrl+C handler always sees the live session/verdict, not a stale render closure.
  const sessionRef = useRef<RunSession | null>(null);
  const verdictRef = useRef<Verdict | undefined>(undefined);
  const tearingRef = useRef(false);
  const redrawTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const stopRedraw = (): void => {
    if (redrawTimer.current === undefined) return;
    clearInterval(redrawTimer.current);
    redrawTimer.current = undefined;
  };

  // The redraw timer holds the event loop open, so it must not outlive the app — an unmount
  // for any reason other than the run settling would otherwise keep the CLI from exiting.
  useEffect(() => stopRedraw, []);

  useEffect(() => {
    if (initialOms) return; // provided by the caller's pre-flight discovery
    let live = true;
    void client.discover().then((r) => {
      if (live) setOms(r.oms);
    });
    return () => {
      live = false;
    };
  }, [client, initialOms]);

  const run = (om: DiscoveredOm): void => {
    const model = new RunModel();
    const s = client.run(om.file);
    sessionRef.current = s;
    // Every entry lands in the model immediately; the screen catches up on its own cadence.
    // `dirty` keeps an idle run from redrawing over nothing — see REDRAW_MS for why the two
    // are separated at all.
    let dirty = false;
    const redraw = (): void => {
      if (!dirty) return;
      dirty = false;
      setLines(model.milestones());
      setStatus(model.summary());
    };
    redrawTimer.current = setInterval(redraw, REDRAW_MS);
    s.on("log", (entry) => {
      model.apply(entry);
      dirty = true;
    });
    // A prompt blocks the child until it's answered, so it must not wait for the next tick —
    // and the milestones that led to it are the context the question is read in.
    s.on("prompt", (req) => {
      redraw();
      setPrompt(req);
    });
    // The child gave up on the prompt (timed out or torn down). Withdraw its box so a stale,
    // unanswerable prompt doesn't linger — but only if it's still the one on screen, so a late
    // withdrawal can't clobber a fresh prompt.
    s.on("promptDone", (id) => setPrompt((p) => (p?.id === id ? undefined : p)));
    s.on("settled", (v) => {
      redraw(); // the run's closing milestones, before its verdict
      setVerdict(v);
      setPrompt(undefined);
    });
    // The single exit point. `result` resolves when the run ends — a natural completion (a build
    // that settles on its own), a teardown after Ctrl+C, or a crash that closes the channel — and
    // stays pending for a live daemon stack until Ctrl+C. Record the verdict, hand it to the caller
    // so it can print the durable summary block, and unmount. Without this a self-completing run
    // would show its verdict line but never exit or render the summary.
    void s.result.then((v) => {
      stopRedraw();
      redraw(); // last pass: whatever arrived since the final tick
      verdictRef.current = v;
      setVerdict(v);
      onExit?.(v);
      exit();
    });
    setSession(s);
  };

  const answer = (value: string): void => {
    if (session && prompt) session.answer(prompt.id, value);
    setPrompt(undefined);
  };

  // Ctrl+C: in raw mode this is a keystroke, not a signal. Cancel the run and wait for the child
  // to tear down and report its verdict, then quit — leaving the durable summary to `onExit`.
  //
  // Repeated presses are a deliberate no-op (see the `tearing` guard below): the child owns the
  // teardown and is guaranteed to report `settled` within its grace window, so we let it finish
  // rather than force-exiting. This mirrors the normal om run, where SIGINT is caught with
  // `process.on` and smashing Ctrl+C just re-triggers an idempotent teardown — the process never
  // exits before the tree is reaped. Force-exiting here (the old second-press escape hatch) killed
  // the parent mid-teardown and orphaned the child's process tree (vite, watchers, Chrome).
  useInput((input, key) => {
    if (!(key.ctrl && input === "c")) return;
    const s = sessionRef.current;
    // Nothing running or already settled → quit now.
    if (!s || verdictRef.current) {
      onExit?.(verdictRef.current);
      exit();
      return;
    }
    // Already tearing down → ignore. The child is reaping its tree and will report `settled` (or
    // the channel closes and resolves a failed verdict); either way `result` resolves and the
    // handler wired in `run()` records the verdict and unmounts. Just request the teardown here.
    if (tearingRef.current) return;
    tearingRef.current = true;
    setTearing(true);
    s.cancel();
  });

  if (!session) return <OmList oms={oms} onSelect={run} />;
  return (
    <>
      <RunView lines={lines} status={status} prompt={prompt} verdict={verdict} onAnswer={answer} />
      {!verdict && tearing ? <Spinner label="tearing down… (stopping the run cleanly)" /> : null}
      {!verdict && !tearing && !prompt ? <Spinner label="running…" /> : null}
    </>
  );
}
