import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  extractModuleMorphology,
  extractExportMorphology,
  extractModuleImports,
} from "../../packages/tskb/src/core/extraction/module-morphology.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-morph-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let fileCounter = 0;

/** Write a temp .ts file and return a program + its resolved path. */
function makeProgram(code: string): { program: ts.Program; filePath: string } {
  const filePath = path.join(tmpDir, `test-${fileCounter++}.ts`);
  fs.writeFileSync(filePath, code, "utf-8");
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    strict: true,
    skipLibCheck: true,
  });
  return { program, filePath };
}

// ─── extractModuleMorphology ─────────────────────────────────────────────────

describe("extractModuleMorphology", () => {
  it("extracts exported functions with params and return types", () => {
    const { program, filePath } = makeProgram(`
      export function greet(name: string): string { return name; }
      export function add(a: number, b: number): number { return a + b; }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("2 functions");
    expect(result.morphology.some((l) => l.includes("greet") && l.includes("string"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("add") && l.includes("number"))).toBe(true);
  });

  it("extracts exported classes with constructor, methods, and properties", () => {
    const { program, filePath } = makeProgram(`
      export class Dog {
        name: string;
        constructor(name: string) { this.name = name; }
        bark(): string { return "woof"; }
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("1 class");
    expect(result.morphology.some((l) => l.includes("class Dog"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("constructor"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("bark"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("name: string"))).toBe(true);
  });

  it("extracts exported interfaces with properties", () => {
    const { program, filePath } = makeProgram(`
      export interface Config {
        host: string;
        port: number;
        debug?: boolean;
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("1 interface");
    expect(result.morphology.some((l) => l.includes("interface Config"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("host: string"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("port: number"))).toBe(true);
  });

  it("extracts interfaces with method signatures", () => {
    const { program, filePath } = makeProgram(`
      export interface Handler {
        handle(req: string): void;
        transform(data: number): string;
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("handle") && l.includes("string"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("transform"))).toBe(true);
  });

  it("extracts empty interfaces", () => {
    const { program, filePath } = makeProgram(`
      export interface Empty {}
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("interface Empty {}"))).toBe(true);
  });

  it("extracts exported type aliases", () => {
    const { program, filePath } = makeProgram(`
      export type ID = string | number;
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("1 type");
    expect(
      result.morphology.some((l) => l.includes("type ID") && l.includes("string | number"))
    ).toBe(true);
  });

  it("truncates long type aliases", () => {
    const longUnion = Array.from({ length: 30 }, (_, i) => `"option${i}"`).join(" | ");
    const { program, filePath } = makeProgram(`
      export type LongType = ${longUnion};
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("LongType") && l.includes("..."))).toBe(true);
  });

  it("extracts exported enums with members", () => {
    const { program, filePath } = makeProgram(`
      export enum Color { Red, Green, Blue }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("1 enum");
    expect(result.morphology.some((l) => l.includes("enum Color") && l.includes("Red"))).toBe(true);
  });

  it("truncates enums with more than 10 members", () => {
    const members = Array.from({ length: 12 }, (_, i) => `V${i}`).join(", ");
    const { program, filePath } = makeProgram(`
      export enum Big { ${members} }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("enum Big") && l.includes("..."))).toBe(true);
  });

  it("extracts exported variables with types", () => {
    const { program, filePath } = makeProgram(`
      export const MAX_RETRIES = 3;
      export const BASE_URL = "https://example.com";
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("2 variables");
    expect(result.morphology.some((l) => l.includes("MAX_RETRIES"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("BASE_URL"))).toBe(true);
  });

  it("truncates long variable types", () => {
    const fields = Array.from({ length: 30 }, (_, i) => `field${i}: string`).join("; ");
    const { program, filePath } = makeProgram(`
      export const config: { ${fields} } = {} as any;
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("config") && l.includes("..."))).toBe(true);
  });

  it("includes default exports in summary", () => {
    const { program, filePath } = makeProgram(`
      export default function main(): void {}
      export function helper(): void {}
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("1 default export");
    expect(result.summary).toContain("1 function");
  });

  it("handles class with private, protected, public, static, readonly, abstract members", () => {
    const { program, filePath } = makeProgram(`
      export abstract class Service {
        private secret: string = "s";
        protected internal: number = 0;
        public visible: boolean = true;
        static instance: Service;
        readonly id: string = "abc";
        abstract doWork(): void;
        public run(): void {}
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("private") && l.includes("secret"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("protected") && l.includes("internal"))).toBe(
      true
    );
    expect(result.morphology.some((l) => l.includes("public") && l.includes("visible"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("static") && l.includes("instance"))).toBe(
      true
    );
    expect(result.morphology.some((l) => l.includes("readonly") && l.includes("id"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("abstract") && l.includes("doWork"))).toBe(
      true
    );
  });

  it("handles getters and setters", () => {
    const { program, filePath } = makeProgram(`
      export class Box {
        private _value: number = 0;
        get value(): number { return this._value; }
        set value(v: number) { this._value = v; }
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("get value"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("set value"))).toBe(true);
  });

  it("handles override modifier", () => {
    const { program, filePath } = makeProgram(`
      class Base { run(): void {} }
      export class Child extends Base {
        override run(): void {}
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("override") && l.includes("run"))).toBe(true);
  });

  // ── Internal declarations ──────────────────────────────────────────────────

  it("includes internal functions", () => {
    const { program, filePath } = makeProgram(`
      export function publicFn(): void {}
      function privateFn(): string { return "hidden"; }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("// — internal —"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("privateFn"))).toBe(true);
  });

  it("includes internal classes", () => {
    const { program, filePath } = makeProgram(`
      export const x = 1;
      class InternalClass {
        method(): void {}
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("class InternalClass"))).toBe(true);
  });

  it("includes internal interfaces", () => {
    const { program, filePath } = makeProgram(`
      export const x = 1;
      interface InternalIface {
        field: string;
      }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("interface InternalIface"))).toBe(true);
  });

  it("includes internal type aliases", () => {
    const { program, filePath } = makeProgram(`
      export const x = 1;
      type InternalType = string | number;
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("type InternalType"))).toBe(true);
  });

  it("includes internal enums", () => {
    const { program, filePath } = makeProgram(`
      export const x = 1;
      enum InternalEnum { A, B }
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("enum InternalEnum"))).toBe(true);
  });

  it("includes internal variables", () => {
    const { program, filePath } = makeProgram(`
      export const x = 1;
      const SECRET = "hidden";
      const COUNT = 42;
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.morphology.some((l) => l.includes("SECRET"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("COUNT"))).toBe(true);
  });

  // ── Edge cases / null returns ──────────────────────────────────────────────

  it("returns null for empty module", () => {
    const { program, filePath } = makeProgram(`// nothing here`);
    expect(extractModuleMorphology(program, filePath)).toBeNull();
  });

  it("returns null for nonexistent file", () => {
    const { program } = makeProgram(`export const x = 1;`);
    expect(extractModuleMorphology(program, "/nonexistent/file.ts")).toBeNull();
  });

  it("returns null for module with no exports (only imports)", () => {
    const { program, filePath } = makeProgram(`
      import "some-side-effect";
    `);
    expect(extractModuleMorphology(program, filePath)).toBeNull();
  });

  it("builds correct summary for mixed exports", () => {
    const { program, filePath } = makeProgram(`
      export class Foo {}
      export function bar(): void {}
      export function baz(): void {}
      export interface Qux {}
      export type Id = string;
      export enum Dir { Up, Down }
      export const X = 1;
    `);
    const result = extractModuleMorphology(program, filePath)!;
    expect(result.summary).toContain("1 class");
    expect(result.summary).toContain("2 functions");
    expect(result.summary).toContain("1 interface");
    expect(result.summary).toContain("1 type");
    expect(result.summary).toContain("1 enum");
    expect(result.summary).toContain("1 variable");
  });

  it("includes line range comments", () => {
    const { program, filePath } = makeProgram(`export function foo(): void {}\n`);
    const result = extractModuleMorphology(program, filePath)!;
    // Line range comment like "// :1" or "// :1-2"
    expect(result.morphology.some((l) => /\/\/ :\d/.test(l))).toBe(true);
  });

  it("handles re-exports (aliases)", () => {
    // Create two files: one defines, one re-exports
    const srcPath = path.join(tmpDir, `reexport-src-${fileCounter++}.ts`);
    const reexportPath = path.join(tmpDir, `reexport-${fileCounter++}.ts`);
    fs.writeFileSync(srcPath, `export function original(): void {}`, "utf-8");
    fs.writeFileSync(
      reexportPath,
      `export { original } from "./${path.basename(srcPath, ".ts")}";`,
      "utf-8"
    );
    const program = ts.createProgram([reexportPath, srcPath], {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      strict: true,
      skipLibCheck: true,
    });
    const result = extractModuleMorphology(program, reexportPath);
    expect(result).not.toBeNull();
    expect(result!.morphology.some((l) => l.includes("original"))).toBe(true);
  });
});

// ─── extractExportMorphology ─────────────────────────────────────────────────

describe("extractExportMorphology", () => {
  it("extracts a single named function export", () => {
    const { program, filePath } = makeProgram(`
      export function alpha(): void {}
      export function beta(x: number): string { return String(x); }
    `);
    const result = extractExportMorphology(program, filePath, "beta")!;
    expect(result.summary).toBe("1 function");
    expect(result.morphology.some((l) => l.includes("beta"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("alpha"))).toBe(false);
  });

  it("returns null for nonexistent export name", () => {
    const { program, filePath } = makeProgram(`export function exists(): void {}`);
    expect(extractExportMorphology(program, filePath, "doesNotExist")).toBeNull();
  });

  it("returns null for nonexistent file", () => {
    const { program } = makeProgram(`export const x = 1;`);
    expect(extractExportMorphology(program, "/nonexistent.ts", "x")).toBeNull();
  });

  it("extracts a class export with members", () => {
    const { program, filePath } = makeProgram(`
      export class MyClass {
        doStuff(): boolean { return true; }
      }
    `);
    const result = extractExportMorphology(program, filePath, "MyClass")!;
    expect(result.summary).toBe("1 class");
    expect(result.morphology.some((l) => l.includes("class MyClass"))).toBe(true);
    expect(result.morphology.some((l) => l.includes("doStuff"))).toBe(true);
  });

  it("extracts an interface export", () => {
    const { program, filePath } = makeProgram(`
      export interface Opts { verbose: boolean; }
    `);
    const result = extractExportMorphology(program, filePath, "Opts")!;
    expect(result.summary).toBe("1 interface");
    expect(result.morphology.some((l) => l.includes("interface Opts"))).toBe(true);
  });

  it("extracts a type alias export", () => {
    const { program, filePath } = makeProgram(`
      export type ID = string;
    `);
    const result = extractExportMorphology(program, filePath, "ID")!;
    expect(result.summary).toBe("1 type");
  });

  it("extracts an enum export", () => {
    const { program, filePath } = makeProgram(`
      export enum Dir { Up, Down }
    `);
    const result = extractExportMorphology(program, filePath, "Dir")!;
    expect(result.summary).toBe("1 enum");
  });

  it("extracts a variable export", () => {
    const { program, filePath } = makeProgram(`
      export const PI = 3.14;
    `);
    const result = extractExportMorphology(program, filePath, "PI")!;
    expect(result.summary).toBe("1 variable");
  });

  it("resolves re-exported aliases", () => {
    const srcPath = path.join(tmpDir, `exp-src-${fileCounter++}.ts`);
    const reexportPath = path.join(tmpDir, `exp-reexport-${fileCounter++}.ts`);
    fs.writeFileSync(srcPath, `export function thing(): void {}`, "utf-8");
    fs.writeFileSync(
      reexportPath,
      `export { thing } from "./${path.basename(srcPath, ".ts")}";`,
      "utf-8"
    );
    const program = ts.createProgram([reexportPath, srcPath], {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      strict: true,
      skipLibCheck: true,
    });
    const result = extractExportMorphology(program, reexportPath, "thing");
    expect(result).not.toBeNull();
    expect(result!.summary).toBe("1 function");
  });
});

// ─── extractModuleImports ────────────────────────────────────────────────────

describe("extractModuleImports", () => {
  it("extracts named imports", () => {
    const { program, filePath } = makeProgram(`
      import { readFile, writeFile } from "node:fs";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.imports).toContain('readFile from "node:fs"');
    expect(result.imports).toContain('writeFile from "node:fs"');
    expect(result.importsSummary).toBe("2 imports from 1 path");
  });

  it("extracts default imports", () => {
    const { program, filePath } = makeProgram(`
      import path from "node:path";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.imports).toContain('path from "node:path"');
    expect(result.importEntries[0].typeOnly).toBe(false);
  });

  it("extracts namespace imports", () => {
    const { program, filePath } = makeProgram(`
      import * as fs from "node:fs";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.imports).toContain('* as fs from "node:fs"');
    expect(result.importEntries[0].symbol).toBe("* as fs");
  });

  it("detects type-only imports", () => {
    const { program, filePath } = makeProgram(`
      import type { Foo } from "./foo";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.importEntries[0].typeOnly).toBe(true);
    expect(result.importEntries[0].symbol).toBe("Foo");
  });

  it("detects inline type modifier", () => {
    const { program, filePath } = makeProgram(`
      import { type Bar, baz } from "./mod";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    const barEntry = result.importEntries.find((e) => e.symbol === "Bar");
    const bazEntry = result.importEntries.find((e) => e.symbol === "baz");
    expect(barEntry?.typeOnly).toBe(true);
    expect(bazEntry?.typeOnly).toBe(false);
  });

  it("handles side-effect imports", () => {
    const { program, filePath } = makeProgram(`
      import "./polyfill";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.imports).toContain('* from "./polyfill"');
    expect(result.importEntries[0].symbol).toBe("*");
    expect(result.importEntries[0].path).toBe("./polyfill");
  });

  it("handles default + named combined imports", () => {
    const { program, filePath } = makeProgram(`
      import React, { useState, useEffect } from "react";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.imports).toContain('React from "react"');
    expect(result.imports).toContain('useState from "react"');
    expect(result.imports).toContain('useEffect from "react"');
    expect(result.importsSummary).toBe("3 imports from 1 path");
  });

  it("counts paths correctly for multiple sources", () => {
    const { program, filePath } = makeProgram(`
      import { a } from "./a";
      import { b } from "./b";
      import { c } from "./a";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.importsSummary).toBe("3 imports from 2 paths");
  });

  it("singular import summary", () => {
    const { program, filePath } = makeProgram(`
      import { one } from "./one";
      export const x = 1;
    `);
    const result = extractModuleImports(program, filePath)!;
    expect(result.importsSummary).toBe("1 import from 1 path");
  });

  it("returns null when there are no imports", () => {
    const { program, filePath } = makeProgram(`export const x = 1;`);
    expect(extractModuleImports(program, filePath)).toBeNull();
  });

  it("returns null for nonexistent file", () => {
    const { program } = makeProgram(`export const x = 1;`);
    expect(extractModuleImports(program, "/nonexistent.ts")).toBeNull();
  });
});
