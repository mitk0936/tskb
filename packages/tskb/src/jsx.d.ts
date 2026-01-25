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
 * This overrides React's JSX types to work with tskb's ReactNode.
 */

import type { ReactNode } from "./runtime/jsx.js";

declare global {
  namespace JSX {
    // Accept any valid HTML element names and any custom components
    interface IntrinsicElements {
      [elemName: string]: any;
    }

    // What JSX expressions evaluate to
    type Element = any;

    // Allow any component to be used
    interface ElementClass {
      render(): any;
    }

    // Props that all elements can accept
    interface ElementAttributesProperty {
      props: {};
    }

    // Children property name
    interface ElementChildrenAttribute {
      children: {};
    }
  }

  // Override React namespace if it exists
  namespace React {
    type ReactNode = any;
    type ReactElement = any;
    type FC<P = {}> = (props: P) => any;
    type FunctionComponent<P = {}> = (props: P) => any;
  }
}

export {};
