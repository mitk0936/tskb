import { render } from "ink";
import { App } from "../ui/app.tsx";
import { renderDiagnostics, withSpinner } from "../ui/Report.tsx";
import { reportNoOms } from "./run.ts";
import type { OmkitClient, Verdict } from "../../client/index.ts";

/**
 * Render the interactive shell, which stays up across runs until the user quits. Ink's own Ctrl+C
 * handling is disabled so the app can tear a live run down gracefully first. Each run's verdict
 * and recap block are already in the scrollback by then (the app writes them there as each run
 * settles), so nothing is reprinted here; the exit code is the last run's verdict.
 *
 * Discovery runs first, before Ink takes the terminal: a fatal config problem throws here and the
 * bin's error boundary turns it into a clean crash rather than an empty list. With no oms to show,
 * it reports why (config + warnings) instead of dropping into a blank picker. Non-fatal warnings
 * are printed so they aren't lost behind the UI.
 */
export async function launchUi(client: OmkitClient): Promise<void> {
  const registry = await withSpinner("discovering…", () => client.discover());
  if (registry.oms.length === 0) {
    await reportNoOms(client.tsconfig, registry);
    return;
  }
  if (registry.warnings.length > 0) {
    await renderDiagnostics({
      kind: "warning",
      title: `${registry.warnings.length} warning${registry.warnings.length === 1 ? "" : "s"}`,
      items: registry.warnings.map((w) => ({ head: "", detail: w })),
    });
  }

  let finalVerdict: Verdict | undefined;
  const app = render(
    <App
      client={client}
      oms={registry.oms}
      warnings={registry.warnings}
      onExit={(v) => (finalVerdict = v)}
    />,
    {
      exitOnCtrlC: false,
    }
  );
  void app.waitUntilExit().then(() => {
    if (finalVerdict) process.exitCode = finalVerdict.ok ? 0 : 1;
    // Backstop: the runner disconnects the supervised child so both processes can exit, but if
    // anything (a wedged pipe, a lingering handle) keeps the event loop alive past the grace,
    // force the exit. Unref'd, so it only fires when the process is genuinely stuck — a clean
    // exit beats it to the punch and this never runs.
    setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
  });
}
