import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { redrawLoop } from "../../src/cli/ui/redrawLoop.ts";

const flood = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/ipc/flood.mjs");

const busy = (ms: number): void => {
  const end = Date.now() + ms;
  while (Date.now() < end);
};

/**
 * The shape of the interactive app on Windows: Node's IPC delivers at most one message per
 * event-loop turn, and a real Ink frame over a full milestone tail costs longer than the redraw
 * cadence. A fixed-rate timer is then overdue every turn, so it draws after every single message
 * and the app drains its backlog a frame at a time — a run that finished minutes ago still
 * "streaming" on screen. The loop must leave a full cadence of message handling between frames,
 * however slow a frame is.
 */
test("slow frames do not throttle event handling down to one event per frame", async () => {
  const EVENTS = 2000;
  let draws = 0;
  let dirty = false;
  const loop = redrawLoop(() => {
    if (!dirty) return;
    dirty = false;
    draws++;
    busy(100); // a frame slower than the cadence
  }, 80);

  // Real fork IPC, not a simulated feed: how many messages land per turn is the transport's
  // doing (one on Windows), and that is exactly the condition under which a fixed-rate timer
  // starves the handler.
  const started = Date.now();
  let handled = 0;
  await new Promise<void>((resolve) => {
    const child = fork(flood, [String(EVENTS)]);
    child.on("message", (m: { kind: string }) => {
      if (m.kind === "done") return resolve();
      handled++;
      dirty = true;
    });
  });
  loop.stop();

  expect(handled).toBe(EVENTS);

  // One frame per event would be 2000 frames × 100ms = 200s.
  expect(draws).toBeLessThan(50);
  expect(Date.now() - started).toBeLessThan(5_000);
}, 30_000);

test("stop() ends the loop — no frame is drawn after it", async () => {
  let draws = 0;
  const loop = redrawLoop(() => draws++, 10);
  await new Promise((r) => setTimeout(r, 50));
  loop.stop();
  const atStop = draws;
  await new Promise((r) => setTimeout(r, 100));
  expect(draws).toBe(atStop);
});
