// JSX runtime for react-jsx transform
import type { ReactNode } from "./runtime/jsx.js";

export * from "./runtime/jsx.js";

export function jsx(
  type: ((props: Record<string, unknown>) => any) | string,
  props: Record<string, unknown>
): any {
  if (typeof type === "function") {
    return type(props);
  }
  return { type, props };
}

export const jsxs = jsx;
export const Fragment = ({ children }: { children: ReactNode }): any => children;

/**
 * Global JSX namespace for tskb consumers.
 *
 * Declared here (rather than in a separate .d.ts) so `tsc` carries the
 * ambient declarations into `dist/jsx-runtime.d.ts`. When a consumer sets
 * `jsxImportSource: "tskb"`, TypeScript loads this module and picks up the
 * namespace — which is what makes raw HTML tags (<code>, <strong>, etc.)
 * type-check inside .tskb.tsx files.
 *
 * IntrinsicElements is intentionally loose (`[name]: any`): tskb doesn't
 * model the DOM, it just preserves whatever HTML the author writes for the
 * extracted output. Element is `any` so React types can coexist when a
 * doc imports React for a Snippet example.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }

    type Element = any;

    interface ElementClass {
      render(): any;
    }

    interface ElementAttributesProperty {
      props: object;
    }

    interface ElementChildrenAttribute {
      children: object;
    }
  }

  namespace React {
    type ReactNode = any;
    type ReactElement = any;
    type FC<P = object> = (props: P) => any;
    type FunctionComponent<P = object> = (props: P) => any;
  }
}
