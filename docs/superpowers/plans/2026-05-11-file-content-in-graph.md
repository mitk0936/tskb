# File Content in Graph + Explorer Syntax Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read whitelisted non-binary file content (JSON, YAML, SQL, Dockerfile, XML, Bash, GraphQL) into the knowledge graph, include it in explorer chunks, and display it in the existing `<>` code tooltip with syntax highlighting powered by lazy-loaded `highlight.js`.

**Architecture:** File content is read at graph-build time in `builder.ts` (1000-line cap, whitelisted extensions only), stored in `FileNode.content` + `FileNode.fileType`, forwarded through the transform layer into `ExplorerNode.detail.code` + `detail.fileType`, and rendered in the existing `CodeTooltip` which replaces its hand-rolled JS tokenizer with an async-loaded `highlight.js` core + per-language imports. The highlight.js bundle is split into a separate Vite chunk (starts loading at SPA boot, ready well before a user clicks `<>`).

**Tech Stack:** TypeScript (Node), highlight.js 11, Vite manual chunks, existing CodeTooltip.ts popup.

---

## File Map

| File                                                      | Change                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/tskb/package.json`                              | add `highlight.js` dep                                                                                                 |
| `packages/tskb/src/core/graph/types.ts`                   | add `content?` + `fileType?` to `FileNode`                                                                             |
| `packages/tskb/src/core/graph/builder.ts`                 | add `detectFileType` + `readFileContent` helpers; update `buildFileNodes` to call them                                 |
| `packages/tskb/src/core/explorer/transform.ts`            | add `detail.code` + `detail.fileType` in `buildFileNodeForChunk`                                                       |
| `packages/tskb/explorer-app/src/components/nodes/base.ts` | extend `hasCode` guard to include `"file"` type                                                                        |
| `packages/tskb/explorer-app/src/ui/CodeTooltip.ts`        | replace hand-rolled highlighter with lazy hljs; add `language?` param to `toggleCodeTooltip`; inject hljs CSS on mount |
| `packages/tskb/explorer-app/src/main.ts`                  | pass `node.detail.fileType` as `language` to `toggleCodeTooltip`                                                       |
| `packages/tskb/explorer-app/vite.config.ts`               | add `highlight: ["highlight.js"]` to `manualChunks`                                                                    |

---

## Task 1: Install highlight.js

**Files:**

- Modify: `packages/tskb/package.json`

- [ ] **Step 1: Install the package**

```bash
cd packages/tskb && npm install highlight.js
```

Expected: `highlight.js` appears in `package.json` `dependencies` and `package-lock.json` is updated.

- [ ] **Step 2: Verify installation**

```bash
node -e "import('highlight.js/lib/core').then(m => console.log('OK', typeof m.default))"
```

Expected output: `OK function`

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/package.json package-lock.json
git commit -m "feat: add highlight.js dependency for file content syntax highlighting"
```

---

## Task 2: Extend FileNode type

**Files:**

- Modify: `packages/tskb/src/core/graph/types.ts:111-118`

Current `FileNode` (lines 111–118):

```typescript
export interface FileNode extends GraphNode {
  type: "file";
  desc: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  path?: string;
}
```

- [ ] **Step 1: Add `content` and `fileType` fields**

Replace the `FileNode` interface with:

```typescript
export interface FileNode extends GraphNode {
  type: "file";
  desc: string;
  /**
   * Resolved path relative to tsconfig directory (portable across machines)
   */
  path?: string;
  /** Raw file content, capped at 1000 lines. Only populated for whitelisted text extensions. */
  content?: string;
  /** highlight.js language identifier derived from the file extension (e.g. "json", "yaml"). */
  fileType?: string;
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
cd packages/tskb && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/src/core/graph/types.ts
git commit -m "feat: add content and fileType fields to FileNode"
```

---

## Task 3: Read file content in graph builder

**Files:**

- Modify: `packages/tskb/src/core/graph/builder.ts:234-244`

`buildGraph` already receives `baseDir: string` (line 54). `data.resolvedPath` is relative to `baseDir`. `fs` and `path` are already imported at lines 15–16.

- [ ] **Step 1: Add file-type detection map and helper (add above `buildFileNodes`)**

Insert the following just above `function buildFileNodes` (around line 234):

