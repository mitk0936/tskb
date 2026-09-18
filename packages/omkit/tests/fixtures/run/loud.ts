import { om } from "../../../src/index.ts";

/**
 * Writes far more than a pipe buffer straight to `process.stdout`/`process.stderr` — the one
 * path `patch-console` does not intercept, so it reaches the child's real streams. A supervisor
 * that pipes those streams without reading them wedges the child on its next write.
 */
om("loud").run(async ({ snapshot }) => {
  const chunk = `${"y".repeat(1023)}\n`;
  for (let i = 0; i < 400; i++) process.stdout.write(chunk); // ~400 KB
  for (let i = 0; i < 400; i++) process.stderr.write(chunk); // ~400 KB
  await snapshot("survived", { ok: true });
});
