import { Doc, P, List, Li, ref } from "tskb";

const JsxRuntimeModule = ref as tskb.Modules["Jsx.runtime.js"];
const FolderExport = ref as tskb.Exports["Folder"];
const ModuleExport = ref as tskb.Exports["Module"];
const ExportExport = ref as tskb.Exports["Export"];
const TermExport = ref as tskb.Exports["Term"];
const FileExport = ref as tskb.Exports["File"];
const RefExport = ref as tskb.Exports["ref"];

export default (
  <Doc explains="What primitives does tskb provide for writing documentation?" priority="essential">
    <P>
      The library exports a small set of registry primitives for declaring structural elements, plus
      JSX components from {JsxRuntimeModule} for writing the prose around them.
    </P>
    <List>
      <Li>{FolderExport} — logical groupings in the codebase (features, layers, packages).</Li>
      <Li>{ModuleExport} — concrete code units (source files).</Li>
      <Li>
        {ExportExport} — type-safe reference to a named export. Uses <code>typeof import()</code> so
        the compiler validates the symbol exists.
      </Li>
      <Li>{TermExport} — domain concepts and patterns not tied to a specific file.</Li>
      <Li>{FileExport} — non-JS/TS files (README.md, yml configs, etc.) referenced by path.</Li>
      <Li>
        {RefExport} — placeholder for referencing any registered node from JSX via a type assertion.
      </Li>
    </List>
    <P>
      JSX components from {JsxRuntimeModule} (Doc, H1, H2, H3, P, List, Li, Snippet, Flow, Step,
      Relation, Adr) provide the structured-content syntax around those references.
    </P>
  </Doc>
);
