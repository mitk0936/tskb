import { type Module, type Export, type Term } from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      "extraction.documentation": Module<{
        desc: "Documentation extraction module that parses JSX trees to extract content and references from .tskb.tsx files";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js");
      }>;
    }

    interface Exports {
      extractDocs: Export<{
        desc: "Main function that extracts documentation content and references from TSX files by traversing JSX AST";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js").extractDocs;
      }>;

      ExtractedDoc: Export<{
        desc: "Type definition for extracted documentation containing file path, content, and all references to vocabulary items";
        type: import("packages/tskb/src/core/extraction/documentation.js").ExtractedDoc;
      }>;
    }

    interface Terms {
      jsxElement: Term<"A JSX syntax node in the TypeScript AST representing an element like <Doc> or <P>, containing opening tag, children, and closing tag">;
      jsxExpression: Term<"A TypeScript AST node representing an embedded expression in JSX curly braces like {ref as tskb.Folders['Auth']}">;
      typeAssertion: Term<"TypeScript 'as' syntax that casts a value to a specific type, used in tskb to reference vocabulary items: {ref as tskb.Modules['X']}">;
      depthFirstTraversal: Term<"Tree traversal algorithm that explores as far as possible along each branch before backtracking, used to visit all JSX nodes in order">;
    }
  }
}
