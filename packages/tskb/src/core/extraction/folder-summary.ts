import fs from "node:fs";

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

/**
 * Extract a filesystem summary for a folder: child counts and names.
 *
 * @param absolutePath - Absolute path to the folder
 * @returns Summary with children lists, or null if unreadable
 */
export function extractFolderSummary(absolutePath: string): FolderSummary | null {
  try {
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

    const folders: FolderChild[] = [];
    const files: FolderChild[] = [];

    for (const entry of entries) {
      // Exclude dotfiles/hidden entries
      if (entry.name.startsWith(".")) continue;

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
