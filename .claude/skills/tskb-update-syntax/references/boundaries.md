# Boundary prop reference

`boundary` marks a folder as the root of a distinct runtime or deployment unit — a process, app, or package that runs or deploys on its own. Add it only to the **top-level folder** that IS that boundary; never repeat it on sub-folders inside.

Prefer one of these values. Add a new value only if your runtime genuinely doesn't fit:

| Value | When to use |
|-------|-------------|
| `"[NAME] repository"` | A distinct git repo |
| `"[NAME] package"` | An npm package root with its own `package.json`, published or consumed as a library |
| `"[NAME] SPA"` | A browser single-page application (Vite, CRA, Next.js client bundle) |
| `"[NAME] client"` | Frontend app in a project that also has a server. Pair with `"server"`. |
| `"[NAME] server"` | Node.js (or similar) backend process. Pair with `"client"` when both exist. |
| `"[NAME] CLI"` | A command-line binary published or invoked as its own process |
| `"[NAME] worker"` | Background or queue worker — long-running process, distinct from request handlers |
| `"[NAME] function"` | Serverless function / Lambda / Cloud Function — each deployable unit is its own boundary |
| `"[NAME] mobile app"` | iOS or Android app target |
| `"[NAME] extension"` | Browser or IDE extension package with its own runtime host |
| `"[NAME] daemon"` | OS-level daemon or background service |
| `"[TYPE] tests"` | Test suite root — the test runner is a distinct process from production code |

**Don't** add boundary to architectural layers (core, cli, utils, shared types), sub-folders already inside a bounded area, or organizational groupings with no independent runtime. If in doubt, leave it off.
