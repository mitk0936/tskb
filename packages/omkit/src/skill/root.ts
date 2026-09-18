import fs from "node:fs";
import path from "node:path";

/**
 * The directory a generated skill is written for: the nearest enclosing repository, or the
 * project itself when there is none.
 *
 * The root is not really a free choice. A skill file lives at `.claude/skills/<name>/SKILL.md`,
 * an assistant reads it with the repository as its working directory, and so every path and
 * command inside has to be relative to *that* — not to wherever the om project's tsconfig
 * happens to sit. Defaulting to the tsconfig's own directory made the common monorepo layout
 * (an `om/` folder beside the code it drives) wrong by default, and needed a second flag to
 * correct what the first flag had just decided.
 *
 * `.git` is checked as an entry, not as a directory: a worktree or submodule records it as a
 * file containing a `gitdir:` pointer, and that is still the top of the checkout.
 */
export function skillRoot(projectDir: string): string {
  let dir = path.resolve(projectDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(projectDir);
    dir = parent;
  }
}
