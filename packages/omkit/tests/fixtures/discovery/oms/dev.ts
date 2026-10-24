import { om, step } from "omkit";

om("dev")
  .describe({ summary: "Start the dev stack" })
  .run(async () => {
    // two daemons + a gate, elided for the fixture
  });

om("build").run(async () => {
  await step("compile", async () => {}); // an inline child, not an om of its own
});
