import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("action metadata", () => {
  test(".describe() is chainable and does not change behavior", async () => {
    const doubled = action("doubled")
      .describe({ summary: "Doubles a number" })
      .run(async (_ctx, n: number) => n * 2);

    let result = 0;
    await om("action-describe").run(async () => {
      result = await doubled(21).result;
    });
    expect(result).toBe(42);
  });

  test(".args() pins the first parameter and passes it through", async () => {
    const seed = action("seed")
      .args(z.object({ rows: z.number() }))
      .run(async (_ctx, args) => args.rows);

    let result = 0;
    await om("action-args").run(async () => {
      result = await seed({ rows: 500 }).result;
    });
    expect(result).toBe(500);
  });

  test(".describe() and .args() compose with .emits() and .ref()", async () => {
    const built = action("composed")
      .describe({ summary: "Everything at once" })
      .emits<{ tick: number }>()
      .ref<string>()
      .args(z.object({ label: z.string() }))
      .run(async (ctx, args) => {
        ctx.emit("tick", 1);
        ctx.attach(args.label);
        return args.label;
      });

    let handle = "";
    await om("action-composed").run(async () => {
      handle = await built({ label: "ok" }).ref;
    });
    expect(handle).toBe("ok");
  });
});

/**
 * `.args()` is type-level only — it pins the type of `.run`'s second parameter and,
 * through the resulting `Action`'s call signature, the shape callers must pass. There is
 * no runtime validation to assert on, so the claim is a compile-time one and this function
 * is the evidence for it: it is never called (vitest never type-checks this file, so
 * calling it would prove nothing extra and risks launching actions outside an om at
 * collection time). It exists to be checked with `tsc --noEmit` directly — see
 * task-7-report.md for the exact command and output, including confirmation that removing
 * either `@ts-expect-error` below turns it into a real compiler error.
 */
function typeLevelArgsChecks(): void {
  const seed = action("seed")
    .args(z.object({ rows: z.number() }))
    .run(async (_ctx, args) => {
      const rows: number = args.rows; // `args` is `{ rows: number }`, not `unknown`
      return rows;
    });

  seed({ rows: 500 }); // accepted — matches the schema's inferred type

  // @ts-expect-error — rows must be a number: a wrong args type is rejected at the call site
  seed({ rows: "500" });

  // @ts-expect-error — the schema requires `rows`; a missing field is rejected too
  seed({});
}
void typeLevelArgsChecks;
