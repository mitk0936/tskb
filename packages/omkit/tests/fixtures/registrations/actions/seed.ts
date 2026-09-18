import { z } from "zod";
import { action } from "../../../../src/index.ts";

export const seed = action("seed")
  .describe({ summary: "Seed the database" })
  .mcp()
  .args(z.object({ rows: z.number() }))
  .run(async ({ assert }, { rows }) => {
    assert(rows > 0, `seeded ${rows} rows`);
  });

/** Exposed, but its schema cannot be represented as JSON Schema — must list as unavailable. */
export const at = action("at")
  .mcp()
  .args(z.object({ when: z.date() }))
  .run(async () => {});

/** Not an action, despite the shape — noise the export scan must ignore. */
export const notAnAction = { actionName: "impostor" };
