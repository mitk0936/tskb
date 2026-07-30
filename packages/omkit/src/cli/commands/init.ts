import fs from "node:fs";
import path from "node:path";

const TSCONFIG = `{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["oms/**/*.ts", "actions/**/*.ts"]
}
`;

const DEV_OM = `import { om } from "omkit";
import { command, healthcheck } from "omkit/actions";

om("dev").run(async () => {
  command("npm run dev", { cwd: "api" }).tag("api");
  const up = await healthcheck({ url: "http://localhost:3000" }).result;
  if (!up.ok) return;
  console.log("stack is up — press Ctrl+C to stop");
});
`;

const HELLO_ACTION = `import { action } from "omkit";

export const hello = action("hello")
  .ref<string>()
  .run(async ({ attach }) => {
    attach("world");
  });
`;

const FILES: ReadonlyArray<{ rel: string; body: string }> = [
  { rel: "tsconfig.omkit.json", body: TSCONFIG },
  { rel: "oms/dev.ts", body: DEV_OM },
  { rel: "actions/hello.ts", body: HELLO_ACTION },
];

/** Write the starter project into `dir`, never overwriting existing files. */
export function scaffold(dir: string): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { rel, body } of FILES) {
    const target = path.join(dir, rel);
    if (fs.existsSync(target)) {
      skipped.push(rel);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    created.push(rel);
  }
  return { created, skipped };
}
