import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformGraph, sanitizeFolderId } from "./transform.js";
import type { KnowledgeGraph } from "../graph/types.js";

function explorerDistDir(): string {
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(selfDir, "../../explorer");
}

/**
 * Copies the pre-built explorer SPA assets + generates chunk JSON files
 * into `outputDir`, producing a self-contained static explorer.
 */
export async function exportExplorer(graph: KnowledgeGraph, outputDir: string): Promise<void> {
  const distDir = explorerDistDir();

  if (!fs.existsSync(distDir)) {
    throw new Error(
      `Explorer assets not found at ${distDir}\n` +
        `Run 'npm run build:app' inside packages/tskb/ first.`
    );
  }

  // Copy SPA assets
  fs.mkdirSync(outputDir, { recursive: true });
  copyDir(distDir, outputDir);

  // Generate chunks
  const chunksDir = path.join(outputDir, "chunks");
  fs.mkdirSync(chunksDir, { recursive: true });

  const chunks = transformGraph(graph);

  fs.writeFileSync(path.join(chunksDir, "meta.json"), JSON.stringify(chunks.meta));

  for (const [id, chunk] of chunks.folders) {
    fs.writeFileSync(
      path.join(chunksDir, `folder-${sanitizeFolderId(id)}.json`),
      JSON.stringify(chunk)
    );
  }
}

function copyDir(src: string, dest: string): void {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
