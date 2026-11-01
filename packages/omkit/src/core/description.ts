import type { OmDescription } from "./types.ts";

/**
 * A summary as the one line it is meant to be: runs of whitespace (newlines, a template
 * literal's indentation) collapsed to single spaces and the ends trimmed. Without this a
 * multi-line summary keeps its indentation, which markdown readers — the generated skill —
 * render as a code block.
 */
export function oneLine(summary: string): string {
  return summary.replace(/\s+/g, " ").trim();
}

/** The description `.describe()` stores: as given, with its summary made {@link oneLine}. */
export function normalizeDescription(description: OmDescription): OmDescription {
  return { ...description, summary: oneLine(description.summary) };
}
