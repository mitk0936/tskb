/**
 * The generated-skill layer: turn a project's registrations into `.claude/skills/omkit-runs/`.
 *
 * Split so that everything except {@link module:./file.ts} is pure — the model and the renderer
 * take data and return data, which is what makes determinism testable without touching a disk.
 */
export { buildSkillModel, registryHash } from "./model.ts";
export type { SkillCall, SkillEntry, SkillModel, SkillProject } from "./model.ts";
export { skillRoot } from "./root.ts";
export { renderSkill, generatedBy, SKILL_NAME } from "./render.ts";
export { readExisting, writeSkill, DEFAULT_DESCRIPTION, SKILL_RELATIVE_PATH } from "./file.ts";
export type { ExistingSkill } from "./file.ts";
