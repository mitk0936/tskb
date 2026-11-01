import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../../src/cli/ui/app.tsx";
import type { OmkitClient, RunSession, RunEvents } from "../../src/client/types.ts";
import type { DiscoveredOm, Registry } from "../../src/client/registry.ts";

type FakeVerdict = { ok: boolean; folder: string; summary: string[] };

/** A fake session whose handlers the test can fire. `result` stays pending (the run is "live")
 *  until the test calls `settle` — mirroring a real run that resolves only when it ends. */
function fakeSession() {
  const handlers: Partial<Record<keyof RunEvents, (arg: never) => void>> = {};
  let settle!: (v: FakeVerdict) => void;
  const result = new Promise<FakeVerdict>((r) => (settle = r));
  const session: RunSession = {
    on: (event, handler) => void (handlers[event] = handler as (arg: never) => void),
    answer: () => {},
    cancel: () => {},
    result,
  };
  return { session, fire: handlers, settle };
}

const devOm: DiscoveredOm = { name: "dev", file: "/p/oms/dev.ts", line: 1 };

function fakeClient(session: RunSession): OmkitClient {
  const registry: Registry = { oms: [devOm], actions: [], warnings: [] };
  return {
    discover: async () => registry,
    run: () => session,
    check: async () => [],
  } as unknown as OmkitClient;
}

/**
 * Poll until `predicate` holds. These tests drive async discovery → render → run over Ink, and
 * several App instances stay mounted across the file (no unmount), so fixed sleeps race under
 * load. Waiting on the actual observable state instead keeps them deterministic.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Render the app, wait for the picker, and start the first om. */
async function startRun(client: OmkitClient, onExit?: (v: unknown) => void) {
  const app = render(<App client={client} onExit={onExit} />);
  const frame = (): string => app.lastFrame() ?? "";
  await waitFor(() => frame().includes("dev")); // discovery rendered the om list
  app.stdin.write("\r"); // select "dev" → client.run
  await waitFor(() => frame().includes("esc stop")); // the run box is up
  return { ...app, frame };
}

