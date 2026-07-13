import path from "node:path";
import { om } from "omkit";
import { command, healthcheck, chromePage, prompt } from "omkit/actions";
import { chromedriver } from "../actions/chromedriver.ts";
import { inspectPage } from "../actions/inspect-page.ts";

// Resolve paths from this file's compiled location, not the launch dir, so the
// pipeline works regardless of where it's invoked from. The compiled file lives
// at <repo>/wm/dist/src/pipelines/tskb-dev.js, so the repo root is 4 levels up.
const repoRoot = path.resolve(import.meta.dirname, "../../../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

// The explorer dev server runs on a fixed port (pinned with strictPort in
// packages/tskb/explorer-app/vite.config.ts), so we probe a known URL.
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
// A failing suite no longer aborts the pipeline — `.exec().done` on a command that
// fails throws, so we await it in a try (only when the user opts in).
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

// The whole pipeline as one linear om. A daemon that fails is recorded but can't
// tear the run down; the browser chain self-sequences through `.ref` at exec time.
om(async () => {
  const answer = await askToRunTests.tag("gate").exec().done;
  if (answer === "yes") {
    try {
      await runTests.tag("test").exec().done;
    } catch {
      // a failing suite is logged + recorded; the dev servers still come up
    }
  }

  // The long-running dev servers — tagged `daemon` so the timeline can pick out
  // what keeps the run alive and gets torn down at the end.
  watchDocs.tag("daemon").exec();
  watchLib.tag("daemon").exec();
  serveExplorer.tag("daemon").exec();

  await explorerReady.tag("gate").exec().done;

  // chromedriver opens the page and exposes its CDP endpoint; chromePage connects
  // over CDP; inspectPage reads from the live page. Data deps flow through `.ref`.
  const chrome = chromedriver({ url: explorerUrl }).tag("browser").exec();
  const page = chromePage("Explorer", chrome.ref).tag("browser").exec();
  inspectPage(page.ref).tag("browser").exec();
});
