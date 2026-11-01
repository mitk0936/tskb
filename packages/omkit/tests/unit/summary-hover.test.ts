import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * `.describe({ summary })` carries the summary as a literal type on `Action` and `Activity`, so
 * an editor hover shows it at the definition, at a call site and on the returned activity.
 * Unit tests are not type-checked, so this asks the language service for the hover text itself.
 */
const index = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/index.ts");
// Forward slashes: the language service normalizes paths that way, and compares them as strings.
const file = path.join(path.dirname(index), "__summary_hover__.ts").replaceAll("\\", "/");

const source = `
import { action } from "./index.ts";

export const build = action("build")
  .describe({ summary: "Build the platform.", needs: ["node"] })
  .run(async (_ctx, target: string) => target.length);

export const serve = action("serve")
  .describe({
    summary: \`
      Run the server until torn down:
      free its port, then launch it.
    \`,
  })
  .emits<{ ready: number }>()
  .ref<string>()
  .run(async () => {});

const text: string = "computed";
export const computed = action("computed").describe({ summary: text }).run(async () => 1);

export const huge = action("huge")
  .describe({ summary: "a${" ".repeat(600)}b" })
  .run(async () => 1);

const built = build("win");
const served = serve();
`;

const service = ts.createLanguageService({
  getScriptFileNames: () => [file],
  getScriptVersion: () => "1",
  getScriptSnapshot: (f) =>
    f === file
      ? ts.ScriptSnapshot.fromString(source)
      : fs.existsSync(f)
        ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8"))
        : undefined,
  getCurrentDirectory: () => path.dirname(index),
  getCompilationSettings: () => ({
    strict: true,
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowImportingTsExtensions: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
  }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: (f) => f === file || fs.existsSync(f),
  readFile: (f) => (f === file ? source : fs.readFileSync(f, "utf8")),
  directoryExists: (d) => fs.existsSync(d),
});

const hover = (needle: string): string => {
  const info = service.getQuickInfoAtPosition(file, source.indexOf(needle));
  return ts.displayPartsToString(info?.displayParts);
};

describe("summary in editor hovers", () => {
  test("the sample type-checks", () => {
    const diagnostics = service
      .getSemanticDiagnostics(file)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(diagnostics).toEqual([]);
  });

  test("shows on the definition, the call site and the activity", () => {
    expect(hover("build =")).toContain('"Build the platform."');
    expect(hover('build("win")')).toContain('"Build the platform."');
    expect(hover("built =")).toContain('"Build the platform."');
  });

  test("a multi-line summary is one clean line, through .emits() and .ref()", () => {
    expect(hover("served =")).toContain(
      '"Run the server until torn down: free its port, then launch it."'
    );
  });

  test("a computed or oversized summary falls back to string", () => {
    expect(hover("computed =")).toMatch(/, string>$/);
    expect(hover("huge =")).toMatch(/, string>$/);
  });
});
