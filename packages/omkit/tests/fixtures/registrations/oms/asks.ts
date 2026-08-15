import { om } from "../../../../src/index.ts";
import { prompt } from "../../../../src/actions/prompt.ts";

// Prompts mid-run, so the elicitation path has something real to carry. Under MCP the
// supervisor is the client, so this question travels out as `elicitation/create`.
om("asks")
  .describe({ summary: "Asks a question and asserts on the answer" })
  .mcp()
  .run(async ({ assert }) => {
    const answer = await prompt({
      kind: "choice",
      message: "Proceed?",
      choices: [
        { label: "no", value: "no" },
        { label: "yes", value: "yes" },
      ],
      default: "no",
      timeoutMs: 20_000,
    }).result;
    assert(answer === "yes", `answered ${answer}`);
  });
