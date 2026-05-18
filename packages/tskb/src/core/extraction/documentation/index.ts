import ts from "typescript";
import path from "node:path";
import type { ExtractedRegistry } from "../registry.js";
import type { DocPriority } from "../../../runtime/jsx.js";
import { buildRefMap, findDefaultExport } from "./doc-utils.js";
import { JsxExtractor } from "./jsx-extractor.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Extracted documentation data from a single file
 */
export interface ExtractedDoc {
  /** Relative file path from baseDir (tsconfig root), using forward slashes */
  filePath: string;
  format: "tsx";
  /** What this documentation explains (from the Doc explains prop) */
  explains: string;
  /** Importance level - essential docs are included in generated skill/instructions files */
  priority: DocPriority;
  content: string;
  references: {
    modules: string[];
    terms: string[];
    folders: string[];
    exports: string[];
    files: string[];
    externals: string[];
  };
  /** Extracted semantic relations: {from, to, label?} */
  relations?: { from: string; to: string; label?: string }[];
  /** Extracted flows: { name, desc, priority, steps[] } */
  flows?: {
    name: string;
    desc: string;
    priority: DocPriority;
    steps: { nodeId: string; label?: string }[];
  }[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Entry point: iterates program source files, extracts docs from each
 * .tskb.tsx file matched by the glob, returns ExtractedDoc[].
 */
export function extractDocs(
  program: ts.Program,
  filePaths: Set<string>,
  registry?: ExtractedRegistry
): ExtractedDoc[] {
  const normalizedPaths = new Set(
    Array.from(filePaths).map((p) => p.replace(/\\/g, "/").toLowerCase())
  );

  const docs: ExtractedDoc[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    const normalized = sourceFile.fileName.replace(/\\/g, "/").toLowerCase();
    if (normalizedPaths.has(normalized) && sourceFile.fileName.endsWith(".tsx")) {
      const doc = extractFromTsxFile(sourceFile, registry);
      if (doc) docs.push(doc);
    }
  }
  return docs;
}

/**
 * Processes a single .tskb.tsx source file: builds the constant ref map,
 * finds the default export, runs JsxExtractor, returns an ExtractedDoc or
 * null if no default export is found.
 */
export function extractFromTsxFile(
  sourceFile: ts.SourceFile,
  registry?: ExtractedRegistry
): ExtractedDoc | null {
  const constantRefs = buildRefMap(sourceFile);
  const defaultExport = findDefaultExport(sourceFile);
  if (!defaultExport) return null;

  const { html, refs, docMeta, relations, flows } = new JsxExtractor(
    constantRefs,
    registry
  ).extract(defaultExport);

  const relativePath = path.relative(process.cwd(), sourceFile.fileName).replace(/\\/g, "/");
  return {
    filePath: relativePath,
    format: "tsx",
    explains: docMeta.explains,
    priority: docMeta.priority,
    content: html,
    references: {
      modules: [...new Set(refs.modules)],
      terms: [...new Set(refs.terms)],
      folders: [...new Set(refs.folders)],
      exports: [...new Set(refs.exports)],
      files: [...new Set(refs.files)],
      externals: [...new Set(refs.externals)],
    },
    relations,
    flows,
  };
}

/**
 * Static class grouping the public documentation extraction API.
 */
export class Documentation {
  static extractDocs = extractDocs;
  static extractFromTsxFile = extractFromTsxFile;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { buildRefMap, buildRefLink, resolveNodeMeta } from "./doc-utils.js";
export { JsxExtractor } from "./jsx-extractor.js";
