import path from "node:path";
import { om } from "omkit";
import { command, healthcheck, chromePage, prompt } from "omkit/actions";
import { chromedriver } from "../actions/chromedriver.ts";
import { inspectPage } from "../actions/inspect-page.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

const EXPLORER_PORT = 9876;
const EXPLORER_URL = `http://localhost:${EXPLORER_PORT}/`;

const watchDocs = command(
  'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo Watch Dev" --watch --watch-path ./packages/tskb/dist',
  { cwd: repoRoot }
);

const watchLib = command("npm run dev", { cwd: tskbPath });
const serveExplorer = command("npm run dev:explorer", { cwd: tskbPath });
const runTests = command("npm test", { cwd: repoRoot });

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
  }).tag("prompt:run:tests").result;

  if (answer.ok && answer.value === "yes") {
    // Red tests are reported but don't stop the dev stack from coming up.
    await runTests().tag("tskb:tests").handleFailure(console.error).once("done");
  }

  watchDocs().tag("watch:docs:daemon");
  watchLib().tag("watch:tskb:lib:daemon");
  serveExplorer().tag("server:explorer:daemon");

  await healthcheck({ url: EXPLORER_URL, timeoutMs: 7000 }).tag("explorer:ready:gate").once("done");

  const chrome = chromedriver({ url: EXPLORER_URL }).tag("chromedriver:browser");
  const page = chromePage("Explorer", chrome.ref).tag("browser:explorer");
  const inspected = await inspectPage(page.ref).tag("explorer:inspect").result;

  if (!inspected.ok) {
    console.error("Explorer inspection failed — servers are still up.");
  } else {
    console.log("Platform running.");
    console.log("Watchers are live.");
    console.log("Explorer page is available.");
  }
  console.log("Press Ctrl+C to stop.");
});
