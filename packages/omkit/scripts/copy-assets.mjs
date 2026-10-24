// tsc emits only what it compiles; the report viewer's plain .css/.js files ride along here.
import { cpSync } from "node:fs";

cpSync("src/output/writers/report", "dist/output/writers/report", { recursive: true });
