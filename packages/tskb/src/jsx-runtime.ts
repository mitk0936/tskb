// JSX runtime for react-jsx transform
export * from "./runtime/jsx.js";

export function jsx(type: any, props: any) {
  if (typeof type === "function") {
    return type(props);
  }
  return { type, props };
}

export const jsxs = jsx;
export const Fragment = ({ children }: { children: any }) => children;
