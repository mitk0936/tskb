import { describe, expect, test } from "vitest";
import { debuggerFreeEnv } from "../../src/system/proc.ts";

describe("debuggerFreeEnv", () => {
  test("strips a bare --inspect from NODE_OPTIONS and keeps other vars", () => {
    const out = debuggerFreeEnv({ NODE_OPTIONS: "--inspect", FOO: "bar" });
    expect(out.NODE_OPTIONS).toBeUndefined(); // nothing left → dropped entirely
    expect(out.FOO).toBe("bar");
  });

  test("strips --inspect-brk=PORT but preserves unrelated NODE_OPTIONS flags", () => {
    const out = debuggerFreeEnv({
      NODE_OPTIONS: "--inspect-brk=9229 --max-old-space-size=4096",
    });
    expect(out.NODE_OPTIONS).toBe("--max-old-space-size=4096");
  });

  test("removes VS Code auto-attach: the js-debug bootloader --require and VSCODE_INSPECTOR_OPTIONS", () => {
    const out = debuggerFreeEnv({
      NODE_OPTIONS:
        '--require "C:\\Users\\me\\.vscode\\extensions\\ms-vscode.js-debug\\src\\bootloader.js" --inspect-publish-uid=http',
      VSCODE_INSPECTOR_OPTIONS: "{...handshake...}",
    });
    expect(out.NODE_OPTIONS).toBeUndefined();
    expect(out.VSCODE_INSPECTOR_OPTIONS).toBeUndefined();
  });

  test("keeps a legitimate non-debug --require intact", () => {
    const out = debuggerFreeEnv({ NODE_OPTIONS: "--require ./register.js" });
    expect(out.NODE_OPTIONS).toBe("--require ./register.js");
  });

  test("does not match --inspect as a prefix of another flag", () => {
    const out = debuggerFreeEnv({ NODE_OPTIONS: "--inspector-foo=1" });
    expect(out.NODE_OPTIONS).toBe("--inspector-foo=1");
  });

  test("returns a copy and leaves an already-clean env untouched", () => {
    const input = { PATH: "/usr/bin" };
    const out = debuggerFreeEnv(input);
    expect(out).toEqual({ PATH: "/usr/bin" });
    expect(out).not.toBe(input);
  });
});
