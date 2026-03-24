/**
 * tskb - TypeScript Semantic Knowledge Base
 *
 * Public API for building and visualizing knowledge graphs from TypeScript projects.
 */

// Runtime types for .tskb files
export type { Term, Module, Folder, Export, File, External } from "./runtime/registry.js";
export * from "./runtime/jsx.js";
export { ref } from "./runtime/jsx.js";
