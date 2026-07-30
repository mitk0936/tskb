import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { MissingArgsError, resolveArgs } from "../../src/core/args.ts";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import {
  createSupervisor,
  installSupervisor,
  type ChildMessage,
  type SupervisorMessage,
} from "../../src/core/interaction.ts";
import type { OmDescription } from "../../src/core/types.ts";

const never = async (): Promise<string> => {
  throw new Error("should not have prompted");
};

describe("resolveArgs", () => {
  test("supplied values win and defaults fill the rest", async () => {
    const schema = z.object({ rows: z.number(), truncate: z.boolean().default(false) });
    const resolved = await resolveArgs(schema, {
      supplied: { rows: 500 },
      interactive: false,
      ask: never,
    });
    expect(resolved).toEqual({ rows: 500, truncate: false });
  });

  test("a fully defaulted schema needs no prompting even when non-interactive", async () => {
    const schema = z.object({ truncate: z.boolean().default(false) });
    expect(await resolveArgs(schema, { supplied: {}, interactive: false, ask: never })).toEqual({
      truncate: false,
    });
  });

  test("prompts for a missing scalar and coerces the answer", async () => {
    const schema = z.object({ rows: z.number() });
    const asked: string[] = [];
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async (spec) => {
        asked.push(spec.path);
        return "500";
      },
    });
    expect(resolved).toEqual({ rows: 500 });
    expect(asked).toEqual(["rows"]);
  });

  test("prompts for a missing object as JSON, with a shape hint", async () => {
    const schema = z.object({ config: z.object({ host: z.string(), port: z.number() }) });
    let seenHint = "";
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async (spec) => {
        expect(spec.kind).toBe("json");
        seenHint = spec.hint;
        return '{"host":"db.local","port":5432}';
      },
    });
    expect(resolved).toEqual({ config: { host: "db.local", port: 5432 } });
    expect(seenHint).toBe("{ host: string, port: number }");
  });

  test("non-interactive names every missing field in one error", async () => {
    const schema = z.object({ rows: z.number(), name: z.string() });
    await expect(
      resolveArgs(schema, { supplied: {}, interactive: false, ask: never })
    ).rejects.toThrow(MissingArgsError);

    const error = (await resolveArgs(schema, {
      supplied: {},
      interactive: false,
      ask: never,
    }).catch((e: unknown) => e)) as MissingArgsError;
    expect(error.fields.sort()).toEqual(["name", "rows"]);
  });

  test("an empty answer is not a value — it re-asks rather than coercing to 0", async () => {
    const schema = z.object({ rows: z.number() });
    const answers = ["", "  ", "42"];
    let i = 0;
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async () => answers[i++],
    });
    // Without the empty-answer guard this resolves to 0, because Number("") === 0.
    expect(resolved).toEqual({ rows: 42 });
    expect(i).toBe(3);
  });

  test("re-asks on an invalid answer and gives up after 3 attempts", async () => {
    const schema = z.object({ rows: z.number() });
    let attempts = 0;
    await expect(
      resolveArgs(schema, {
        supplied: {},
        interactive: true,
        ask: async () => {
          attempts++;
          return "not-a-number";
        },
      })
    ).rejects.toThrow(/rows/);
    expect(attempts).toBe(3);
  });

  test("a schema with no fields resolves to an empty object", async () => {
    expect(
      await resolveArgs(z.object({}), { supplied: {}, interactive: false, ask: never })
    ).toEqual({});
  });

  // `shapeHint` degrades to the literal "see schema" when it cannot sketch a shape. The
  // caller needs the raw schema to print in that case, so the spec carries it — see the
  // `om().args()` prompt tests below for the branch that uses it.
  test("the ask spec carries the field's own JSON Schema, not the root's", async () => {
    const schema = z.object({ config: z.object({}), rows: z.number() });
    const seen = new Map<string, unknown>();
    await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async (spec) => {
        seen.set(spec.path, spec.jsonSchema);
        expect(spec.hint).toBe(spec.path === "config" ? "see schema" : "number");
        return spec.path === "config" ? "{}" : "7";
      },
    });
    expect(seen.get("config")).toMatchObject({ type: "object" });
    expect(seen.get("rows")).toMatchObject({ type: "number" });
  });

  test("a value that was supplied but is wrong is not reported as missing", async () => {
    const schema = z.object({ rows: z.number() });
    const error = (await resolveArgs(schema, {
      supplied: { rows: "lots" },
      interactive: false,
      ask: never,
    }).catch((e: unknown) => e)) as MissingArgsError;
    expect(error.fields).toEqual(["rows"]);
    // It names what was wrong rather than telling the caller to pass a value they did pass.
    expect(error.message).toMatch(/expected number/);
  });

  test("a rejection that names no field fails at once, not as an exhausted retry", async () => {
    // A top-level refinement blames the object, not a field, so there is no question that
    // could help. Without the guard this asks nothing three times and then blames the
    // retries — hence the anchor: "could not resolve args:", not "…after 3 attempts:".
    const schema = z
      .object({ min: z.number(), max: z.number() })
      .refine((v) => v.min <= v.max, "min must not exceed max");
    let asked = 0;
    await expect(
      resolveArgs(schema, {
        supplied: { min: 10, max: 1 },
        interactive: true,
        ask: async () => {
          asked++;
          return "1";
        },
      })
    ).rejects.toThrow(/^could not resolve args: \(root\) — min must not exceed max/);
    expect(asked).toBe(0);
  });

  test("a missing complex arg can be answered with a file path", async () => {
    const schema = z.object({ pkg: z.object({ name: z.string() }) });
    const file = fileURLToPath(new URL("../../package.json", import.meta.url));
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async () => `@${file}`, // the `@` is optional sugar, and stripped
    });
    expect(resolved).toMatchObject({ pkg: { name: "omkit" } });
  });

  test("an unreadable file path re-asks instead of crashing the run", async () => {
    const schema = z.object({ pkg: z.object({ name: z.string() }) });
    const answers = ["./definitely-not-here.json", '{"name":"omkit"}'];
    let i = 0;
    const resolved = await resolveArgs(schema, {
      supplied: {},
      interactive: true,
      ask: async () => answers[i++],
    });
    expect(resolved).toEqual({ pkg: { name: "omkit" } });
    expect(i).toBe(2);
  });
});

