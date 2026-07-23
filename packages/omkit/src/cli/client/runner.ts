import { fork } from "node:child_process";
import path from "node:path";
import { createChannel, type Transport } from "./channel.ts";
import type { ChildMessage, SupervisorMessage } from "../../core/interaction.ts";
import type { RunSession, RunOptions } from "./types.ts";

/**
 * The `tsx` loader, resolved to an absolute URL from omkit's own location. Resolving it here
 * (not as the bare specifier `--import tsx`) keeps the child's `tsx` independent of its cwd —
 * a run in any directory still finds the loader shipped with omkit.
 */
const tsxLoader = import.meta.resolve("tsx");

/**
 * Fork `omFile` as a supervised child: the `tsx` loader runs the TypeScript directly,
 * `OMKIT_SUPERVISED=1` flips the child into channel mode (see core/interaction.ts), and its
 * IPC channel is wrapped into a {@link RunSession}. stdout/stderr are piped (not inherited)
 * so the child never writes to the supervisor's terminal.
 */
export function runOm(omFile: string, opts: RunOptions = {}): RunSession {
  const child = fork(omFile, [], {
    execArgv: ["--import", tsxLoader],
    cwd: opts.cwd ?? path.dirname(omFile),
    env: { ...process.env, OMKIT_SUPERVISED: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  const transport: Transport = {
    send: (message: SupervisorMessage) => void child.send(message),
    onMessage: (handler) => void child.on("message", (m) => handler(m as ChildMessage)),
    onClose: (handler) => void child.on("close", (code) => handler(code)),
  };

  const session = createChannel(transport);

  // When the run settles, the child has already written its logs and reaped its process tree —
  // but the live IPC channel (and the unread stdout/stderr pipes) keep both this process and the
  // child alive, so the frontend would hang after teardown. Release it: disconnect so the child
  // can drain and exit, and force-kill if it lingers past a short grace.
  void session.result.then(() => {
    if (child.exitCode !== null || child.signalCode !== null) return; // already gone
    if (child.connected) child.disconnect();
    const kill = setTimeout(() => child.kill(), 1500);
    child.once("close", () => clearTimeout(kill));
  });

  return session;
}

/**
 * Spawn `omFile` **bare** — inherited stdio, no supervision. The child owns the terminal, so
 * its LiveRenderer, summary, and native `readline` prompts all work. Resolves the exit code.
 */
export function spawnBare(omFile: string, opts: { cwd?: string } = {}): Promise<number> {
  // A bare run is unsupervised even if the parent process happens to carry the flag (e.g. a
  // test runner spawned from inside a supervised run) — clear it so the child stays bare.
  const env = { ...process.env };
  delete env.OMKIT_SUPERVISED;
  const child = fork(omFile, [], {
    execArgv: ["--import", tsxLoader],
    cwd: opts.cwd ?? path.dirname(omFile),
    stdio: "inherit",
    env,
  });
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
}
