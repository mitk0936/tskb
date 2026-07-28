import { execFileSync } from "node:child_process";

/**
 * One process in a snapshot: its id, its parent's id, and an opaque identity token
 * (its creation time) that distinguishes a live process from a later reuse of its pid.
 */
export interface ProcInfo {
  pid: number;
  ppid: number;
  id: string;
}

/** Takes a snapshot of every live process. Injected so it's swappable + unit-testable. */
export type Snapshot = () => ProcInfo[];

/**
 * A safety net for the Windows Ctrl+C-orphan edge (see {@link import("./proc.ts").killTree}).
 * We only ever spawn a *shell*, so `killTree` on the shell's pid can miss a re-parented
 * grandchild (vite, chromedriver) when a mashed Ctrl+C kills the intermediate first.
 *
 * This registry closes that gap: it polls the process table while a tracked root's tree is
 * intact and **accumulates the descendant pids** (with their identity). On teardown, `sweep`
 * force-kills every recorded descendant that is *still alive with the same identity* — so an
 * orphan is reaped even after it re-parented, while a since-reused pid (identity changed) or
 * a cleanly-exited pid is left alone. Roots themselves stay `killTree`'s job.
 *
 * Pure and platform-agnostic; the caller decides when it applies (POSIX reaps via the process
 * group, so `proc.ts` only tracks on Windows).
 */
export class ProcRegistry {
  private readonly roots = new Set<number>();
  private readonly known = new Map<number, string>(); // descendant pid → identity, accumulated
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly snapshot: Snapshot,
    private readonly kill: (pid: number) => void,
    // A snapshot costs ~½s (powershell startup), and daemon leaves are long-lived and stable,
    // so poll unhurriedly — a mashed Ctrl+C always lands well after the platform is up, by
    // which point the leaves have been recorded. Swap `winSnapshot` for a faster backend
    // (wmic / a native process-list) if this churn ever matters.
    private readonly intervalMs = 5000
  ) {}

  /** Start tracking a spawned root (shell) pid; begins polling if not already. */
  track(pid: number): void {
    this.roots.add(pid);
    if (!this.timer) {
      this.timer = setInterval(() => this.poll(), this.intervalMs);
      this.timer.unref?.();
    }
  }

  /** Stop tracking a root that settled on its own. Already-recorded descendants are kept. */
  untrack(pid: number): void {
    this.roots.delete(pid);
    if (this.roots.size === 0) this.stop();
  }

  /** One poll tick: record every current descendant of every tracked root. */
  poll(): void {
    if (this.roots.size === 0) return;
    const byParent = new Map<number, ProcInfo[]>();
    for (const p of this.snapshot()) {
      const siblings = byParent.get(p.ppid);
      if (siblings) siblings.push(p);
      else byParent.set(p.ppid, [p]);
    }
    const stack = [...this.roots];
    const seen = new Set<number>();
    while (stack.length > 0) {
      const parent = stack.pop() as number;
      for (const child of byParent.get(parent) ?? []) {
        if (seen.has(child.pid)) continue;
        seen.add(child.pid);
        this.known.set(child.pid, child.id);
        stack.push(child.pid);
      }
    }
  }

  /**
   * Teardown sweep: kill every recorded descendant still alive under its original identity.
   * Stops polling and clears state, so it's safe to call once at finalize.
   */
  sweep(): void {
    this.stop();
    if (this.known.size === 0) {
      this.roots.clear();
      return;
    }
    const current = new Map(this.snapshot().map((p) => [p.pid, p.id] as const));
    for (const [pid, id] of this.known) {
      if (current.get(pid) === id) this.kill(pid);
    }
    this.known.clear();
    this.roots.clear();
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * Default Windows snapshot: one `Get-CimInstance Win32_Process` call, projected to
 * `{ pid, ppid, id }` where `id` is the process creation time (ticks) — stable per process,
 * different across a pid reuse. Best-effort: any failure yields an empty snapshot.
 */
export const winSnapshot: Snapshot = () => {
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,@{n='I';e={ if ($_.CreationDate) { $_.CreationDate.Ticks } else { 0 } }} | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
    );
    const parsed = JSON.parse(out) as
      | { ProcessId: number; ParentProcessId: number; I: number | string }
      | Array<{ ProcessId: number; ParentProcessId: number; I: number | string }>;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, id: String(r.I) }));
  } catch {
    return [];
  }
};
