// A deliberate unresolvable import: the child dies during module load, before omkit is running
// and before the channel can carry anything. Node's own error on stderr is the only account of
// why — the supervisor must not swallow it. Never imported by the suite; only ever forked.
import { missing } from "./no-such-module.ts";
import { om } from "../../../src/index.ts";

om("broken").run(async () => {
  console.log(missing);
});
