import { fileURLToPath } from "node:url";

/** `{ file, line }` from a V8 stack frame — handles `at fn (path:line:col)` and `at path:line:col`. */
const parseFrame = (frame: string): { file: string; line: string } | undefined => {
  const paren = frame.match(/\(([^()]+)\)\s*$/);
  const loc = (paren ? paren[1] : frame.replace(/^\s*at\s+/, "")).trim();
  const m = loc.match(/^(.+):(\d+):\d+$/) ?? loc.match(/^(.+):(\d+)$/);
  return m ? { file: m[1], line: m[2] } : undefined;
};

const nativePath = (file: string): string => {
  if (!file.startsWith("file://")) return file;
  try {
    return fileURLToPath(file);
  } catch {
    return file;
  }
};

/**
 * `file:line` of the site that *called* the function invoking `callerSite` — the first stack
 * frame outside both this module and that caller's module. So `action().run(...)` records
 * where `.run(...)` was written, and `om(...)` records where the run was launched from. At
 * runtime that's the built file (e.g. `dist/actions/chrome-page.js`). `undefined` with no stack.
 */
export const callerSite = (): string | undefined => {
  const stack = new Error().stack;
  if (!stack) return undefined;
  const frames = stack.split("\n").slice(1);
  const self = parseFrame(frames[0] ?? "")?.file; // this module (callsite)
  const caller = parseFrame(frames[1] ?? "")?.file; // the module that called us
  for (const frame of frames) {
    const at = parseFrame(frame);
    if (at && at.file !== self && at.file !== caller) return `${nativePath(at.file)}:${at.line}`;
  }
  return undefined;
};
