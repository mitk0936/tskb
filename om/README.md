# Running this repo with omkit

This folder (`om/`) holds the repo's **operational model**: the dev and build workflows for tskb, written as TypeScript with [omkit](../packages/omkit/README.md). You don't need to know omkit to use them. Run one command and the whole dev stack starts.

- Want the **short version**? Run `npm install`, then `npm run dev`. See [Quick start](#quick-start).
- Want to know **how omkit works**? See the [omkit package README](../packages/omkit/README.md).

---

## Contents

- [What's in here](#whats-in-here)
- [Quick start](#quick-start)
- [The workflows](#the-workflows)
  - [`tskb:dev`: the dev stack](#tskbdev-the-dev-stack)
  - [`tskb:build`: rebuild the knowledge graph](#tskbbuild-rebuild-the-knowledge-graph)
  - [`page:drive`: poke the running explorer](#pagedrive-poke-the-running-explorer)
- [Ways to run a workflow](#ways-to-run-a-workflow)
- [Passing arguments](#passing-arguments)
- [Reading a run: the logs folder](#reading-a-run-the-logs-folder)
- [Letting an AI assistant drive it (MCP)](#letting-an-ai-assistant-drive-it-mcp)
- [Adding your own workflow](#adding-your-own-workflow)
- [Troubleshooting](#troubleshooting)

---

## What's in here

```
om/
├── oms/                    # runnable workflows ("oms"), one per file
│   ├── tskb-dev.ts         #   tskb:dev: watchers + explorer server + browser
│   └── tskb-build.ts       #   tskb:build: one-shot rebuild of the knowledge graph
├── actions/                # reusable steps the oms call
│   ├── build-docs.ts       #   runs the tskb CLI over ./docs
│   └── drive-page.ts       #   page:drive: run JS in a live Chrome tab over CDP
├── logs/                   # one folder per run (git-ignored)
├── tsconfig.omkit.json     # tells omkit which files to scan for oms and actions
└── package.json            # npm scripts: dev, build:tskb, ls, check
```

Some terms used below:

| Term           | Meaning                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **om**         | A runnable workflow, `om("name").run(async () => …)`. You run these.                             |
| **action**     | One step inside an om (start a process, wait for a URL, open a browser…). Reusable.              |
| **run**        | A single execution of an om. Each run gets its own folder under `om/logs/`.                      |
| **settling**   | An om that finishes on its own (a build).                                                        |
| **long-lived** | An om that keeps running after its setup is done (a dev server). It stops when you press Ctrl+C. |

---

## Quick start

Prerequisites: Node.js >= 20 and npm >= 10.

```bash
# from the repo root
npm install      # installs everything and builds both packages (tskb + omkit)
npm run dev      # starts the tskb dev stack (the tskb:dev om)
```

What you'll see:

1. A prompt, **`Run tests?`**. Answer `no` or `yes`. If you don't answer within 10 seconds, it picks `no`.
2. Three background processes start: the docs watcher, the tskb library watcher, and the explorer's Vite dev server.
3. omkit waits until the explorer **actually answers** at `http://localhost:9876/`. Seeing the process start is not enough.
4. A Chrome window opens on the explorer. omkit reads a value from the page to confirm it rendered.
5. You see `Platform running.` and `Press Ctrl+C to stop.`

Edit code and the watchers rebuild. Press **Ctrl+C** once to shut everything down together, including the processes and the browser.

> **Note:** the browser step launches your installed **Google Chrome**. Nothing is downloaded. If Chrome isn't installed, see [Troubleshooting](#troubleshooting).

---

## The workflows

### `tskb:dev`: the dev stack

**Long-lived.** Defined in [oms/tskb-dev.ts](./oms/tskb-dev.ts).

```
 (optional) npm test
        │
        ├── docs watcher      ── rebuilds the graph when docs or the tskb build change
        ├── tskb lib watcher  ── tsc --watch on packages/tskb
        └── explorer server   ── vite dev server on :9876
                 │
          healthcheck (waits until :9876 answers)
                 │
          Chrome (debug port :9222) ──▶ Explorer tab ──▶ read #stats to confirm it rendered
```

| Argument         | Type    | Default | What it does                                                                          |
| ---------------- | ------- | ------- | ------------------------------------------------------------------------------------- |
| `runTests`       | boolean | asks    | Run `npm test` before starting. Failing tests are logged, but the stack still starts. |
| `headless`       | boolean | `false` | Launch Chrome without a window.                                                       |
| `port`           | integer | `9876`  | Port the explorer dev server is expected on.                                          |
| `cdpPort`        | integer | `9222`  | Chrome remote-debugging port. Lets other runs attach to this browser later.           |
| `readyTimeoutMs` | integer | `60000` | How long to wait for the explorer before giving up.                                   |

If one of the background processes crashes, the whole run stops and is marked failed. You find out right away instead of being left with a half-working stack.

### `tskb:build`: rebuild the knowledge graph

**Settling.** Defined in [oms/tskb-build.ts](./oms/tskb-build.ts). It runs the tskb CLI over `docs/**/*.tskb.tsx` once, records the build config as a snapshot, and exits with a verdict.

| Argument      | Type    | Default           | What it does                      |
| ------------- | ------- | ----------------- | --------------------------------- |
| `verbose`     | boolean | `true`            | Turn on tskb's diagnostic output. |
| `projectName` | string  | `"TSKB Monorepo"` | Project name shown in the graph.  |

```bash
npm run build:tskb --workspace om
```

> The root `npm run build:docs` script builds the same graph by calling the tskb CLI directly, and also regenerates the skill files. Use `tskb:build` when you want a recorded run you can inspect afterwards.

### `page:drive`: poke the running explorer

An **action**, not an om. Defined in [actions/drive-page.ts](./actions/drive-page.ts). It connects to a Chrome that is already running (for example, the one `tskb:dev` opened) over the remote-debugging port, runs a JS expression in one of its tabs, returns the result, and saves a screenshot by default. It does **not** close the browser.

| Argument     | Type    | Default            | What it does                                                       |
| ------------ | ------- | ------------------ | ------------------------------------------------------------------ |
| `js`         | string  | (required)         | A JS **expression** to evaluate, e.g. `document.title`.            |
| `cdp`        | string  | `"localhost:9222"` | Chrome's debugging endpoint.                                       |
| `match`      | string  | first tab          | JS expression used to pick a tab, e.g. `location.port === "9876"`. |
| `url`        | string  | (none)             | Navigate the tab here first.                                       |
| `screenshot` | boolean | `true`             | Save a PNG and register it as a run artifact.                      |

Its main use is from an AI assistant over MCP (see [below](#letting-an-ai-assistant-drive-it-mcp)). While `tskb:dev` is up, the assistant can inspect the live explorer without restarting anything.

---

## Ways to run a workflow

All of these run the same oms and write to the same `om/logs/` folder.

| From          | Command                                                            | Notes                                                                                            |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Repo root     | `npm run dev`                                                      | Shortcut for `tskb:dev`.                                                                         |
| `om/` scripts | `npm run dev --workspace om` / `npm run build:tskb --workspace om` | The scripts defined in [package.json](./package.json).                                           |
| Picker        | `cd om && npx omkit`                                               | Interactive: browse, search, run, and watch live output. Prompts are answered inside the picker. |
| By name       | `npx omkit run tskb:build --tsconfig om/tsconfig.omkit.json`       | From the repo root. Runs directly in your terminal.                                              |
| List          | `npm run ls --workspace om`                                        | Shows every om and action omkit discovered.                                                      |
| Typecheck     | `npm run check --workspace om`                                     | `tsc --noEmit` over the om project.                                                              |
| Debugger      | `npm run omkit:debug --workspace om -- run tskb:dev`               | Opens the Node inspector on port 9191.                                                           |

Inside `om/`, `npx omkit …` finds `tsconfig.omkit.json` on its own. From anywhere else, pass `--tsconfig om/tsconfig.omkit.json`.

---

## Passing arguments

Arguments are passed as a single JSON object in the `OMKIT_ARGS` environment variable. Each field is resolved in this order:

1. the value you **supplied** in `OMKIT_ARGS`
2. the schema's **default**
3. an interactive **prompt** (only in a terminal or the picker)
4. otherwise the run **fails** and names every missing field

```bash
# bash / zsh
OMKIT_ARGS='{"runTests":false,"headless":true}' npm run dev
```

```powershell
# PowerShell
$env:OMKIT_ARGS='{"runTests":false,"headless":true}'; npm run dev; Remove-Item Env:OMKIT_ARGS
```

The resolved values are recorded in the run's `result.json` and at the top of `main.log`, so you can always see what a run was given.

---

## Reading a run: the logs folder

Every run writes a folder:

```
om/logs/<name>-<hash8>/<date>/<time>/
├── main.log           # the whole run's timeline, human-readable
├── <action>_<id>.log  # one log per action (each process, healthcheck, browser…)
├── result.json        # tree of every step with status, verdict, and resolved args
├── raw.jsonl          # every log entry, machine-readable
├── events.log  asserts.log  snapshots.log  artifacts.log
├── snapshots/         # JSON state captured during the run
└── <action>_<id>/     # files an action produced (e.g. page:drive screenshots)
```

`<hash8>` comes from the om's name plus the file that defines it, so "the latest `tskb:dev` run" always lives in the same folder.

When something breaks, start here:

1. **`result.json`**: which step failed?
2. **That step's `.log`**: what did it print right before it failed?
3. **`main.log`**: what order did things happen in?

---

## Letting an AI assistant drive it (MCP)

omkit can serve these workflows to an AI assistant over the [Model Context Protocol](https://modelcontextprotocol.io). The assistant can list oms, start them, poll them, and read their logs, instead of running shell commands and reading terminal output.

**Claude Code:** it's already set up. The repo's [`.mcp.json`](../.mcp.json) registers an `omkit` server, so opening the repo in Claude Code is enough (approve the server when asked). Claude also gets the generated [`omkit-runs` skill](../.claude/skills/omkit-runs/SKILL.md), a summary of what's runnable and how.

**Other MCP clients:** point them at

```bash
node packages/omkit/dist/cli/index.js mcp --tsconfig om/tsconfig.omkit.json
# or: npm run mcp
```

The tools the assistant gets:

| Tool         | Use                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `list_oms`   | What can run here, and with what arguments.                                                                     |
| `run_om`     | Run a **settling** om or action to completion and get the verdict (e.g. `tskb:build`, `page:drive`).            |
| `start_om`   | Start a **long-lived** om (`tskb:dev`) and get back a run id. `waitUntilUp: true` returns once the stack is up. |
| `get_run`    | Status of a run.                                                                                                |
| `tail_run`   | Read a run's log.                                                                                               |
| `cancel_run` | Stop a run. This tears down everything it started.                                                              |

A typical loop: `start_om("tskb:dev", { headless: true }, waitUntilUp)` → edit code → `run_om("page:drive", { js: "…" })` to check the live page → `cancel_run`.

To inspect the MCP server by hand: `npm run mcp:inspect` (opens the MCP Inspector UI on `localhost:6274`).

---

## Adding your own workflow

1. Create a file under `oms/` (or `actions/` for a reusable step):

   ```ts
   // om/oms/hello.ts
   import { om } from "omkit";
   import { command } from "omkit/actions";

   om("hello")
     .describe({ summary: "Say hello and run the tests." })
     .mcp() // optional: expose it to AI assistants
     .run(async () => {
       await command("npm test").tag("tests").result;
     });
   ```

2. Run it: `cd om && npx omkit run hello`, or pick it in `npx omkit`.
3. If you marked it `.mcp()`, regenerate the assistant's skill file with `npm run build:skill` from the repo root.

Resolve paths from the file's own location (`import.meta.dirname`), not `process.cwd()`. `omkit run` starts the om with its working directory set to the om file's folder. See the existing oms for the pattern.

For the full API (actions, typed capabilities, events, failure handling, the built-in actions), see the [omkit package README](../packages/omkit/README.md).

---

## Troubleshooting

| Symptom                               | Fix                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `omkit: command not found`            | Run `npm install` at the repo root. It builds `packages/omkit` and links the `omkit` binary.                                                                        |
| Healthcheck times out                 | Something is already on port 9876, or Vite is slow to start. Check `server:explorer:daemon`'s log in the run folder, or pass `{"port":…}` / `{"readyTimeoutMs":…}`. |
| Browser step fails                    | It launches the installed Google Chrome. Install Chrome, and check the `browser_<id>.log` in the run folder.                                                        |
| `page:drive` can't connect            | `tskb:dev` must be running. Its Chrome listens on `cdpPort` (default 9222).                                                                                         |
| Run fails with "unresolved" fields    | It was started without a terminal (e.g. in CI) and an argument had no value. Supply it in `OMKIT_ARGS`.                                                             |
| Processes still running after a crash | Run the om again and press Ctrl+C, or end the leftover `node` processes. omkit tears down on Ctrl+C and on unobserved failures.                                     |
