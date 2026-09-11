import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../../src/cli/ui/app.tsx";
import { runOm } from "../../src/client/runner.ts";
import type { OmkitClient } from "../../src/client/types.ts";
import type { DiscoveredOm } from "../../src/client/registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const chattyOm: DiscoveredOm = {
  name: "chatty",
  file: path.join(here, "../fixtures/run/chatty.ts"),
  line: 1,
};
// A throwaway cwd so the child's logs/ folder lands in the OS temp dir, not the repo.
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-throughput-"));

afterAll(() => {
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

/**
 * The interactive app against a real, chatty child — the shape of every real run (a build, a
 * test suite, a dev server) and the one this app was falling behind on.
 *
 * Redrawing per log entry costs an Ink frame per entry (~25ms floor, more as the milestone tail
 * fills), so the app absorbed only ~40 entries a second. `settled` is the last message on the
 * channel, so it lands behind the whole log backlog: the child finished in under a second while
 * the app spent half a minute drawing, looking hung the entire time — and for a run chattier
 * than the redraw rate, the backlog grows faster than it drains and never finishes at all.
 *
 * This must stay an end-to-end test. The cost lives in the real Ink/IPC pipeline, not in any
 * one function, so counting renders or timing a fake session would not see it.
 */
test("the app keeps up with a chatty run instead of draining it a frame at a time", async () => {
  const client = {
    tsconfig: "none",
    discover: async () => ({ oms: [chattyOm], actions: [], warnings: [] }),
    run: (file: string) => runOm(file, { cwd: workdir }),
    runBare: async () => 0,
    check: async () => [],
  } as unknown as OmkitClient;

  let exited = false;
  const { stdin, lastFrame } = render(
    <App client={client} oms={[chattyOm]} onExit={() => (exited = true)} />
  );

  const started = Date.now();
  const waitFor = async (p: () => boolean, ms: number): Promise<boolean> => {
    while (!p()) {
      if (Date.now() - started > ms) return false;
      await new Promise((r) => setTimeout(r, 20));
    }
    return true;
  };

  expect(await waitFor(() => (lastFrame() ?? "").includes("chatty"), 5_000)).toBe(true);
  stdin.write("\r"); // select the om → start the run

  // 1500 entries at one frame each is ~30s of drawing after a child that finishes in under a
  // second. A budget an order of magnitude under that separates the two without racing.
  expect(await waitFor(() => exited, 15_000)).toBe(true);
}, 30_000);
