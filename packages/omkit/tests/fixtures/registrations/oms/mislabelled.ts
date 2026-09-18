import { om } from "../../../../src/index.ts";

// Declares itself settling but never settles — the author error the backstop exists for.
om("mislabelled")
  .describe({ summary: "Claims to settle, does not" })
  .mcp({ mode: "settling" })
  .run(async ({ signal }) => {
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
  });
