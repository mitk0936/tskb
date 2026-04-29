import fs from "node:fs";
import { execFileSync } from "node:child_process";

export interface FolderChild {
  name: string;
  nodeId?: string; // graph node ID if this child is a registered folder or module
  desc?: string; // node description, populated when nodeId is set
}

export interface FolderChildren {
  folders: FolderChild[];
  files: FolderChild[];
}

export interface FolderSummary {
  summary: string; // "3 folders, 7 files"
  children: FolderChildren;
}

/** Returns the set of child names that git considers ignored. */
function getGitIgnored(absolutePath: string, names: string[]): Set<string> {
  if (names.length === 0) return new Set();
  try {
    const input = names.map((n) => `${absolutePath}/${n}`).join("\0");
    const out = execFileSync("git", ["check-ignore", "-z", "--stdin"], {
      input,
      cwd: absolutePath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new Set(
      out
        .split("\0")
        .filter(Boolean)
        .map((p) => p.split("/").pop()!)
    );
  } catch {
    // Not a git repo or git unavailable — treat nothing as ignored
    return new Set();
  }
}

/**
 * Extract a filesystem summary for a folder: child counts and names.
 *
 * @param absolutePath - Absolute path to the folder
 * @returns Summary with children lists, or null if unreadable
 */
export function extractFolderSummary(absolutePath: string): FolderSummary | null {
  try {
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

    // Collect candidate names (excluding dotfiles) for a single git check-ignore call
    const candidates: string[] = [];
    for (const entry of entries) {
      if (!entry.name.startsWith(".")) candidates.push(entry.name);
    }
    const ignored = getGitIgnored(absolutePath, candidates);

    const folders: FolderChild[] = [];
    const files: FolderChild[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (ignored.has(entry.name)) continue;

      if (entry.isDirectory()) {
        folders.push({ name: entry.name });
      } else if (entry.isFile()) {
        files.push({ name: entry.name });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    const parts: string[] = [];
    if (folders.length > 0) {
      parts.push(`${folders.length} folder${folders.length === 1 ? "" : "s"}`);
    }
    if (files.length > 0) {
      parts.push(`${files.length} file${files.length === 1 ? "" : "s"}`);
    }

    const summary = parts.length > 0 ? parts.join(", ") : "empty";

    return { summary, children: { folders, files } };
  } catch {
    return null;
  }
}
