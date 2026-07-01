import path from "node:path";
import { spin } from "omkit";
import { command, healthcheck, chromePage, prompt } from "omkit/actions";
import { chromedriver } from "../actions/chromedriver.ts";
import { inspectPage } from "../actions/inspect-page.ts";

// Resolve paths from this file's compiled location, not the launch dir, so the
// pipeline works regardless of where it's invoked from. The compiled file lives
// at <repo>/wm/dist/src/pipelines/tskb-dev.js, so the repo root is 4 levels up
// (pipelines → src → dist → wm → repo).
const repoRoot = path.resolve(import.meta.dirname, "../../../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

// The explorer dev server runs on a fixed port (pinned with strictPort in
// packages/tskb/explorer-app/vite.config.ts), so we probe a known URL rather than
// scraping it out of Vite's log line.
const explorerPort = 9876;
const explorerUrl = `http://localhost:${explorerPort}/`;

// ── Dev processes ────────────────────────────────────────────────────────────
const watchDocs = command(
  "TSKB:root:watch:docs",
  'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo Watch Dev" --watch --watch-path ./packages/tskb/dist',
  { cwd: repoRoot }
);
const watchLib = command("TSKB:lib:dev", "npm run dev", { cwd: tskbPath });
const serveExplorer = command("TSKB:dev", "npm run dev:explorer", { cwd: tskbPath });
const runTests = command("TSKB:test", "npm test", { cwd: repoRoot });

// ── Prompt, gate & browser ───────────────────────────────────────────────────
// Whether to run the suite first. Defaults to "no" and auto-resolves after 10s.
const askToRunTests = prompt({
  kind: "choice",
  message: "Run tests?",
  choices: [
    { label: "no", value: "no" },
    { label: "yes", value: "yes" },
  ],
  default: "no",
  timeoutMs: 10_000,
});
// Gate: resolves once the explorer answers a 2xx on its fixed port.
const explorerReady = healthcheck({ url: explorerUrl });
// chromedriver opens the page and exposes its CDP endpoint; chromePage connects
// over CDP to it; inspectPage reads from the live page. Data deps flow through
// `.ref`, so the chain wires up here and self-sequences at run time.
const explorerChrome = chromedriver({ url: explorerUrl });
const explorerPage = chromePage(explorerChrome.ref);
const inspectExplorer = inspectPage(explorerPage.ref);

// The whole pipeline as one linear spin. failFast:false so a browser/gate
// problem records a failure but never tears down the dev servers — the browser is
// an add-on, not a reason to kill the watchers. drain:false so the live log
// doesn't write over the prompt — we start it by hand once the prompt is answered.
spin({ failFast: false, drain: false }, async ({ nod, drain }) => {
  const answer = await nod(askToRunTests).once("done");

  // Start streaming the log only now — while the prompt was open it owned the
  // terminal, so the question wasn't buried under the run's output.
  drain();

  if (answer === "yes") await nod(runTests).once("done");

  nod(watchDocs);
  nod(watchLib);
  nod(serveExplorer);

  await nod(explorerReady).once("done");

  nod(explorerChrome);
  nod(explorerPage);
  nod(inspectExplorer);
});
