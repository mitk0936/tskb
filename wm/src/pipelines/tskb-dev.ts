import path from "node:path";
import { om } from "omkit";
import { command, healthcheck, chromePage, prompt } from "omkit/actions";
import { chromedriver } from "../actions/chromedriver.ts";
import { inspectPage } from "../actions/inspect-page.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

const explorerPort = 9876;
const explorerUrl = `http://localhost:${explorerPort}/`;

// ── Dev processes (command is a factory: these are actions, launched by calling) ──────

const watchDocs = command(
  'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo Watch Dev" --watch --watch-path ./packages/tskb/dist',
  { cwd: repoRoot }
);

const watchLib = command("npm run dev", { cwd: tskbPath });
const serveExplorer = command("npm run dev:explorer", { cwd: tskbPath });
const runTests = command("npm test", { cwd: repoRoot });

om(async () => {
  const answer = await prompt({
    kind: "choice",
    message: "Run tests?",
    choices: [
      { label: "no", value: "no" },
      { label: "yes", value: "yes" },
    ],
    default: "no",
    timeoutMs: 10_000,
  }).tag("prompt:run:tests").result;

  if (answer.ok && answer.value === "yes") {
    await runTests().tag("test").handleFailure(console.error).once("done");
  }

  watchDocs().tag("watch:docs:daemon");
  watchLib().tag("watch:tskb:lib:daemon");
  serveExplorer().tag("server:explorer:daemon");

  const ready = await healthcheck({ url: explorerUrl, timeoutMs: 7000 }).tag("explorer:ready:gate")
    .result;
  if (!ready.ok) return;

  const chrome = chromedriver({ url: explorerUrl }).tag("chromedriver:browser");
  const page = chromePage("Explorer", chrome.ref).tag("browser:explorer");
  const inspected = await inspectPage(page.ref).tag("explorer:inspect").result;

  if (!inspected.ok) {
    console.log("Explorer inspection failed — servers are still up.");
  } else {
    console.log("Platform running.");
    console.log("Watchers are live.");
    console.log("Explorer page is available.");
  }
  console.log("Press Ctrl+C to stop.");
});
