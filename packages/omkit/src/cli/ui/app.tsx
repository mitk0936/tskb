import fs from "node:fs";
import path from "node:path";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { RunModel, type RunNode, type RunSummary } from "../../output/RunModel.ts";
import { OmList } from "./views/OmList.tsx";
import { RunView, formatDuration, type RunPhase } from "./views/RunView.tsx";
import { recapLines, shellLine } from "./views/shellLines.ts";
import { Scrollback, type ScrollChunk, type ScrollLine } from "./views/Scrollback.tsx";
import { Spinner } from "./Spinner.tsx";
import { redrawLoop } from "./redrawLoop.ts";
import { openFile } from "./openFile.ts";
import type { OmkitClient, RunSession, PromptRequest, Verdict } from "../../client/types.ts";
import type { DiscoveredOm } from "../../client/registry.ts";

/**
 * How often the run screen redraws while the log streams in.
 *
 * An Ink frame costs ~25ms at minimum and grows with what it draws, so redrawing per log entry
 * caps the app at roughly 40 entries/second — far under what a build, a test suite, or a dev
 * server emits. The app then falls permanently behind: the verdict is the *last* message on the
 * channel, so it only arrives once every backlogged entry has been drawn, and the run looks hung
 * long after the child has finished. Folding into the model is cheap; drawing is not, so the two
 * run at different rates — and the gap is kept *after* each frame (see {@link redrawLoop}),
 * since a frame slower than this would otherwise leave no time between frames for the log at all.
 */
const REDRAW_MS = 80;

/** The run on screen. One at a time: the shell is a foreground runner, not a process manager. */
interface Current {
  readonly om: DiscoveredOm;
  readonly session: RunSession;
  readonly startedAt: number;
}

/** The last run that settled — what `ctrl+r` reruns and `ctrl+o` opens. */
interface Last {
  readonly om: DiscoveredOm;
  readonly verdict: Verdict;
}

const sameOm = (a: DiscoveredOm, b: DiscoveredOm): boolean =>
  a.file === b.file && a.name === b.name;

const clock = (at: number): string => new Date(at).toTimeString().slice(0, 8);

/**
 * The interactive shell: pick an om, watch it run, stop it, and come back to the picker for the
 * next — the process stays up until you quit. Every run is a fresh supervised child, so a rerun
 * always executes the current code of the om and its actions; only the picker's list comes from
 * discovery, which is redone in the background each time a run ends.
 *
 * The screen is two parts. Above, the scrollback ({@link Scrollback}): each run's header, its
 * milestones, and its verdict with the recap block a bare run prints — written once, kept by the
 * terminal. Below, the live part, the only thing redrawn: the picker, or the run box
 * ({@link RunView}) with the running nodes, a prompt, and the key line.
 *
 * Stopping is always a graceful teardown — the child reaps its process tree and reports a verdict
 * — and nothing here exits or moves on before that verdict. `esc` stops and returns to the
 * picker; `ctrl+c` stops and then quits, and quits straight away from the picker.
 */
