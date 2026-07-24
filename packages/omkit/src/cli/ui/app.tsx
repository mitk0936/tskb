import { useEffect, useRef, useState, type ReactElement } from "react";
import { useApp, useInput } from "ink";
import { format } from "../../output/milestones.ts";
import { OmList } from "./views/OmList.tsx";
import { RunView } from "./views/RunView.tsx";
import { Spinner } from "./Spinner.tsx";
import type { OmkitClient, RunSession, PromptRequest, Verdict } from "../client/types.ts";
import type { DiscoveredOm } from "../client/registry.ts";

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
  const [lines, setLines] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<PromptRequest | undefined>();
  const [verdict, setVerdict] = useState<Verdict | undefined>();
  const [tearing, setTearing] = useState(false);

  // Refs so the Ctrl+C handler always sees the live session/verdict, not a stale render closure.
  const sessionRef = useRef<RunSession | null>(null);
  const verdictRef = useRef<Verdict | undefined>(undefined);
  const tearingRef = useRef(false);

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
    const s = client.run(om.file);
    sessionRef.current = s;
    s.on("log", (entry) => {
      const rendered = format(entry);
      if (rendered) setLines((prev) => [...prev, rendered.text]);
    });
    s.on("prompt", (req) => setPrompt(req));
    s.on("settled", (v) => {
      setVerdict(v);
      setPrompt(undefined);
    });
    // The single exit point. `result` resolves when the run ends — a natural completion (a build
    // that settles on its own), a teardown after Ctrl+C, or a crash that closes the channel — and
    // stays pending for a live daemon stack until Ctrl+C. Record the verdict, hand it to the caller
    // so it can print the durable summary block, and unmount. Without this a self-completing run
    // would show its verdict line but never exit or render the summary.
    void s.result.then((v) => {
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
      <RunView lines={lines} prompt={prompt} verdict={verdict} onAnswer={answer} />
      {!verdict && tearing ? <Spinner label="tearing down… (stopping the run cleanly)" /> : null}
      {!verdict && !tearing && !prompt ? <Spinner label="running…" /> : null}
    </>
  );
}
