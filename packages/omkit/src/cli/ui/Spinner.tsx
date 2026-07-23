import { useEffect, useState, type ReactElement } from "react";
import { Text } from "ink";

// Braille dots — a smooth ten-frame cycle that reads as motion in a terminal.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * A tiny animated spinner — cycles braille frames on a timer. Self-contained (no `ink-spinner`
 * dependency). The interval is unref'd so it never keeps the process alive on its own: it animates
 * only while something else (the live run's IPC channel) holds the event loop open, and stops the
 * instant the run is disposed — so it can't block the app's exit.
 */
export function Spinner({ label }: { label?: string }): ReactElement {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    id.unref?.();
    return () => clearInterval(id);
  }, []);
  return (
    <Text dimColor>
      {FRAMES[frame]}
      {label ? ` ${label}` : ""}
    </Text>
  );
}
