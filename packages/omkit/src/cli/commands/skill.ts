import path from "node:path";
import {
  buildSkillModel,
  readExisting,
  renderSkill,
  writeSkill,
  DEFAULT_DESCRIPTION,
  SKILL_RELATIVE_PATH,
} from "../../skill/index.ts";
import type { OmkitClient } from "../../client/index.ts";
import type { Registry } from "../../client/registry.ts";

export { skillRoot } from "../../skill/index.ts";

const EMPTY_REGISTRY: Registry = { oms: [], actions: [], warnings: [] };

export interface SkillOptions {
  /** Project root the skill is written relative to — the directory owning the tsconfig. */
  readonly root: string;
  /** Override the output path (still resolved against `root` when relative). */
  readonly out?: string;
  /** Compare hashes and exit non-zero on drift instead of writing. */
  readonly check?: boolean;
}

/**
 * The `skill` command: generate `.claude/skills/omkit-runs/SKILL.md` from what this project's
 * oms and actions declare, so an assistant knows what is runnable before its first tool call.
 *
 * Generation runs no workflow. It uses the same `OMKIT_DISCOVER=1` fork the MCP server's
 * `list_oms` uses, which returns from `launch()` before an execution tree exists.
 */
export async function skillCommand(client: OmkitClient, opts: SkillOptions): Promise<void> {
  const file = path.resolve(opts.root, opts.out ?? SKILL_RELATIVE_PATH);

  const registrations = await client.discoverRegistrations();
  // The client's tsconfig is the one discovery actually ran against, so the commands the file
  // renders are the commands that produced it — not a guess at what the reader should type.
  const model = buildSkillModel(registrations, registrations.registry ?? EMPTY_REGISTRY, {
    root: opts.root,
    tsconfig: path.resolve(client.tsconfig),
  });
  const existing = readExisting(file);

  if (opts.check) {
    reportCheck(file, existing.hash, model.hash);
    return;
  }

  // The description is the skill's loading trigger and is authored, so an existing one always
  // wins; the fallback is only ever written into a file that does not exist yet.
  const content = renderSkill(model, { description: existing.description ?? DEFAULT_DESCRIPTION });
  writeSkill(file, content);

  const total = model.oms.length + model.actions.length;
  console.log(`wrote ${path.relative(opts.root, file) || file}`);
  console.log(
    `  ${model.oms.length} om${model.oms.length === 1 ? "" : "s"}, ` +
      `${model.actions.length} action${model.actions.length === 1 ? "" : "s"}  ` +
      `[registry-hash: ${model.hash}]`
  );
  if (total === 0) {
    console.log("  nothing is exposed yet — mark an om or action with .mcp() to list it");
  }
  reportWarnings(registrations.warnings);
}

/**
 * `--check` is for a hook or a CI step, so it says what changed and sets the exit code rather
 * than writing. A file with no marker at all counts as drift: it was hand-written or predates
 * the generator, and either way regenerating is the fix.
 */
function reportCheck(file: string, existing: string | undefined, fresh: string): void {
  if (existing === fresh) {
    console.log(`up to date  [registry-hash: ${fresh}]`);
    return;
  }
  const detail = existing === undefined ? "no registry-hash found" : `has ${existing}`;
  console.error(`${file} is stale — ${detail}, project is ${fresh}`);
  console.error("run `omkit skill` to regenerate");
  process.exitCode = 1;
}

/** Discovery degrades to warnings rather than failing, so they have to reach the terminal. */
function reportWarnings(warnings: readonly string[]): void {
  if (warnings.length === 0) return;
  console.error(`\nwarnings (${warnings.length})`);
  for (const w of warnings) console.error(`  ${w}`);
}
