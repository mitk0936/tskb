import { describe, expect, test } from "vitest";
import { evaluateErrorMessage } from "../../src/actions/drive-page.ts";

describe("evaluateErrorMessage", () => {
  test("leads with what the page said, not the expression", () => {
    const cause = new Error(
      "page.evaluate: TypeError: Cannot read properties of null (reading 'closest')\n" +
        "    at eval (eval at evaluate (:291:30), <anonymous>:1:60)"
    );
    const message = evaluateErrorMessage("rel.closest('details')", cause);
    expect(message).toMatch(/^the expression threw in the page: /);
    expect(message).toContain("TypeError: Cannot read properties of null (reading 'closest')");
    // One line of cause: the page-side stack means nothing to a caller who sent a string.
    expect(message).not.toContain("at eval");
    expect(message).toContain("rel.closest('details')");
  });

  test("abbreviates a long expression rather than echoing all of it", () => {
    const js = "(async () => { " + "await step(); ".repeat(40) + "return x; })()";
    const message = evaluateErrorMessage(js, new Error("boom"));
    expect(message.length).toBeLessThan(js.length);
    expect(message).toContain("…");
    expect(message).toContain("boom");
  });

  test("copes with a non-Error cause", () => {
    expect(evaluateErrorMessage("x", "just a string")).toContain("just a string");
  });
});
