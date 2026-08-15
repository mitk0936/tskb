import fs from "node:fs";
import path from "node:path";
import { SKILL_NAME } from "./render.ts";

/** Where the skill lands, relative to the project root that owns the tsconfig. */
export const SKILL_RELATIVE_PATH = path.join(".claude", "skills", SKILL_NAME, "SKILL.md");

/**
 * The `description` written into a file that does not exist yet.
 *
 * This field is the skill's loading trigger, so its wording decides whether an assistant reads
 * the file at the right moment. A generated summary of contents ("lists 2 oms…") would be the
 * wrong shape — the field has to say *when to use this*. So it is authored, and this is only
 * the starting point: {@link readExisting} preserves whatever the author changes it to.
 */
export const DEFAULT_DESCRIPTION =
  "Runnable workflows in this repo (oms and actions) — what each does, its arguments, and how to run it. Load before running or debugging any project workflow.";

/** What a previously generated file still has to say for itself. */
export interface ExistingSkill {
  /** The `description:` value, verbatim — continuation lines and all. */
  readonly description?: string;
  /** The `registry-hash` from the generated-by marker, when the file carries one. */
  readonly hash?: string;
}

/**
 * Read back the two things a regeneration must not lose: the authored description, and the
 * hash to compare against. A missing or unreadable file is not an error — it is the "generate
 * fresh" case, and returns an empty result.
 */
export function readExisting(file: string): ExistingSkill {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  const hash = /registry-hash:\s*([0-9a-f]{8})/.exec(text)?.[1];
  const description = frontmatterDescription(text);
  return { ...(description !== undefined ? { description } : {}), ...(hash ? { hash } : {}) };
}

/**
 * Pull `description` out of the leading frontmatter, keeping any folded continuation lines
 * exactly as written — they are re-emitted verbatim, so a wrapped description survives
 * regeneration byte-for-byte instead of being reflowed into one long line.
 */
function frontmatterDescription(text: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (block === undefined) return undefined;

  const lines = block.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("description:"));
  if (start === -1) return undefined;

  const value = [lines[start]!.slice("description:".length).trimStart()];
  // A continuation is any indented line; the next unindented line starts a new key.
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    value.push(line);
  }
  return value.join("\n");
}

/** Write the skill, creating its directory. The parent may not exist on a first generation. */
export function writeSkill(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}
