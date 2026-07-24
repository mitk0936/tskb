import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../../src/cli/ui/app.tsx";
import type { OmkitClient, RunSession, RunEvents } from "../../src/cli/client/types.ts";
import type { Registry } from "../../src/cli/client/registry.ts";

/** A fake session whose handlers the test can fire. `result` stays pending (the run is "live")
 *  until the test calls `settle` — mirroring a real run that resolves only when it ends. */
function fakeSession() {
  const handlers: Partial<Record<keyof RunEvents, (arg: never) => void>> = {};
  let settle!: (v: { ok: boolean; folder: string; summary: string[] }) => void;
  const result = new Promise<{ ok: boolean; folder: string; summary: string[] }>(
    (r) => (settle = r)
  );
  const session: RunSession = {
    on: (event, handler) => void (handlers[event] = handler as (arg: never) => void),
    answer: () => {},
    cancel: () => {},
    result,
  };
  return { session, fire: handlers, settle };
}

function fakeClient(session: RunSession): OmkitClient {
  const registry: Registry = {
    oms: [{ name: "dev", file: "/p/oms/dev.ts", line: 1 }],
    actions: [],
    warnings: [],
  };
  return {
    discover: async () => registry,
    run: () => session,
    check: async () => [],
  };
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

describe("App", () => {
  test("lists discovered oms, then streams a run's milestones on select", async () => {
    const { session, fire } = fakeSession();
    const { lastFrame, stdin } = render(<App client={fakeClient(session)} />);
    const frame = (): string => lastFrame() ?? "";

    await waitFor(() => frame().includes("dev")); // discovery rendered the om list
    stdin.write("\r"); // select "dev" → client.run
    await waitFor(() => frame().includes("running")); // the run started

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
    expect(frame()).toContain("ping");
  });

  test("a run that finishes on its own reports the verdict and exits", async () => {
    // A build that settles without any Ctrl+C: `result` resolving is the single exit point, so
    // the caller gets the verdict (and prints the durable summary) — the app doesn't just hang
    // on the verdict line.
    const { session, settle } = fakeSession();
    const onExit = vi.fn();
    const { lastFrame, stdin } = render(<App client={fakeClient(session)} onExit={onExit} />);
    const frame = (): string => lastFrame() ?? "";

    await waitFor(() => frame().includes("dev"));
    stdin.write("\r"); // select the om → start the run
    await waitFor(() => frame().includes("running"));
    expect(onExit).not.toHaveBeenCalled(); // still running

    const summary = ["om → /runs/z"];
    settle({ ok: true, folder: "/runs/z", summary });
    await waitFor(() => onExit.mock.calls.length > 0);
    expect(onExit).toHaveBeenCalledWith({ ok: true, folder: "/runs/z", summary });
  });

  test("Ctrl+C cancels the run and reports the verdict on exit", async () => {
    const { session, settle } = fakeSession();
    // A real cancel drives teardown, which settles the run — model that by settling on cancel.
    const cancel = vi.fn(() => settle({ ok: false, folder: "/runs/x", summary: [] }));
    session.cancel = cancel;
    const onExit = vi.fn();
    const { lastFrame, stdin } = render(<App client={fakeClient(session)} onExit={onExit} />);
    const frame = (): string => lastFrame() ?? "";

    await waitFor(() => frame().includes("dev"));
    stdin.write("\r"); // select the om → start the run
    await waitFor(() => frame().includes("running"));
    stdin.write("\x03"); // Ctrl+C
    await waitFor(() => cancel.mock.calls.length > 0);

    expect(cancel).toHaveBeenCalled();
    await waitFor(() => onExit.mock.calls.length > 0);
    expect(onExit).toHaveBeenCalledWith({ ok: false, folder: "/runs/x", summary: [] });
  });

  test("smashing Ctrl+C does not force-exit before the child settles", async () => {
    // The child owns teardown and reports its verdict when the tree is reaped. Extra Ctrl+C
    // presses while tearing down must be a no-op — force-exiting here would kill the parent
    // mid-teardown and orphan the child's process tree (vite, watchers, Chrome).
    let settle!: (v: { ok: boolean; folder: string; summary: string[] }) => void;
    const result = new Promise<{ ok: boolean; folder: string; summary: string[] }>(
      (r) => (settle = r)
    );
    const cancel = vi.fn();
    const session: RunSession = { on: () => {}, answer: () => {}, cancel, result };
    const onExit = vi.fn();
    const { lastFrame, stdin } = render(<App client={fakeClient(session)} onExit={onExit} />);
    const frame = (): string => lastFrame() ?? "";

    await waitFor(() => frame().includes("dev"));
    stdin.write("\r"); // select the om → start the run
    await waitFor(() => frame().includes("running"));

    stdin.write("\x03"); // Ctrl+C → begin teardown
    stdin.write("\x03"); // smash: second press
    stdin.write("\x03"); // …and a third
    await waitFor(() => cancel.mock.calls.length > 0);

    // Teardown was requested exactly once; the extra presses did nothing and the app is
    // still up, waiting on the child — no premature exit.
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    // Only when the child reports back does the app exit with the verdict — carrying the run's
    // recap summary through to the caller (which prints it after Ink unmounts).
    const summary = ["om → /runs/y", "  main log  → /runs/y/main.log"];
    settle({ ok: true, folder: "/runs/y", summary });
    await waitFor(() => onExit.mock.calls.length > 0);
    expect(onExit).toHaveBeenCalledWith({ ok: true, folder: "/runs/y", summary });
  });
});