export function App({
  client,
  onExit,
  oms: initialOms,
  warnings: initialWarnings = [],
}: {
  client: OmkitClient;
  /** Called with the last run's verdict (if any) just before Ink unmounts. */
  onExit?: (verdict: Verdict | undefined) => void;
  /** Oms discovered by the caller (pre-flight). When given, the app skips its own first scan. */
  oms?: DiscoveredOm[];
  /** Warnings the caller already printed for that scan, so a rediscovery repeats only new ones. */
  warnings?: readonly string[];
}): ReactElement {
  const { exit } = useApp();
  const [oms, setOms] = useState<DiscoveredOm[]>(initialOms ?? []);
  const [discovering, setDiscovering] = useState(false);
  const [chunks, setChunks] = useState<readonly ScrollChunk[]>([]);
  const [current, setCurrent] = useState<Current | undefined>();
  const [phase, setPhase] = useState<RunPhase>("running");
  const [upAt, setUpAt] = useState<number | undefined>();
  const [nodes, setNodes] = useState<readonly RunNode[]>([]);
  const [summary, setSummary] = useState<RunSummary | undefined>();
  const [prompt, setPrompt] = useState<PromptRequest | undefined>();
  const [last, setLast] = useState<Last | undefined>();
  const [quitting, setQuitting] = useState(false);

  // Refs so key handlers and session callbacks see live values, not a stale render closure.
  const currentRef = useRef<Current | undefined>(undefined);
  const phaseRef = useRef<RunPhase>("running");
  const quitRef = useRef(false);
  const lastRef = useRef<Last | undefined>(undefined);
  const omsRef = useRef<DiscoveredOm[]>(initialOms ?? []);
  const warningsRef = useRef(initialWarnings.join("\n"));
  const chunkId = useRef(0);
  const mounted = useRef(true);
  const redrawTimer = useRef<ReturnType<typeof redrawLoop> | undefined>(undefined);

  const say = (lines: readonly ScrollLine[]): void => {
    if (lines.length === 0) return;
    const chunk: ScrollChunk = { id: chunkId.current++, lines };
    setChunks((c) => [...c, chunk]);
  };

  const enterPhase = (p: RunPhase): void => {
    phaseRef.current = p;
    setPhase(p);
  };

  const stopRedraw = (): void => {
    redrawTimer.current?.stop();
    redrawTimer.current = undefined;
  };

  // The redraw timer holds the event loop open, so it must not outlive the app — an unmount
  // for any reason other than the run settling would otherwise keep the CLI from exiting.
  useEffect(
    () => () => {
      mounted.current = false;
      stopRedraw();
    },
    []
  );

  /**
   * Scan for oms again — after every run, since the om files may have changed while it ran. The
   * old list stays usable meanwhile, and stays put if the scan fails: a broken edit is reported,
   * not a reason to empty the picker.
   */
  const rediscover = (): void => {
    setDiscovering(true);
    void client
      .discover()
      .then((registry) => {
        if (!mounted.current) return;
        omsRef.current = registry.oms;
        setOms(registry.oms);
        const key = registry.warnings.join("\n");
        if (key !== warningsRef.current) {
          warningsRef.current = key;
          say(registry.warnings.map((w) => ({ text: `⚠ ${w}`, color: "yellow" })));
        }
      })
      .catch((err: unknown) => {
        if (!mounted.current) return;
        const message = err instanceof Error ? err.message : String(err);
        say([{ text: `✗ discovery failed — keeping the previous list: ${message}`, color: "red" }]);
      })
      .finally(() => {
        if (mounted.current) setDiscovering(false);
      });
  };

  useEffect(() => {
    if (!initialOms) rediscover();
    // first scan only; later ones follow runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quit = (): void => {
    onExit?.(lastRef.current?.verdict);
    exit();
  };

  /** The run settled: its verdict and recap go to the scrollback, then the picker comes back. */
  const finish = (cur: Current, v: Verdict): void => {
    const stopped = phaseRef.current === "stopping";
    const took = formatDuration(Date.now() - cur.startedAt);
    const [icon, word, color] = !v.ok
      ? ["✗", "failed", "red"]
      : stopped
        ? ["⊘", "stopped", "yellow"]
        : ["✓", "ok", "green"];
    say([
      { text: `${icon} ${cur.om.name} · ${word} · ${took}`, color, bold: true },
      ...recapLines(v.summary),
      { text: " " }, // a blank line before the next run's rule; Ink drops an empty one
    ]);
    const done: Last = { om: cur.om, verdict: v };
    lastRef.current = done;
    setLast(done);
    currentRef.current = undefined;
    setCurrent(undefined);
    setPrompt(undefined);
    setNodes([]);
    setSummary(undefined);
    setUpAt(undefined);
    enterPhase("running");
    if (quitRef.current) {
      quit();
      return;
    }
    rediscover();
  };

  const run = (om: DiscoveredOm): void => {
    if (currentRef.current) return;
    const model = new RunModel();
    const startedAt = Date.now();
    say([{ text: om.name, bold: true, rule: { right: clock(startedAt) } }]);
    const session = client.run(om.file);
    const cur: Current = { om, session, startedAt };
    currentRef.current = cur;
    enterPhase("running");

    // Every entry lands in the model immediately; the screen catches up on its own cadence.
    // `dirty` keeps an idle run from redrawing over nothing — see REDRAW_MS for why the two
    // are separated at all. Scrollback lines (see shellLine for which entries earn one) wait in
    // `pending` and reach the scrollback as one chunk per tick.
    let dirty = false;
    let tearingDown = false;
    const pending: ScrollLine[] = [];
    const redraw = (): void => {
      if (!dirty) return;
      dirty = false;
      setNodes(model.nodes());
      setSummary(model.summary());
      say(pending.splice(0));
    };
    redrawTimer.current = redrawLoop(redraw, REDRAW_MS);
    session.on("log", (entry) => {
      model.apply(entry);
      // the run narrates its own teardown — a stop, or the end of a body that left daemons up
      if (entry.level === "run" && entry.message.startsWith("tearing down")) tearingDown = true;
      const line = shellLine(entry, model.node(entry.nodeId), tearingDown);
      if (line) pending.push(line);
      dirty = true;
    });
    // A prompt blocks the child until it's answered, so it must not wait for the next tick —
    // and the milestones that led to it are the context the question is read in.
    session.on("prompt", (req) => {
      redraw();
      setPrompt(req);
    });
    // The child gave up on the prompt (timed out or torn down). Withdraw its box so a stale,
    // unanswerable prompt doesn't linger — but only if it's still the one on screen, so a late
    // withdrawal can't clobber a fresh prompt.
    session.on("promptDone", (id) => setPrompt((p) => (p?.id === id ? undefined : p)));
    // The body returned with something still running: a stack that stays up until stopped.
    // A body cut short by a stop returns too, and reports `up` on its way down — not a stack up.
    session.on("up", () => {
      if (phaseRef.current === "stopping") return;
      const at = Date.now();
      pending.push({ text: `  ● up · ${formatDuration(at - startedAt)}`, color: "green" });
      dirty = true;
      setUpAt(at);
      enterPhase("up");
    });
    // The single end of a run: a natural completion, a teardown after a stop, or a crash that
    // closes the channel. A live stack never gets here on its own — only after a stop.
    void session.result.then((v) => {
      stopRedraw();
      dirty = true;
      redraw(); // last pass: whatever arrived since the final tick
      if (mounted.current) finish(cur, v);
    });
    setCurrent(cur);
  };

  /** Ask the run to tear down. Idempotent: the child owns the teardown and reports when done. */
  const stop = (thenQuit: boolean): void => {
    const cur = currentRef.current;
    if (!cur) return;
    if (thenQuit && !quitRef.current) {
      quitRef.current = true;
      setQuitting(true);
    }
    if (phaseRef.current === "stopping") return;
    enterPhase("stopping");
    cur.session.cancel();
  };

  const rerun = (): void => {
    const prev = lastRef.current;
    if (!prev) return;
    // Rerun what discovery still finds; the run itself reads the current code either way.
    const om = omsRef.current.find((o) => sameOm(o, prev.om));
    if (!om) {
      say([{ text: `⚠ ${prev.om.name} is no longer discovered — not rerunning`, color: "yellow" }]);
      return;
    }
    run(om);
  };

  const openReport = (): void => {
    const folder = lastRef.current?.verdict.folder;
    const file = folder ? path.join(folder, "report.html") : undefined;
    if (!file || !fs.existsSync(file)) {
      say([{ text: "⚠ the last run wrote no report.html", color: "yellow" }]);
      return;
    }
    openFile(file).then(
      () => say([{ text: `↗ ${file}`, dim: true }]),
      (err: unknown) =>
        say([
          {
            text: `✗ could not open ${file}: ${err instanceof Error ? err.message : String(err)}`,
            color: "red",
          },
        ])
    );
  };

  // In raw mode Ctrl+C is a keystroke, not a signal. During a run every stop key only *requests*
  // the teardown: repeated presses are a deliberate no-op, and nothing exits before the child has
  // reaped its tree and reported — force-exiting mid-teardown would orphan its process tree
  // (vite, watchers, Chrome). This mirrors a bare om run, where SIGINT re-triggers an idempotent
  // teardown and the process never exits before the tree is reaped.
  useInput((input, key) => {
    const running = currentRef.current !== undefined;
    if (key.ctrl && input === "c") {
      if (running) stop(true);
      else quit();
      return;
    }
    if (running) {
      // with a prompt up, esc belongs to the prompt (it clears a choice search)
      if (key.escape && !prompt) stop(false);
      return;
    }
    if (key.ctrl && input === "r") rerun();
    else if (key.ctrl && input === "o") openReport();
  });

  const hint = current
    ? phase === "stopping"
      ? `stopping cleanly — waiting for the run to tear down${quitting ? ", then quitting" : ""}`
      : prompt
        ? "enter answer · ctrl+c stop and quit"
        : "esc stop · ctrl+c stop and quit"
    : [
        "↑↓ move · enter run",
        last ? `ctrl+r rerun ${last.om.name} · ctrl+o report` : "",
        "ctrl+c quit",
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <>
      <Scrollback chunks={chunks} />
      {current ? (
        <Box flexDirection="column">
          <RunView
            name={current.om.name}
            phase={phase}
            startedAt={current.startedAt}
            upAt={upAt}
            nodes={nodes}
            summary={summary}
            prompt={prompt}
            onAnswer={(value) => {
              if (prompt) current.session.answer(prompt.id, value);
              setPrompt(undefined);
            }}
          />
          <Text dimColor>{hint}</Text>
        </Box>
      ) : (
        <OmList
          oms={oms}
          onSelect={run}
          hint={hint}
          status={discovering ? <Spinner label="rediscovering…" /> : undefined}
        />
      )}
    </>
  );
}