```typescript
const FILE_TYPE_MAP: Record<string, string> = {
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sql": "sql",
  ".xml": "xml",
  ".sh": "bash",
  ".bash": "bash",
  ".graphql": "graphql",
  ".gql": "graphql",
};

const MAX_FILE_LINES = 1000;

function detectFileType(filePath: string): string | undefined {
  const base = path.basename(filePath).toLowerCase();
  if (base === "dockerfile" || base.endsWith(".dockerfile")) return "dockerfile";
  const ext = path.extname(filePath).toLowerCase();
  return FILE_TYPE_MAP[ext];
}

function readFileContent(
  resolvedPath: string,
  baseDir: string
): { content: string; fileType: string } | undefined {
  const fileType = detectFileType(resolvedPath);
  if (!fileType) return undefined;
  const absPath = path.isAbsolute(resolvedPath)
    ? resolvedPath
    : path.resolve(baseDir, resolvedPath);
  try {
    const raw = fs.readFileSync(absPath, "utf-8");
    const lines = raw.split("\n");
    const content =
      lines.length > MAX_FILE_LINES
        ? lines.slice(0, MAX_FILE_LINES).join("\n") +
          `\n// … (${lines.length - MAX_FILE_LINES} more lines)`
        : raw;
    return { content, fileType };
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Update `buildFileNodes` to accept `baseDir` and read content**

Replace the current `buildFileNodes` function (lines 234–244, now shifted down by the inserted code) with:

```typescript
function buildFileNodes(registry: ExtractedRegistry, graph: KnowledgeGraph, baseDir: string): void {
  for (const [name, data] of registry.files.entries()) {
    const resolvedPath = data.resolvedPath ?? data.path;
    const fileContent = resolvedPath ? readFileContent(resolvedPath, baseDir) : undefined;
    const node: FileNode = {
      id: name,
      type: "file",
      desc: data.desc,
      path: resolvedPath,
      ...(fileContent ?? {}),
    };
    graph.nodes.files[name] = node;
  }
}
```

- [ ] **Step 3: Update the call-site inside `buildGraph` to pass `baseDir`**

Find the line `buildFileNodes(registry, graph);` (around line 94) and change it to:

