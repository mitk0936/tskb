// ─── ReloadWatcher ────────────────────────────────────────────────────────────
// Polls the live explore server's /version endpoint. When the version changes
// from the page's baseline, calls onUpdate (which shows the reload dialog).
// Disabled entirely unless the meta chunk says mode === "served", so the same
// SPA build is a no-op in the static export.

export interface ReloadWatcherOptions {
  /** meta.mode from the loaded meta chunk. */
  mode: string | undefined;
  /** meta.version from the loaded meta chunk (the page's starting version). */
  baseline: number | undefined;
  /** Called each time a new version is detected. */
  onUpdate: () => void;
  /** Poll interval in ms. Default 3000. */
  intervalMs?: number;
  /** Injectable fetcher (tests). Returns the current version or undefined. */
  fetchVersion?: () => Promise<number | undefined>;
}

export interface ReloadWatcherHandle {
  stop(): void;
}

async function defaultFetchVersion(): Promise<number | undefined> {
  const res = await fetch("/version", { cache: "no-store" });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { version?: unknown };
  return typeof data.version === "number" ? data.version : undefined;
}

export function startReloadWatcher(opts: ReloadWatcherOptions): ReloadWatcherHandle {
  if (opts.mode !== "served") return { stop() {} };

  const intervalMs = opts.intervalMs ?? 3000;
  const fetchVersion = opts.fetchVersion ?? defaultFetchVersion;
  let baseline = opts.baseline;

  const timer = setInterval(() => {
    void (async () => {
      try {
        const version = await fetchVersion();
        if (version === undefined) return;
        if (baseline === undefined) {
          baseline = version;
          return;
        }
        if (version !== baseline) {
          baseline = version; // advance so we don't re-nag for the same change
          opts.onUpdate();
        }
      } catch {
        // Network blip — treat as no change and keep polling.
      }
    })();
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
