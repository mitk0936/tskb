import path from "node:path";
import { om } from "omkit";
import { command, healthcheck, chromePage, browser, prompt } from "omkit/actions";
import { inspectPage } from "../actions/inspect-page.ts";

// This file sits at om/oms, so two levels up is the repo root (D:\tskb). `omkit run` sets the
// child cwd to the om file's directory, so we resolve from the file's own location, not cwd.
const repoRoot = path.resolve(import.meta.dirname, "../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

const EXPLORER_PORT = 9876;
const EXPLORER_URL = `http://localhost:${EXPLORER_PORT}/`;

const WATCH_DOCS_CMD =
  'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo Watch Dev" --watch --watch-path ./packages/tskb/dist';

om("tskb:dev", async () => {
  const answer = await prompt({
    kind: "choice",
    message: "Run tests?",
    choices: [
      { label: "no", value: "no" },
      { label: "yes", value: "yes" },
    ],
    default: "no",
    timeoutMs: 10_000,
  }).result;

  if (answer === "yes") {
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

  await healthcheck({ url: EXPLORER_URL, timeoutMs: 7000 }).tag("explorer:ready:gate").once("done");

  const chrome = browser({ headless: false }).tag("browser:chrome");
  const page = chromePage("Explorer", chrome.ref, { url: EXPLORER_URL }).tag("browser:explorer");

  try {
    await inspectPage(page.ref).tag("explorer:inspect").once("done");

    console.log("Platform running.");
    console.log("Watchers are live.");
    console.log("Explorer page is available.");
  } catch {
    console.error("Explorer inspection failed — servers are still up.");
  }
  console.log("Press Ctrl+C to stop.");
});
