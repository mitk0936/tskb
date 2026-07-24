import path from "node:path";
import type { Diagnostic } from "../client/types.ts";
import type { ReportItem } from "../ui/Report.tsx";

/**
 * Turn typecheck diagnostics into a report: a headline, one item per diagnostic (location + message),
 * and the process exit code — **1 when there are any errors**, 0 when the project is clean.
 */
export function checkReport(diagnostics: Diagnostic[]): {
  title: string;
  items: ReportItem[];
  code: number;
} {
  const n = diagnostics.length;
  const items = diagnostics.map((d) => ({
    head: `${path.basename(d.file)}:${d.line}`,
    detail: d.message,
  }));
  const title = n === 0 ? "no type errors" : `${n} type error${n === 1 ? "" : "s"}`;
  return { title, items, code: n === 0 ? 0 : 1 };
}
