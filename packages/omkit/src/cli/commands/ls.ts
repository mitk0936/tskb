import path from "node:path";
import type { Registry } from "../client/registry.ts";

/** Render a {@link Registry} for the terminal (plain text) or as JSON. */
export function formatRegistry(registry: Registry, opts: { json?: boolean } = {}): string {
  if (opts.json) return JSON.stringify(registry, null, 2);

  const lines: string[] = [];
  lines.push(`oms (${registry.oms.length})`);
  for (const om of registry.oms) {
    lines.push(`  ${om.name}  ${path.basename(om.file)}:${om.line}`);
  }
  lines.push("");
  lines.push(`actions (${registry.actions.length})`);
  for (const a of registry.actions) {
    const tags = [a.publishesCapability ? "ref" : "", a.events ? "events" : ""].filter(Boolean);
    const suffix = tags.length ? `  [${tags.join(", ")}]` : "";
    lines.push(`  ${a.name}  ${path.basename(a.file)}${suffix}`);
  }
  if (registry.warnings.length) {
    lines.push("");
    lines.push(`warnings (${registry.warnings.length})`);
    for (const w of registry.warnings) lines.push(`  ${w}`);
  }
  return lines.join("\n");
}