describe("App", () => {
  test("lists discovered oms, then streams a run's milestones on select", async () => {
    const { session, fire } = fakeSession();
    const { frame } = await startRun(fakeClient(session));

    // Feed a log milestone over the fake session.
    (fire.log as (e: unknown) => void)?.({
      sequence: 1,
      ts: 0,
      nodeId: "main",
      path: "main",
      level: "event",
      source: "ev",
      message: "ping",
    });
    await waitFor(() => frame().includes("ping"));
    expect(frame()).toMatch(/── dev ─+ \d\d:\d\d:\d\d/); // the run's header rule in the scrollback
  });

  test("a prompt that times out is cleared from the screen and the run resumes", async () => {
    // When a supervised prompt times out, the child moves on and sends `promptDone`. The app must
    // withdraw the prompt box — otherwise a stale, unanswerable prompt lingers on the console and
    // the run's own key line never comes back.
    const { session, fire } = fakeSession();
    const { frame } = await startRun(fakeClient(session));

    (fire.prompt as (r: unknown) => void)?.({
      id: "p1",
      spec: { kind: "input", message: "Name?", default: "anon" },
    });
    await waitFor(() => frame().includes("Name?"));
    expect(frame()).toContain("enter answer"); // the prompt took over the box and the keys

    // The child timed out and withdrew the prompt.
    (fire.promptDone as (id: string) => void)?.("p1");
    await waitFor(() => !frame().includes("Name?"));
    await waitFor(() => frame().includes("esc stop")); // and the run is live again
  });

  test("a run that finishes on its own goes to the scrollback and the picker comes back", async () => {
    // The shell does not exit after a run: the verdict and the recap block a bare run prints are
    // written above, and the picker is back for the next one. Only quitting reports the verdict.
    const { session, settle } = fakeSession();
    const onExit = vi.fn();
    const { frame, stdin } = await startRun(fakeClient(session), onExit);

    const summary = [
      "om → /runs/z",
      "  main log  → /runs/z/main.log",
      "  report    → /runs/z/report.html",
    ];
    settle({ ok: true, folder: "/runs/z", summary });
    await waitFor(() => frame().includes("ctrl+r rerun dev"));
    expect(frame()).toContain("✓ dev · ok");
    expect(frame()).toContain("main log  → /runs/z/main.log");
    expect(frame()).toContain("report    → /runs/z/report.html");
    expect(onExit).not.toHaveBeenCalled();

    stdin.write("\x03"); // Ctrl+C on the picker quits, reporting the last verdict
    await waitFor(() => onExit.mock.calls.length > 0);
    expect(onExit).toHaveBeenCalledWith({ ok: true, folder: "/runs/z", summary });
  });

  test("esc stops the run and returns to the picker, without exiting", async () => {
    const { session, settle } = fakeSession();
    const cancel = vi.fn(() => settle({ ok: true, folder: "/runs/s", summary: [] }));
    session.cancel = cancel;
    const onExit = vi.fn();
    const { frame, stdin } = await startRun(fakeClient(session), onExit);

    stdin.write("\x1b"); // Esc
    await waitFor(() => frame().includes("⊘ dev · stopped"));
    expect(cancel).toHaveBeenCalledTimes(1);
    await waitFor(() => frame().includes("ctrl+r rerun dev"));
    expect(onExit).not.toHaveBeenCalled();
  });

  test("an om whose body returns with daemons up shows as up until stopped", async () => {
    const { session, fire } = fakeSession();
    const { frame } = await startRun(fakeClient(session));

    const log = fire.log as (e: unknown) => void;
    const base = { nodeId: "v", path: "main/vite", ts: Date.now() };
    log({ ...base, sequence: 1, level: "event", source: "lifecycle", message: "launched" });
    log({ ...base, sequence: 2, level: "info", source: "console", message: "[vite] ready" });
    (fire.up as (u: unknown) => void)({ ok: true, folder: "/runs/u" });
    await waitFor(() => frame().includes("● up"));
    // the tree catches up on the next redraw tick: the live row, with its latest line
    await waitFor(() => frame().includes("● vite") && frame().includes("└ [vite] ready"));
  });

  test("ctrl+r reruns the last om, and after each run the oms are discovered again", async () => {
    const first = fakeSession();
    const second = fakeSession();
    const sessions = [first.session, second.session];
    const run = vi.fn((_file: string) => sessions.shift()!);
    let scans = 0;
    const client = {
      ...fakeClient(first.session),
      discover: async () => {
        scans++;
        // the second scan finds an om added while the first run was going
        const added: DiscoveredOm = { name: "added", file: "/p/oms/added.ts", line: 1 };
        return { oms: scans > 1 ? [devOm, added] : [devOm], actions: [], warnings: [] };
      },
      run,
    } as unknown as OmkitClient;
    const { frame, stdin } = await startRun(client);

    first.settle({ ok: false, folder: "/runs/1", summary: [] });
    await waitFor(() => frame().includes("added")); // rediscovered after the run
    expect(frame()).toContain("✗ dev · failed");

    stdin.write("\x12"); // Ctrl+R
    await waitFor(() => run.mock.calls.length === 2);
    expect(run).toHaveBeenLastCalledWith("/p/oms/dev.ts");
  });

  test("ctrl+r does not rerun an om that discovery no longer finds", async () => {
    const first = fakeSession();
    const run = vi.fn((_file: string) => first.session);
    let scans = 0;
    const client = {
      ...fakeClient(first.session),
      discover: async () => ({ oms: scans++ === 0 ? [devOm] : [], actions: [], warnings: [] }),
      run,
    } as unknown as OmkitClient;
    const { frame, stdin } = await startRun(client);

    first.settle({ ok: true, folder: "/runs/1", summary: [] });
    await waitFor(() => frame().includes("0 oms"));
    stdin.write("\x12");
    await waitFor(() => frame().includes("no longer discovered"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("Ctrl+C during a run stops it, then quits with the verdict", async () => {
    const { session, settle } = fakeSession();
    // A real cancel drives teardown, which settles the run — model that by settling on cancel.
    const cancel = vi.fn(() => settle({ ok: false, folder: "/runs/x", summary: [] }));
    session.cancel = cancel;
    const onExit = vi.fn();
    const { stdin } = await startRun(fakeClient(session), onExit);

    stdin.write("\x03"); // Ctrl+C
    await waitFor(() => cancel.mock.calls.length > 0);
    await waitFor(() => onExit.mock.calls.length > 0);
    expect(onExit).toHaveBeenCalledWith({ ok: false, folder: "/runs/x", summary: [] });
  });

  test("smashing Ctrl+C does not force-exit before the child settles", async () => {
    // The child owns teardown and reports its verdict when the tree is reaped. Extra presses
    // while tearing down must be a no-op — force-exiting here would kill the parent mid-teardown
    // and orphan the child's process tree (vite, watchers, Chrome).
    let settle!: (v: FakeVerdict) => void;
    const result = new Promise<FakeVerdict>((r) => (settle = r));
    const cancel = vi.fn();
    const session: RunSession = { on: () => {}, answer: () => {}, cancel, result };
    const onExit = vi.fn();
    const { frame, stdin } = await startRun(fakeClient(session), onExit);

    stdin.write("\x03"); // Ctrl+C → begin teardown
    stdin.write("\x03"); // smash: second press
    stdin.write("\x1b"); // …an Esc
    stdin.write("\x03"); // …and a third
    await waitFor(() => frame().includes("then quitting"));

    // Teardown was requested exactly once; the extra presses did nothing and the app is
    // still up, waiting on the child — no premature exit.
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    // Only when the child reports back does the app exit with the verdict.
    const summary = ["om → /runs/y", "  main log  → /runs/y/main.log"];
    settle({ ok: true, folder: "/runs/y", summary });
    await waitFor(() => onExit.mock.calls.length > 0);
    expect(onExit).toHaveBeenCalledWith({ ok: true, folder: "/runs/y", summary });
  });
});
