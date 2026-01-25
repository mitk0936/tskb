declare global {
  namespace tskb {
    interface Folders {}
    interface Modules {}
    interface Terms {}
    interface Exports {}
  }
}

/**
 * Base Abstraction's shapes (definitions)
 */
//
interface InternalFolderDefinition {
  desc: string;
  path: string;
}

interface InternalModuleDefinition {
  desc: string;
  type: unknown;
}

type InternalTermDefinition = string;

interface InternalExportDefinition {
  desc: string;
  type: unknown;
}

/**
 * Normalized views:
 * - If a consumer provides a value that doesn't satisfy the base shape,
 *   it will show as `never`/error when used through these types.
 */
type NormalizeFolders<T> = {
  [K in keyof T]: T[K] extends InternalFolderDefinition ? T[K] : never;
};

type NormalizeModules<T> = {
  [K in keyof T]: T[K] extends InternalModuleDefinition ? T[K] : never;
};

type NormalizeTerms<T> = {
  [K in keyof T]: T[K] extends InternalTermDefinition ? T[K] : never;
};

type NormalizeExports<T> = {
  [K in keyof T]: T[K] extends InternalExportDefinition ? T[K] : never;
};

export type FolderRegistry = NormalizeFolders<tskb.Folders>;
export type ModuleRegistry = NormalizeModules<tskb.Modules>;
export type TermRegistry = NormalizeTerms<tskb.Terms>;
export type ExportRegistry = NormalizeExports<tskb.Exports>;

/** Keys used for autocomplete. */
export type FolderName = keyof tskb.Folders;
export type ModuleName = keyof tskb.Modules;
export type TermName = keyof tskb.Terms;
export type ExportName = keyof tskb.Exports;

/** Generic helpers for nicer authoring ergonomics. */
export type Folder<Ext extends InternalFolderDefinition> = Ext;
export type Module<Ext extends InternalModuleDefinition> = Ext;
export type Term<Ext extends InternalTermDefinition> = Ext;
export type Export<Ext extends InternalExportDefinition> = Ext;
