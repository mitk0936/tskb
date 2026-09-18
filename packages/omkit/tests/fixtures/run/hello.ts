import { om } from "../../../src/index.ts";
import { prompt } from "../../../src/actions/prompt.ts";

om("hello").run(async ({ snapshot }) => {
  await snapshot("start", { ok: true });
  const name = await prompt({ message: "Name?", default: "anon", timeoutMs: 5000 }).result.catch(
    () => "ERR"
  );
  await snapshot("greeted", { name });
});
