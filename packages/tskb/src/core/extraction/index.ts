/**
 * Extraction Module - Extracts registry and documentation from TypeScript source files
 *
 * Public API for extracting knowledge base information from .tskb files.
 */
import { extractRegistry } from "./registry.js";
import { extractDocs } from "./documentation.js";

export type { ExtractedRegistry } from "./registry.js";
export type { ExtractedDoc } from "./documentation.js";

export { extractRegistry, extractDocs };
