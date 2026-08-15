import { z } from "zod";
import { om } from "../../../../src/index.ts";

om("exposed")
  .describe({ summary: "An om a client may run" })
  .mcp({ mode: "long-lived" })
  .args(z.object({ headless: z.boolean().default(true), token: z.string() }))
  .run(async () => {
    throw new Error("the body must never run under discovery");
  });
