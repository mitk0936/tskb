/**
 * Call `draw` repeatedly, leaving `everyMs` of free event-loop time **after** each frame
 * finishes — not every `everyMs` from when the last one started, as `setInterval` does.
 *
 * The difference only shows when a frame is slower than the cadence, which a full Ink milestone
 * tail is. A fixed-rate timer is then overdue the moment a frame ends, so the loop alternates one
 * frame with one turn of I/O — and on Windows a turn of fork IPC is a single message. The
 * interactive app then drains its log backlog a frame per entry, and a run that finished minutes
 * ago is still "streaming" on screen, with `settled` stuck behind the backlog.
 *
 * The next frame is armed from a `setImmediate`, so the gap is measured from after anything the
 * frame deferred to microtasks (React's commit, Ink's write) has run too.
 */
export function redrawLoop(draw: () => void, everyMs: number): { stop(): void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let immediate: ReturnType<typeof setImmediate> | undefined;

  const arm = (): void => {
    immediate = undefined;
    if (!stopped) timer = setTimeout(tick, everyMs);
  };
  const tick = (): void => {
    timer = undefined;
    if (stopped) return;
    draw();
    immediate = setImmediate(arm);
  };

  timer = setTimeout(tick, everyMs);
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (immediate) clearImmediate(immediate);
    },
  };
}
