import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import type { OmDescription } from "../../src/core/types.ts";

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

  test(".describe() survives every builder link and lands on the definition", () => {
    // Each of `.emits()`, `.ref()` and `.args()` returns a *new* builder, and `.run()` is the
    // terminal call that has to put the value somewhere durable. Both halves have been broken
    // before — a link that rebuilt without carrying the field, and a `.run()` that carried it
    // and then dropped it — and neither is visible from behaviour, because nothing reads the
    // description yet. So the definition is asserted on directly. None of these launch.
    const summary: OmDescription = { summary: "Everything at once" };
    const noop = async (): Promise<void> => {};

    expect(action("plain").describe(summary).run(noop).description).toEqual(summary);
    expect(action("evented").describe(summary).emits<{ tick: number }>().run(noop).description) //
      .toEqual(summary);
    expect(action("reffed").describe(summary).ref<string>().run(noop).description).toEqual(summary);
    expect(
      action("everything")
        .describe(summary)
        .emits<{ tick: number }>()
        .ref<string>()
        .args(z.object({ label: z.string() }))
        .run(noop).description
    ).toEqual(summary);
    // Chained *after* the links, on the args builder — the other direction of the same carry.
    expect(
      action("described-last")
        .args(z.object({ label: z.string() }))
        .describe(summary)
        .run(noop).description
    ).toEqual(summary);
    // And absent when never described, rather than some leaked default.
    expect(action("undescribed").run(noop).description).toBeUndefined();
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
