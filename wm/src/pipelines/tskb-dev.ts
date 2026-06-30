import path from "node:path";
import { run } from "tswm";
import { command } from "tswm/actions";

const repoRoot = path.resolve(import.meta.dirname, "../../../");
const tskbPath = path.resolve(repoRoot, "packages/tskb");

const tskbDevWatch = command("TSKB:lib:dev", "npm run dev");
const tskbExplorerDev = command("TSKB:dev", "npm run dev:explorer");

const tskbDocsWatch = command(
  "TSKB:root:watch:docs",
  'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo Watch Dev" --watch --watch-path ./packages/tskb/dist'
);

// change in dev, lib, explorer -> means re-build docs, explorer - should be reloaded
const tskbDev = run(
  // watch docs at repo root
  tskbDocsWatch({ cwd: repoRoot }),
  // dev library run
  tskbDevWatch({ cwd: tskbPath }),
  // dev explorer SPA run
  tskbExplorerDev({ cwd: tskbPath })
);

// drain the logs while running
tskbDev.drain();

// next steps: cdp connect to the explorer, run actions on it, use browser logs
