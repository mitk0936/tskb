import { type Folder, type Module, type Export, Doc, H1, ref, P, H2, List, Li } from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      "runtime.jsx": Module<{
        desc: "JSX runtime primitives - Doc, H1-H3, P, List, Li, Snippet components and ref helper";
        type: typeof import("packages/tskb/src/runtime/jsx.js");
      }>;

      "runtime.registry": Module<{
        desc: "Registry type definitions - Folder, Module, Export, Term interfaces for global namespace augmentation";
        type: typeof import("packages/tskb/src/runtime/registry.js");
      }>;
    }

    interface Exports {
      "jsx.Doc": Export<{
        desc: "Documentation container component. Requires an 'explains' prop that describes what the doc covers - used as the doc's description in search results and referencing doc lists";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Doc;
      }>;
      "jsx.H1": Export<{
        desc: "Heading level 1";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H1;
      }>;
      "jsx.H2": Export<{
        desc: "Heading level 2";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H2;
      }>;
      "jsx.H3": Export<{
        desc: "Heading level 3";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H3;
      }>;
      "jsx.P": Export<{
        desc: "Paragraph";
        type: typeof import("packages/tskb/src/runtime/jsx.js").P;
      }>;
      "jsx.List": Export<{
        desc: "List container";
        type: typeof import("packages/tskb/src/runtime/jsx.js").List;
      }>;
      "jsx.Li": Export<{
        desc: "List item";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Li;
      }>;
      "jsx.Snippet": Export<{
        desc: "Code snippet component";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Snippet;
      }>;
      "jsx.ref": Export<{
        desc: "Reference placeholder for type assertions to registry items";
        type: typeof import("packages/tskb/src/runtime/jsx.js").ref;
      }>;
    }
  }
}

const RuntimeFolder = ref as tskb.Folders["tskb.runtime"];
const JsxModule = ref as tskb.Modules["runtime.jsx"];
const RegistryModule = ref as tskb.Modules["runtime.registry"];
const DocExport = ref as tskb.Exports["jsx.Doc"];
const RefExport = ref as tskb.Exports["jsx.ref"];

export default (
  <Doc explains="Runtime module structure: JSX primitives and registry type definitions">
    <H1>Runtime</H1>
    <P>
      Located in {RuntimeFolder}. Contains registry type definitions and JSX primitives - no actual
      runtime execution.
    </P>

    <H2>Modules</H2>
    <List>
      <Li>
        {JsxModule}: JSX runtime with {DocExport} (requires explains prop - a short description of
        what the doc covers, used for search and identification) and heading/paragraph/list
        components. Includes {RefExport} for type-safe registry references.
      </Li>
      <Li>
        {RegistryModule}: Type definitions for Folder, Module, Export, Term interfaces used in
        global namespace augmentation.
      </Li>
    </List>

    <H2>Purpose</H2>
    <P>
      Provides TypeScript types and JSX functions for authoring *.tskb.tsx files. Registry
      interfaces enable type-safe vocabulary declarations. JSX components structure documentation
      content.
    </P>
  </Doc>
);
