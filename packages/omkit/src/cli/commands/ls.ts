import path from "node:path";
import { byNesting } from "../../client/order.ts";
import type { Registration, RegistrationSet, Registry } from "../../client/registry.ts";

export interface FormatOptions {
  readonly json?: boolean;
  /**
   * Where om depth is measured from for the listing order. Defaults to the working directory —
   * the same root the interactive picker measures from, so `ls` and the picker agree.
   */
  readonly root?: string;
  /**
   * What the oms and actions declare, from the discovery fork. Present only under
   * `--describe`: reading it costs an import of every candidate file, which is why plain
   * `ls` stays AST-only and prints exactly what it always did.
   */
  readonly registrations?: RegistrationSet;
}

/**
 * Render a {@link Registry} for the terminal (plain text) or as JSON.
 *
 * Oms are listed with {@link byNesting} — the core workflows near the root first — in both
 * modes, and in the registrations too, since under `--describe` the JSON `oms` key is theirs.
 * Actions keep discovery order: they are looked up by name, not browsed.
 */
export function formatRegistry(registry: Registry, opts: FormatOptions = {}): string {
  const order = byNesting(opts.root ?? process.cwd());
  const oms = [...registry.oms].sort(order);
  const registrations = opts.registrations && {
    ...opts.registrations,
    oms: [...opts.registrations.oms].sort(order),
  };
  if (opts.json) return renderJson({ ...registry, oms }, registrations);

  const declared = index(registrations);
  const lines = [
    `oms (${oms.length})`,
    ...oms.flatMap((om) =>
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
