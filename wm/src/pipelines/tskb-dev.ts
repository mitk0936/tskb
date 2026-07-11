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
// A failing suite no longer aborts the pipeline — `nod(x).done` yields an Outcome
// (never throws), so the dev servers/browser still come up. The failures are
// logged and recorded in the spin verdict.
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
const explorerPage = chromePage("Explorer", explorerChrome.ref);
const inspectExplorer = inspectPage(explorerPage.ref);

// The whole pipeline as one linear spin. A failing action never tears the spin
// down (its Outcome is recorded in the verdict), so a browser/gate problem can't
// kill the dev servers — the browser is an add-on, not a reason to stop watching.
// The spin auto-drains the live log to the console for the whole run.
spin(async ({ nod }) => {
  const answer = await nod(askToRunTests).done;

  if (answer.ok && answer.value === "yes") await nod(runTests).done;

  nod(watchDocs);
  nod(watchLib);
  nod(serveExplorer);

  await nod(explorerReady).done;

  nod(explorerChrome);
  nod(explorerPage);
  const a = nod(inspectExplorer);
});
