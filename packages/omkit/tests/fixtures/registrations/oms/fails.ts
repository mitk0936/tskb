import { om } from "../../../../src/index.ts";

om("fails")
  .describe({ summary: "Fails, so the verdict has something to report" })
  .mcp()
  .run(async () => {
    throw new Error("deliberate failure");
  });
