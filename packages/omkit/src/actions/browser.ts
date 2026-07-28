import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { action } from "../core/action.ts";

// Re-export so consumers can name the handle without importing playwright-core directly.
export type { Browser } from "playwright-core";

export interface BrowserOptions {
  /** Run without a visible window. Default false — the browser is visible. */
  headless?: boolean;
  /**
   * Which Chromium to launch. Defaults to the installed Google Chrome (`"chrome"`):
   * playwright-core ships no bundled browser, so a channel (or {@link executablePath})
   * is what lets `launch` succeed without a separate `playwright install`. Pass an
   * empty string to use a bundled Chromium instead.
   */
  channel?: string;
  /** Absolute path to a browser executable, overriding {@link channel}. */
  executablePath?: string;
  /** Extra flags for the browser process (e.g. `"--start-maximized"`). */
  args?: string[];
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Launches a Chromium browser with Playwright and publishes the live {@link Browser}
 * as this action's handle, so a driver — e.g. `chromePage("Explorer", await browser.ref,
 * { url })` — can await `instance.ref` and open pages in it. This owns the browser it
 * launches (unlike a CDP endpoint handed to `chromePage`, which belongs to its opener),
 * so teardown closes it. Replaces the external chromedriver/WebDriver dance.
 *
 * Daemon-shaped: launch + attach, stay alive until the run's `signal` aborts, then close
 * the browser (bounded by a short race, so a wedged `close()` can't stall teardown).
 */
export const browser = action("browser")
  .ref<Browser>()
  .run(async ({ signal, attach }, opts: BrowserOptions = {}) => {
    const { headless = false, channel = "chrome", executablePath, args } = opts;

    const launchOpts: LaunchOptions = { headless, args };
    if (executablePath) launchOpts.executablePath = executablePath;
    else if (channel) launchOpts.channel = channel;

    const launched = await chromium.launch(launchOpts);
    console.log(
      `launched ${executablePath || channel || "chromium"}${headless ? " (headless)" : ""}`
    );

    attach(launched); // resolves instance.ref → the live Browser

    // Daemon: hold the browser open until teardown, then close it (it's ours to close).
    return new Promise<void>((resolveRun) => {
      const stop = (): void => {
        void Promise.race([launched.close(), delay(2000)]).finally(resolveRun);
      };
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    });
  });
