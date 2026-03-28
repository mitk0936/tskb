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
