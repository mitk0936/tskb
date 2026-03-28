/**
 * JSX type definitions for tskb
 *
 * This allows TypeScript to type-check ANY JSX, including:
 * - tskb's own components (Doc, H1, P, etc.)
 * - React components imported from anywhere
 * - Any other JSX-compatible components
 *
 * No React dependency required - these are just type definitions.
 *
 * IMPORTANT: The JSX interop layer uses `any` intentionally. When @types/react is loaded
 * (e.g., docs that import React for Snippet examples), React's JSX types take partial
 * precedence. tskb's ReactNode is structurally different from React.ReactNode, so JSX.Element
 * must stay loose to avoid conflicts. The actual component functions in jsx.ts are properly
 * typed with tskb's ReactNode — the `any` here only affects JSX expression evaluation.
 */

import type { ReactNode } from "./runtime/jsx.js";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }

    // Must be `any` for React type interop — see note above
    type Element = any;

    interface ElementClass {
      render(): any;
    }

    interface ElementAttributesProperty {
      props: {};
    }

    interface ElementChildrenAttribute {
      children: {};
    }
  }

  // Override React namespace if it exists — must be `any` to coexist with @types/react
  namespace React {
    type ReactNode = any;
    type ReactElement = any;
    type FC<P = {}> = (props: P) => any;
    type FunctionComponent<P = {}> = (props: P) => any;
  }
}

export {};
