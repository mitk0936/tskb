import path from "node:path";
import { run } from "../../core/run.ts";
import { command } from "../actions/command.ts";

const tskbPath = path.resolve(import.meta.dirname, "../../../", "packages/tskb");
const tskbDevWatch = command("TSKB:devWatch", "npm run dev", { label: "tskb:devWatch" });
const tskbExplorerWatch = command("TSKB:explorerDevWatch", "npm run dev:explorer", {
  label: "tskb:explorerDevWatch",
});

run(
  // dev library
  tskbDevWatch({ cwd: tskbPath }),
  // dev explorer SPA
  tskbExplorerWatch({ cwd: tskbPath })
).drain();

// change in dev, lib, explorer -> means re-build docs, explorer - should be reloaded
// next steps: cdp connect to the explorer, run actions on it, use browser logs
