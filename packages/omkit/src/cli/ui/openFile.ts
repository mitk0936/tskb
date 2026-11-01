import { spawn } from "node:child_process";

/**
 * Open `file` with the OS's default handler (a browser, for `report.html`) without waiting on it.
 * Resolves once the opener has launched, or rejects with why it couldn't — a Linux box without
 * `xdg-open`, say — so the caller can say so instead of the key press doing nothing.
 */
export function openFile(file: string): Promise<void> {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", file]]
      : process.platform === "darwin"
        ? ["open", [file]]
        : ["xdg-open", [file]];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
