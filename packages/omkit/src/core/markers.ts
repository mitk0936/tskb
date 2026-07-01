/** The special "title" log lines that get a distinguishing prefix. */
export type MarkerKind = "event" | "action" | "run" | "snapshot";

const PREFIX: Record<MarkerKind, string> = {
  event: "⚡",
  action: "▸",
  run: "●",
  snapshot: "📎",
};

/**
 * Prefixes a special log line so it's explicit what it is when scanning the
 * global log — an emitted event (`[ev]`), an action's title (`[action]`), a run
 * lifecycle milestone (`[run]`), or a captured state snapshot (`[snapshot]`) —
 * versus plain output.
 */
export const marker = (kind: MarkerKind, text: string): string => `${PREFIX[kind]} ${text}`;
