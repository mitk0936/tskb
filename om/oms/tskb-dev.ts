import path from "node:path";
import { z } from "zod";
import { om } from "omkit";
import { command, healthcheck, chromePage, browser, prompt, drivePage } from "omkit/actions";

// This file sits at om/oms, so two levels up is the repo root (D:\tskb). `omkit run` sets the
// child cwd to the om file's directory, so we resolve from the file's own location, not cwd.
const repoRoot = path.resolve(import.meta.dirname, "../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

/**
 * What this dev stack lets you vary from outside. Supply as JSON, e.g.
 * OMKIT_ARGS='{"runTests":true,"headless":true}'.
 *
 * `runTests` is deliberately `.optional()` rather than defaulted: an optional field parses
 * clean when absent, so resolution never treats it as blocking and never asks. That leaves
 * the existing choice prompt below as the fallback — supplying the arg *overrides* the
 * question, rather than replacing it. The two defaulted fields resolve silently.
 */
const tskbDevArgs = z.object({
  /** Run the suite before bringing the stack up. Omit to be asked interactively. */
  runTests: z.boolean().optional(),
  /** Launch Chrome headless. Off by default — this stack is for looking at things. */
  headless: z.boolean().default(false),
  /** Port the explorer dev server is expected on. */
  port: z.number().int().positive().default(9876),
  /**
   * Chrome's remote-debugging port. This is what makes the stack reachable *after* it is up:
   * a separate run — say an MCP tool call — can attach over CDP, drive the live page, and
   * disconnect without closing the browser this run owns.
   */
  cdpPort: z.number().int().positive().default(9222),
  /**
   * How long to wait for the explorer to answer before giving up. Generous on purpose: this
   * gate is crossed only once, and a cold vite start is slow and variable — a tight bound
   * here does not fail faster, it just fails a stack that was about to work.
   */
  readyTimeoutMs: z.number().int().positive().default(60_000),
});

const WATCH_DOCS_CMD =
  'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo Watch Dev" --watch --watch-path ./packages/tskb/dist';

const runTestsPrompt = () =>
  prompt({
    kind: "choice",
    message: "Run tests?",
    choices: [
      { label: "no", value: "no" },
      { label: "yes", value: "yes" },
    ],
    default: "no",
    timeoutMs: 10_000,
  });

om("tskb:dev")
  .describe({ summary: "Bring up the tskb dev stack: watchers, explorer server, and a browser." })
  // Long-lived by design: the body returns once the stack is up, but the watchers and the
  // server keep running. `run_om` refuses it and points at `start_om`, so an assistant
  // cannot accidentally block a tool call on something that never finishes.
  .mcp({ mode: "long-lived" })
  .args(tskbDevArgs)
  .run(async (_ctx, { runTests, headless, port, cdpPort, readyTimeoutMs }) => {
    const explorerUrl = `http://localhost:${port}/`;

    // Supplied wins; otherwise ask, exactly as before. `runTests` being optional is what
    // keeps this question alive — a defaulted field would have resolved silently and the
    // prompt would be dead code.
    const shouldRunTests = runTests ?? (await runTestsPrompt().result) === "yes";

    if (shouldRunTests) {
      // Red tests are reported but don't stop the dev stack from coming up: `.result.catch` observes
      // the failure and logs it, so the run stays green and the stack still comes up.
      await command("npm test", { cwd: repoRoot })
        .tag("tskb:tests")
        .once("done")
        .catch((e) => console.error("tests failed — bringing up the stack anyway:", e));
    }

    // watches the lib build changes - rebuilds docs
    command(WATCH_DOCS_CMD, { cwd: repoRoot }).tag("watch:docs:daemon");
    // dev watcher on tskb lib source
    command("npm run dev", { cwd: tskbPath }).tag("watch:tskb:lib:daemon");
    // watches the explorer app source changes - vite dev server, inside watcher for docs change
    command("npm run dev:explorer", { cwd: tskbPath }).tag("server:explorer:daemon");

    await healthcheck({ url: explorerUrl, timeoutMs: readyTimeoutMs })
      .tag("explorer:ready:gate")
      .once("done");

    // The debugging port is what lets a later, separate run reattach to this browser. A CDP
    // client that connects and closes only drops its own connection, so driving the stack
    // from outside cannot tear it down.
    const chrome = await browser({ headless, args: [`--remote-debugging-port=${cdpPort}`] }).tag(
      "browser:chrome"
    ).ref;
    const page = await chromePage("Explorer", await chrome, { url: explorerUrl }).tag(
      "browser:explorer"
    ).ref;

    // Driven by **handle**, not by CDP address: the page above is already ours, so there is
    // nothing to gain from reconnecting to our own browser over the network. The same action
    // takes the address form when a *separate* run attaches to this stack from outside —
    // which is what makes it callable over MCP while this call site stays a direct handoff.
    await drivePage({
      target: page,
      js: `document.getElementById("stats")?.textContent ?? document.title`,
    })
      .tag("explorer:inspect")
      .once("done")
      .then(() => {
        console.log("Platform running.");
        console.log("Watchers are live.");
        console.log("Explorer page is available.");
      })
      .catch((e: unknown) => {
        console.error(`Explorer inspection failed — servers are still up. ${e}`);
      })
      .finally(() => {
        console.log("Press Ctrl+C to stop.");
      });
  });
