import { om } from "../../../../src/index.ts";

// No `.mcp()`: it still registers (the fork reports everything it sees), but the MCP
// server filters it out. Exposure is opt-in, and this fixture is what proves it.
om("hidden")
  .describe({ summary: "Not exposed" })
  .run(async () => {});
