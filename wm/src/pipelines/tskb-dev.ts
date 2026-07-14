import path from "node:path";
import { om } from "omkit";
import { command, healthcheck, chromePage, prompt } from "omkit/actions";
import { chromedriver } from "../actions/chromedriver.ts";
import { inspectPage } from "../actions/inspect-page.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

const explorerPort = 9876;
const explorerUrl = `http://localhost:${explorerPort}/`;

// ── Dev processes ────────────────────────────────────────────────────────────

const watchDocs = command(
  "TSKB:root:watch:docs",
  'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo Watch Dev" --watch --watch-path ./packages/tskb/dist',
  { cwd: repoRoot }
);

const watchLib = command("TSKB:lib:dev", "npm run dev", {
  cwd: tskbPath,
});

const serveExplorer = command("TSKB:dev", "npm run dev:explorer", {
  cwd: tskbPath,
});

const runTests = command("TSKB:test", "npm test", {
  cwd: repoRoot,
});

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

const explorerReady = healthcheck({
  url: explorerUrl,
  timeoutMs: 7000,
});

om(async () => {
  const promptAskToRunTests = askToRunTests.exec();
  promptAskToRunTests.tag("prompt:run:tests");

  const answer = await promptAskToRunTests.result;

  if (answer.ok && answer.value === "yes") {
    await runTests.exec().tag("test").handleFailure(console.error);
  }

  watchDocs.exec().tag("watch:docs:daemon");
  watchLib.exec().tag("watch:tskb:lib:daemon");
  serveExplorer.exec().tag("server:explorer:daemon");

  const ready = await explorerReady.exec().tag("explorer:ready:gate").result;
  if (!ready.ok) return;

  const chrome = chromedriver({ url: explorerUrl }).exec().tag("chromedriver:browser");
  const page = chromePage("Explorer", chrome.ref).exec().tag("browser:explorer");
  const inspected = await inspectPage(page.ref).exec().tag("explorer:inspect").result;

  if (!inspected.ok) {
    console.log("Explorer inspection failed — servers are still up.");
  } else {
    console.log("Platform running.");
    console.log("Watchers are live.");
    console.log("Explorer page is available.");
  }
  console.log("Press Ctrl+C to stop.");
});
