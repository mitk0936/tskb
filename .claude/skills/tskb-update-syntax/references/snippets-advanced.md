# Snippets — non-JS content and tsconfig tweaks

The snippet body must be valid JavaScript or TypeScript. When the content you want to show isn't JS — JSON, a shell command, a SQL query, a config blob — wrap it in a JS expression so the body stays valid and the imports keep getting type-checked.

## JSON output — use `JSON.stringify`

```tsx
import { buildConfig } from "../src/config.js";

<Snippet
  code={() => {
    const config = buildConfig({ env: "prod" });
    return JSON.stringify(config, null, 2);
  }}
/>
```

## Shell command — use `execSync`

The call is type-checked; the command isn't run at doc-build time.

```tsx
import { execSync } from "node:child_process";

<Snippet
  code={() => execSync("npx --no -- tskb search 'auth' --plain")}
/>
```

## SQL or other strings — tagged template or plain string

```tsx
<Snippet
  code={() => `
    SELECT id, email FROM users WHERE active = true;
  `}
/>
```

The point of the wrapper is the same: the body stays valid JS, and TypeScript still validates any imports or function calls inside it.

## tsconfig tweaks for snippets

To support the types your snippets need, extend the docs `tsconfig.json`:
- Add `lib` entries (`"DOM"`, `"ES2022"`) for browser or modern-runtime APIs.
- Add `paths` aliases if your project uses them.
- Add `types` for ambient declarations.

The docs `tsconfig.json` is independent from the project's build config — tailor it for documentation without affecting production builds.