// ─── om().args() ──────────────────────────────────────────────────────────────

/** A supervisor that answers every prompt it receives with `answer`, recording the specs. */
function autoAnswering(answer: string) {
  const sent: ChildMessage[] = [];
  let deliver: ((m: SupervisorMessage) => void) | undefined;
  const sup = createSupervisor(
    (m) => {
      sent.push(m);
      if (m.kind === "prompt") deliver?.({ kind: "answer", id: m.id, value: answer, via: "input" });
    },
    (cb) => void (deliver = cb)
  );
  return { sup, sent };
}

/** The prompt spec the supervisor was asked to render, or `undefined` if none was. */
const promptSpec = (sent: readonly ChildMessage[]) => {
  const message = sent.find((m) => m.kind === "prompt");
  return message?.kind === "prompt" ? message.spec : undefined;
};

afterEach(() => {
  installSupervisor(null);
  ExecutionTree.reset();
  delete process.env.OMKIT_ARGS;
  process.exitCode = 0;
});

describe("om().args()", () => {
  test("resolves from OMKIT_ARGS and passes typed args to the body", async () => {
    process.env.OMKIT_ARGS = JSON.stringify({ rows: 500 });
    let seen = 0;
    await om("args-supplied")
      .args(z.object({ rows: z.number(), truncate: z.boolean().default(false) }))
      .run(async (_ctx, args) => {
        seen = args.rows;
        expect(args.truncate).toBe(false);
      });
    expect(seen).toBe(500);
  });

  test("resolved args reach the root node's log header", async () => {
    process.env.OMKIT_ARGS = JSON.stringify({ rows: 7 });
    await om("args-logged")
      .args(z.object({ rows: z.number() }))
      .run(async () => {});

    const view = ExecutionTree.last!.runViewForTest();
    expect(view.root.args).toEqual([{ rows: 7 }]);
  });

  test("an om without .args() is unaffected", async () => {
    let ran = false;
    await om("args-none").run(async (ctx) => {
      expect(ctx.artifactsFolder).toContain("args-none");
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test("malformed OMKIT_ARGS fails the run rather than being ignored", async () => {
    process.env.OMKIT_ARGS = "{not json";
    let ran = false;
    await om("args-malformed")
      .args(z.object({ rows: z.number() }))
      .run(async () => {
        ran = true;
      });
    expect(ran).toBe(false);
    const view = ExecutionTree.last!.runViewForTest();
    expect(view.ok).toBe(false);
    expect(view.failures.map((f) => f.error).join("\n")).toMatch(/OMKIT_ARGS/);
  });

  test("with nobody to ask, a missing arg fails the run instead of prompting", async () => {
    // No supervisor and no TTY is the only state in which resolution may not prompt. Pinned
    // rather than inherited from the ambient stdin, so the test means the same run under a
    // terminal as under a pipe — and so it fails fast if `isInteractive()` ever mistakes
    // "no supervisor" (which is `null`, not `undefined`) for "someone can answer".
    const original = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      let ran = false;
      await om("args-unanswerable")
        .args(z.object({ rows: z.number() }))
        .run(async () => {
          ran = true;
        });
      expect(ran).toBe(false);
      const view = ExecutionTree.last!.runViewForTest();
      expect(view.ok).toBe(false);
      expect(view.failures.map((f) => f.error).join("\n")).toMatch(/rows/);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
    }
  });

  test("prompts a supervisor for a missing object, showing the shape sketch", async () => {
    const { sup, sent } = autoAnswering('{"host":"db.local","port":5432}');
    installSupervisor(sup);

    let seen: unknown;
    await om("args-prompt-sketch")
      .args(z.object({ config: z.object({ host: z.string(), port: z.number() }) }))
      .run(async (_ctx, args) => {
        seen = args.config;
      });

    expect(seen).toEqual({ host: "db.local", port: 5432 });
    const spec = promptSpec(sent);
    expect(spec?.kind).toBe("multiline");
    expect(spec?.message).toBe("config — JSON");
    expect(spec?.hint).toBe("{ host: string, port: number }");
  });

  test("prints the raw schema when the shape cannot be sketched", async () => {
    const { sup, sent } = autoAnswering('{"anything":1}');
    installSupervisor(sup);

    let seen: unknown;
    await om("args-prompt-see-schema")
      .args(z.object({ config: z.record(z.string(), z.number()) }))
      .run(async (_ctx, args) => {
        seen = args.config;
      });

    expect(seen).toEqual({ anything: 1 });
    const spec = promptSpec(sent);
    // The whole point: "see schema" tells the user nothing about what to type, so the raw
    // JSON Schema is printed in its place. Drop that branch and `hint` is the useless literal.
    expect(spec?.hint).not.toBe("see schema");
    expect(JSON.parse(spec?.hint ?? "null")).toMatchObject({ type: "object" });
  });

  test("prompts a supervisor for a missing scalar with its type sketch", async () => {
    const { sup, sent } = autoAnswering("500");
    installSupervisor(sup);

    let seen = 0;
    await om("args-prompt-scalar")
      .args(z.object({ rows: z.number() }))
      .run(async (_ctx, args) => {
        seen = args.rows;
      });

    expect(seen).toBe(500);
    const spec = promptSpec(sent);
    expect(spec?.kind).toBe("input");
    expect(spec?.message).toBe("rows (number)");
  });

  test(".describe() survives the .args() link, chained on either side", () => {
    // `.args()` returns a *new* builder, so a field set before the link has to be carried
    // across it. Nothing in the runtime reads the description yet, so there is no behavioral
    // surface to assert on — this reaches for the field directly rather than not testing the
    // one thing that silently breaks. Neither call launches a run.
    const summary: OmDescription = { summary: "Seeds the database" };
    const schema = z.object({ rows: z.number() });
    const described = (b: unknown): OmDescription | undefined =>
      (b as { description?: OmDescription }).description;

    expect(described(om("chain-describe-first").describe(summary).args(schema))).toEqual(summary);
    expect(described(om("chain-describe-last").args(schema).describe(summary))).toEqual(summary);
  });
});

/**
 * `.args()` on an om is a typing feature as much as a runtime one: it pins the type of
 * `.run`'s second parameter to the schema's inferred type. Nothing under `tests/` is
 * type-checked by any script and vitest strips types without checking them, so a test that
 * merely runs proves nothing about the types. This function is the evidence instead: it is
 * never called, and is checked with `tsc --noEmit` directly — see task-10-report.md for the
 * command, the clean output, and confirmation that removing any `@ts-expect-error` below
 * turns it into a real compiler error.
 */
function typeLevelArgsChecks(): void {
  void om("type-level")
    .args(z.object({ rows: z.number(), name: z.string().default("x") }))
    .run(async (_ctx, args) => {
      const rows: number = args.rows; // `args` is the schema's inferred type, not `unknown`
      const name: string = args.name; // a defaulted field is present on the *output* type
      void rows;
      void name;

      // @ts-expect-error — rows is a number, not a string
      const wrong: string = args.rows;
      void wrong;

      // @ts-expect-error — the schema declares no `nope` field
      void args.nope;
    });

  // @ts-expect-error — without .args(), the body takes no second parameter
  void om("type-level-none").run(async (_ctx, _args: { rows: number }) => {});

  void om("type-level-order")
    .describe({ summary: "order does not matter" })
    .args(z.object({ rows: z.number() }))
    .describe({ summary: "…either way" })
    // @ts-expect-error — .args() is not offered twice; the shape is already pinned
    .args(z.object({ rows: z.number() }));
}
void typeLevelArgsChecks;
