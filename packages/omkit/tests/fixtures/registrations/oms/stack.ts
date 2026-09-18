import { action, om } from "../../../../src/index.ts";

/** A daemon: does nothing but hold the run open until it is torn down. */
const hold = action("hold").run(async ({ signal }) => {
  await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
});

// The dev-stack shape: the body launches a daemon and returns — that return is the run
// being "up" — while the daemon keeps the run alive until it is cancelled.
om("stack")
  .describe({ summary: "Comes up, then stays up on a daemon until cancelled" })
  .mcp({ mode: "long-lived" })
  .run(async () => {
    hold().tag("daemon");
    console.log("up");
  });
