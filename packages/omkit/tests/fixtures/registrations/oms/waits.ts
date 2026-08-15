import { om } from "../../../../src/index.ts";

om("waits")
  .describe({ summary: "Stays up until it is cancelled" })
  .mcp({ mode: "long-lived" })
  .run(async ({ signal }) => {
    console.log("up");
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
  });
