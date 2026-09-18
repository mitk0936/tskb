import { z } from "zod";
import { om } from "../../../../src/index.ts";

om("settles")
  .describe({ summary: "Settles immediately with one passing assert" })
  .mcp()
  .args(z.object({ rows: z.number() }))
  .run(async ({ assert }, { rows }) => {
    assert(rows > 0, `rows is positive (${rows})`);
  });
