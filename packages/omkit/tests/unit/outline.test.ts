import { describe, it, expect } from "vitest";
import ts from "typescript";
import { outlineBody, importedNames } from "../../src/client/outline.ts";

const parse = (src: string): ts.SourceFile =>
  ts.createSourceFile("t.ts", src, ts.ScriptTarget.ESNext, true);

/** Pull the function passed to `.run(...)` out of a parsed om chain. */
function bodyOf(sf: ts.SourceFile): ts.Node {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "run" &&
      n.arguments[0]
    ) {
      found ??= n.arguments[0];
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error("no .run(body) in source");
  return found;
}

const outline = (src: string): ReturnType<typeof outlineBody> => {
  const sf = parse(src);
  return outlineBody(bodyOf(sf), importedNames(sf));
};

describe("outlineBody", () => {
  it("lists imported calls in source order with their tags", () => {
    expect(
      outline(`
        import { command, healthcheck } from "omkit/actions";
        om("x").run(async () => {
          command("npm test", {}).tag("tskb:tests");
          await healthcheck({ url: "u" }).tag("gate").once("done");
        });
      `)
    ).toEqual([
      { name: "command", tag: "tskb:tests" },
      { name: "healthcheck", tag: "gate" },
    ]);
  });

  it("omits an untagged call's tag rather than inventing one", () => {
    expect(
      outline(`
        import { watchDir } from "omkit/actions";
        om("x").run(async () => { watchDir("."); });
      `)
    ).toEqual([{ name: "watchDir" }]);
  });

  it("ignores property-access calls and locally-declared functions", () => {
    expect(
      outline(`
        import path from "node:path";
        import { command } from "omkit/actions";
        function helper() {}
        om("x").run(async () => {
          path.resolve("a");
          console.log("hi");
          helper();
          command("go");
        });
      `)
    ).toEqual([{ name: "command" }]);
  });

  it("lists a conditional call unconditionally — the documented approximation", () => {
    expect(
      outline(`
        import { command } from "omkit/actions";
        om("x").run(async (_c, { flag }) => {
          if (flag) command("npm test").tag("tests");
        });
      `)
    ).toEqual([{ name: "command", tag: "tests" }]);
  });

  it("does not follow a module-level helper", () => {
    expect(
      outline(`
        import { prompt } from "omkit/actions";
        const ask = () => prompt({ kind: "choice" });
        om("x").run(async () => { await ask(); });
      `)
    ).toEqual([]);
  });

  it("de-duplicates an identical name and tag pair", () => {
    expect(
      outline(`
        import { command } from "omkit/actions";
        om("x").run(async () => { command("a").tag("t"); command("a").tag("t"); });
      `)
    ).toEqual([{ name: "command", tag: "t" }]);
  });

  it("keeps repeated calls apart when their tags differ", () => {
    expect(
      outline(`
        import { command } from "omkit/actions";
        om("x").run(async () => {
          command("a").tag("one");
          command("b").tag("two");
        });
      `)
    ).toEqual([
      { name: "command", tag: "one" },
      { name: "command", tag: "two" },
    ]);
  });

  it("does not attribute a sibling call's tag", () => {
    expect(
      outline(`
        import { browser, chromePage } from "omkit/actions";
        om("x").run(async () => {
          const c = await browser({}).tag("chrome").ref;
          await chromePage("E", await c, { url: "u" }).tag("page").ref;
        });
      `)
    ).toEqual([
      { name: "browser", tag: "chrome" },
      { name: "chromePage", tag: "page" },
    ]);
  });
});
