import { om } from "omkit";
import { thing } from "../actions/thing.ts";

// The om imports the action relatively, so `thing.ts` is pulled into the program via module
// resolution as well as the include glob — the exact case that broke discovery.
om("main", async () => {
  await thing().result;
});