```typescript
buildFileNodes(registry, graph, baseDir);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd packages/tskb && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke-test with a real build**

```bash
cd packages/tskb && npm run build:docs
```

Expected: completes without error. Open `.tskb/graph.json` and search for a known file node (e.g. `package.json`). It should now have a `content` field if that file is whitelisted.

- [ ] **Step 6: Commit**

```bash
git add packages/tskb/src/core/graph/builder.ts
git commit -m "feat: read file content into graph for whitelisted text extensions (1000-line cap)"
```

---

## Task 4: Forward content through transform chunks

**Files:**

- Modify: `packages/tskb/src/core/explorer/transform.ts:787-794`

Current `buildFileNodeForChunk` (lines 787–794):

```typescript
private buildFileNodeForChunk(fileId: string, parentFolderId: string): ExplorerNode {
  const file = this.graph.nodes.files[fileId]!;
  return toExplorerNode(file.id, "file", file.desc, {
    path: file.path,
    parentId: parentFolderId,
    edgeCount: file.edgeCount ?? 0,
  });
}
```

- [ ] **Step 1: Add `detail` with code lines and file type**

Replace `buildFileNodeForChunk` with:

```typescript
private buildFileNodeForChunk(fileId: string, parentFolderId: string): ExplorerNode {
  const file = this.graph.nodes.files[fileId]!;
  return toExplorerNode(file.id, "file", file.desc, {
    path: file.path,
    parentId: parentFolderId,
    edgeCount: file.edgeCount ?? 0,
    detail: file.content
      ? { code: file.content.split("\n"), fileType: file.fileType ?? "" }
      : {},
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/tskb && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/src/core/explorer/transform.ts
git commit -m "feat: include file content and language type in explorer chunk detail"
```

---

## Task 5: Show `<>` button on file nodes

**Files:**

- Modify: `packages/tskb/explorer-app/src/components/nodes/base.ts:330-333`

Current guard (lines 330–333):

```typescript
const hasCode =
  (d.type === "module" || d.type === "export") &&
  Array.isArray(d.detail.code) &&
  (d.detail.code as string[]).length > 0;
```

- [ ] **Step 1: Extend guard to include `"file"` type**

Replace those lines with:

```typescript
const hasCode =
  (d.type === "module" || d.type === "export" || d.type === "file") &&
  Array.isArray(d.detail.code) &&
  (d.detail.code as string[]).length > 0;
```

- [ ] **Step 2: Verify TypeScript compiles (SPA)**

```bash
cd packages/tskb && npx tsc -p explorer-app/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/explorer-app/src/components/nodes/base.ts
git commit -m "feat: show code preview button on file nodes with content"
```

---

## Task 6: Replace hand-rolled highlighter with lazy highlight.js

**Files:**

- Modify: `packages/tskb/explorer-app/src/ui/CodeTooltip.ts`

This is the main effort. You are:

1. Deleting the hand-rolled `KW`, `C`, `sp`, `escHtml`, `highlight` block (lines 183–342).
2. Adding a module-level `hljsReady` promise that starts loading at SPA boot.
3. Adding `escHtml` back (still needed for the header path display).
4. Making `toggleCodeTooltip` async, adding a `language?` parameter, and using hljs for highlighting.
5. Injecting hljs GitHub-light CSS once in `mountCodeTooltip`.

- [ ] **Step 1: Add the hljs loader, escHtml, and CSS constant — replace lines 183–342**

Delete everything from `// ─── Syntax highlighter (inline TS tokenizer) ───` to end of file and replace with:

```typescript
// ─── Syntax highlighter (highlight.js, lazy-loaded) ──────────────────────────

// Starts fetching the highlight chunk at SPA boot (parallel to other init).
// By the time a user clicks <>, this promise is resolved.
const hljsReady = (async () => {
  const [
    { default: hljs },
    { default: json },
    { default: yaml },
    { default: sql },
    { default: dockerfile },
    { default: xml },
    { default: bash },
    { default: graphql },
    { default: javascript },
  ] = await Promise.all([
    import("highlight.js/lib/core"),
    import("highlight.js/lib/languages/json"),
    import("highlight.js/lib/languages/yaml"),
    import("highlight.js/lib/languages/sql"),
    import("highlight.js/lib/languages/dockerfile"),
    import("highlight.js/lib/languages/xml"),
    import("highlight.js/lib/languages/bash"),
    import("highlight.js/lib/languages/graphql"),
    import("highlight.js/lib/languages/javascript"),
  ]);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("dockerfile", dockerfile);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("graphql", graphql);
  hljs.registerLanguage("javascript", javascript);
  return hljs;
})();

// GitHub-light token colours injected once on mount.
const HLJS_CSS = `
.hljs-comment,.hljs-quote{color:#6a737d;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-subst{color:#d73a49}
.hljs-number,.hljs-literal{color:#005cc5}
.hljs-string,.hljs-regexp,.hljs-addition,.hljs-meta-string{color:#032f62}
.hljs-doctag{color:#d73a49}
.hljs-title,.hljs-section{color:#6f42c1}
.hljs-built_in,.hljs-tag,.hljs-name{color:#22863a}
.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-type,.hljs-number{color:#005cc5}
.hljs-symbol,.hljs-bullet,.hljs-link{color:#0366d6}
.hljs-deletion{color:#b31d28;background:#ffeef0}
.hljs-emphasis{font-style:italic}
.hljs-strong{font-weight:bold}
`;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 2: Update `mountCodeTooltip` to inject the CSS style tag**

Inside `mountCodeTooltip`, after `document.body.appendChild(el);` add:

```typescript
const style = document.createElement("style");
style.textContent = HLJS_CSS;
document.head.appendChild(style);
```

- [ ] **Step 3: Add `language?` parameter to `toggleCodeTooltip` and make it async**

Replace the `toggleCodeTooltip` signature and body. The new signature is:

```typescript
export async function toggleCodeTooltip(
  nodeId: string,
  codeLines: string[],
  path: string,
  svgX: number,
  svgY: number,
  importLines?: string[],
  language?: string
): Promise<void> {
```

Inside the function, replace the `highlight(codeContent)` call at line 112 with:

```typescript
let codeContent = "";
if (importLines?.length) {
  codeContent += importLines.map((l) => `import ${l}`).join("\n") + "\n\n";
}
codeContent += codeLines.join("\n");

const hljs = await hljsReady;
const lang = language ?? "javascript";
const highlighted = hljs.highlight(codeContent, { language: lang, ignoreIllegals: true }).value;
```

And change the `<code>` line from:

```typescript
`<code>${highlight(codeContent)}</code></pre>`;
```

to:

```typescript
`<code>${highlighted}</code></pre>`;
```

The rest of `toggleCodeTooltip` (header HTML, header buttons, positioning, outside-click handler) stays unchanged.

- [ ] **Step 4: Verify TypeScript compiles (SPA)**

```bash
cd packages/tskb && npx tsc -p explorer-app/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/explorer-app/src/ui/CodeTooltip.ts
git commit -m "feat: replace hand-rolled JS tokenizer with lazy-loaded highlight.js (json/yaml/sql/dockerfile/xml/bash/graphql)"
```

---

## Task 7: Wire `language` through main.ts

**Files:**

- Modify: `packages/tskb/explorer-app/src/main.ts:154-161`

Current callback (lines 154–161):

```typescript
      (node) => {
        const code = node.detail.code as string[];
        const importLines = Array.isArray(node.detail.importLines)
          ? (node.detail.importLines as string[])
          : undefined;
        const { w } = NODE_SIZES[node.type] ?? NODE_SIZES.module;
        toggleCodeTooltip(node.id, code, node.path ?? node.id, node.x + w / 2, node.y, importLines);
      },
```

- [ ] **Step 1: Pass `fileType` as the `language` argument**

Replace those lines with:

```typescript
      (node) => {
        const code = node.detail.code as string[];
        const importLines = Array.isArray(node.detail.importLines)
          ? (node.detail.importLines as string[])
          : undefined;
        const language = node.detail.fileType as string | undefined;
        const { w } = NODE_SIZES[node.type] ?? NODE_SIZES.module;
        void toggleCodeTooltip(node.id, code, node.path ?? node.id, node.x + w / 2, node.y, importLines, language);
      },
```

(`void` discards the returned `Promise<void>` intentionally — fire-and-forget is correct for UI event callbacks.)

- [ ] **Step 2: Verify TypeScript compiles (SPA)**

```bash
cd packages/tskb && npx tsc -p explorer-app/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/explorer-app/src/main.ts
git commit -m "feat: pass file language type to code tooltip"
```

---

## Task 8: Configure Vite chunk for highlight.js

**Files:**

- Modify: `packages/tskb/explorer-app/vite.config.ts:46-49`

Current `manualChunks` (lines 46–49):

```typescript
      manualChunks: {
        vendor: ["d3"],
      },
```

- [ ] **Step 1: Add the highlight chunk**

Replace with:

```typescript
      manualChunks: {
        vendor: ["d3"],
        highlight: ["highlight.js"],
      },
```

- [ ] **Step 2: Build the SPA and verify the chunk appears**

```bash
cd packages/tskb && npm run build:explorer
```

Expected: `dist/explorer/assets/highlight-*.js` appears in the output alongside `vendor-*.js`.

- [ ] **Step 3: Smoke test with `tskb explore`**

```bash
npm run build:docs
npx --no -- tskb explore
```

Open the explorer in a browser. Find a file node that has a known JSON/YAML/SQL/Dockerfile (e.g. `package.json` or any `.yaml` registered as a `File`). Click its `<>` button. Verify:

- The tooltip opens with syntax-highlighted content.
- Colors match the GitHub light theme (strings blue, keywords red, comments grey).
- Large files show the `// … (N more lines)` truncation marker.
- Module nodes still show highlighted JS/TS code (language defaults to `"javascript"`).

- [ ] **Step 4: Full build**

```bash
cd packages/tskb && npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/explorer-app/vite.config.ts
git commit -m "feat: split highlight.js into separate Vite chunk"
```

---

## Self-Review Checklist

**Spec coverage:**

- [x] JSON, YAML, SQL, Dockerfile supported — Tasks 3 + 6
- [x] XML, Bash, GraphQL bonus languages — Task 6
- [x] 1000-line limit with truncation marker — Task 3
- [x] Binary files excluded (whitelisted extensions only) — Task 3
- [x] highlight.js lazy/chunked — Tasks 6 + 8
- [x] Existing module/export `<>` tooltip still works (language defaults to `"javascript"`) — Tasks 6 + 7
- [x] No `.env` files included (not in whitelist) — Task 3

**Type consistency:**

- `FileNode.content: string | undefined` — defined Task 2, read Task 3, used Task 4 ✓
- `FileNode.fileType: string | undefined` — defined Task 2, written Task 3, used Task 4 ✓
- `detail.code: string[]` — written Task 4, read Task 5 + 7 ✓
- `detail.fileType: string` — written Task 4, read Task 7 ✓
- `toggleCodeTooltip` new signature — defined Task 6, called Task 7 ✓
