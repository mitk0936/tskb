import path from "node:path";
import type { Registration, RegistrationSet, Registry } from "../../client/registry.ts";

export interface FormatOptions {
  readonly json?: boolean;
  /**
   * What the oms and actions declare, from the discovery fork. Present only under
   * `--describe`: reading it costs an import of every candidate file, which is why plain
   * `ls` stays AST-only and prints exactly what it always did.
   */
  readonly registrations?: RegistrationSet;
}

/** Render a {@link Registry} for the terminal (plain text) or as JSON. */
export function formatRegistry(registry: Registry, opts: FormatOptions = {}): string {
  if (opts.json) return renderJson(registry, opts.registrations);

  const declared = index(opts.registrations);
  const lines = [
    `oms (${registry.oms.length})`,
    ...registry.oms.flatMap((om) =>
      row(
        `${om.name}  ${path.basename(om.file)}:${om.line}`,
        [],
        declared?.get(key(om.name, om.file))
      )
    ),
    "",
    `actions (${registry.actions.length})`,
    ...registry.actions.flatMap((a) =>
      row(
        `${a.name}  ${path.basename(a.file)}`,
        [a.publishesCapability ? "ref" : "", a.events ? "events" : ""],
        declared?.get(key(a.name, a.file))
      )
    ),
  ];

  if (registry.warnings.length) {
    lines.push("", `warnings (${registry.warnings.length})`);
    for (const w of registry.warnings) lines.push(`  ${w}`);
  }
  return lines.join("\n");
}

/** One entry: its head line with any markers, plus an indented summary when one was declared. */
function row(head: string, tags: string[], meta: Registration | undefined): string[] {
  const all = [...tags, ...mcpTags(meta)].filter(Boolean);
  const suffix = all.length ? `  [${all.join(", ")}]` : "";
  return meta?.summary ? [`  ${head}${suffix}`, `    ${meta.summary}`] : [`  ${head}${suffix}`];
}

function renderJson(registry: Registry, registrations: RegistrationSet | undefined): string {
  return JSON.stringify(registrations ? { ...registry, ...registrations } : registry, null, 2);
}

/** Declarations keyed by name-in-file, so a name reused across files cannot cross over. */
function index(set: RegistrationSet | undefined): Map<string, Registration> | undefined {
  if (!set) return undefined;
  const byKey = new Map<string, Registration>();
  for (const r of [...set.oms, ...set.actions]) byKey.set(key(r.name, r.file), r);
  return byKey;
}

const key = (name: string, file: string): string => `${name}\0${path.resolve(file)}`;

/** `[mcp]` / `[mcp, long-lived]` — only meaningful once the fork has told us what is exposed. */
function mcpTags(meta: Registration | undefined): string[] {
  if (!meta?.mcp) return [];
  return meta.mcp.mode === "long-lived" ? ["mcp", "long-lived"] : ["mcp"];
}
