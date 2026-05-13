# Search Active-Filter Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small ✕ inside the search field with a closable pill chip in the toolbar that shows the active query; the input clears when search is applied and the chip dismisses the filter.

**Architecture:** Two files change — `index.html` gets the chip element and CSS, `main.ts` gets updated JS logic. The chip is a `<div id="search-chip">` injected into the toolbar flex row. On search submit the query text moves to the chip and the input is cleared. Dismissing the chip calls the existing `clearSearch()`.

**Tech Stack:** Vanilla HTML/CSS, TypeScript (no framework, no new deps)

---

## File Map

| File                                     | Change                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/tskb/explorer-app/index.html`  | Remove `#search-clear` button; add `#search-chip` div; add chip CSS; add responsive media query |
| `packages/tskb/explorer-app/src/main.ts` | Add `searchChip` field; update `setupSearch()`; update `clearSearch()`; add `showSearchChip()`  |

---

### Task 1: HTML — add chip element, update CSS, remove clear button

**Files:**

- Modify: `packages/tskb/explorer-app/index.html`

No unit tests apply — this is static markup and CSS. Verify visually in the browser after Task 3.

- [ ] **Step 1: Remove `#search-clear` and add `#search-chip`**

In `index.html`, replace the toolbar search section (lines 187–193):

```html
<div id="search-bar">
  <span id="search-icon">⌕</span>
  <input id="search-input" type="text" placeholder="Search nodes…" />
  <button id="search-btn" title="Search (Enter)">Search</button>
</div>
<div id="search-chip" hidden></div>
<span id="stats"></span>
```

(The `<button id="search-clear" …>` line is deleted; `#search-chip` is inserted after `#search-bar`.)

- [ ] **Step 2: Remove `#search-clear` CSS and add chip CSS**

Delete the `#search-clear` and `#search-clear:hover` rule blocks (lines 110–125 of the original file).

Add after the `#search-btn:active` block:

```css
#search-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 3px 8px 3px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}
#search-chip[hidden] {
  display: none;
}
.chip-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #1d4ed8;
  font-size: 11px;
  line-height: 1;
  padding: 2px 3px;
  border-radius: 999px;
  transition:
    background 0.12s,
    color 0.12s;
}
.chip-close:hover {
  background: #fee2e2;
  color: #ef4444;
}

@media (max-width: 640px) {
  #stats {
    display: none;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/explorer-app/index.html
git commit -m "feat: add search-chip element and CSS to toolbar"
```

---

### Task 2: JS — update `clearSearch()`, add `showSearchChip()`, wire `setupSearch()`

**Files:**

- Modify: `packages/tskb/explorer-app/src/main.ts`

No unit tests apply — DOM manipulation; verified manually after this task.

- [ ] **Step 1: Add `searchChip` class field**

In the class field block (around line 56, after `private searchWorker`), add:

```ts
  private searchChip: HTMLDivElement | null = null;
```

- [ ] **Step 2: Replace `setupSearch()` method**

Replace the entire `private setupSearch(): void { … }` block (lines 177–223) with:

```ts
  private setupSearch(): void {
    const searchInput = document.getElementById("search-input") as HTMLInputElement;
    const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
    this.searchChip = document.getElementById("search-chip") as HTMLDivElement;

    this.searchWorker = new Worker(
      new URL("./workers/search.worker.ts", import.meta.url),
      { type: "module" }
    );
    this.searchWorker.postMessage({
      type: "init",
      url: new URL("./chunks/search-index.json", document.baseURI).href,
    });
    this.searchWorker.addEventListener("message", (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "results") {
        const ids: string[] = msg.ids;
        this.matchIds = ids.length > 0 ? new Set<string>(ids) : null;
        if (ids.length > 0) {
          void this.expandToReveal(ids, ids[0], true);
        } else {
          this.render();
        }
      }
    });

    const triggerSearch = () => {
      const query = searchInput.value.trim();
      if (!query) {
        this.clearSearch(searchInput);
        return;
      }
      searchInput.value = "";
      this.showSearchChip(query, searchInput);
      this.searchWorker?.postMessage({ type: "search", query });
    };

    searchBtn.addEventListener("click", triggerSearch);
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") triggerSearch();
      if (e.key === "Escape") this.clearSearch(searchInput);
    });
  }
```

- [ ] **Step 3: Replace `clearSearch()` method**

Replace the entire `private clearSearch(…): void { … }` block (lines 225–230) with:

```ts
  private clearSearch(input: HTMLInputElement): void {
    input.value = "";
    this.matchIds = null;
    if (this.searchChip) {
      this.searchChip.hidden = true;
      this.searchChip.innerHTML = "";
    }
    this.render();
  }
```

- [ ] **Step 4: Add `showSearchChip()` method**

Insert immediately after `clearSearch()`:

```ts
  private showSearchChip(query: string, input: HTMLInputElement): void {
    if (!this.searchChip) return;
    this.searchChip.innerHTML = "";
    const label = document.createElement("span");
    label.textContent = query;
    const close = document.createElement("button");
    close.className = "chip-close";
    close.title = "Clear search";
    close.textContent = "✕";
    close.addEventListener("click", () => this.clearSearch(input));
    this.searchChip.appendChild(label);
    this.searchChip.appendChild(close);
    this.searchChip.hidden = false;
  }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd packages/tskb/explorer-app && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/tskb/explorer-app/src/main.ts
git commit -m "feat: move search query to toolbar chip on apply"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start the dev server**

From the repo root:

```bash
cd packages/tskb && npx vite packages/tskb/explorer-app
```

Open the URL printed in the terminal (typically `http://localhost:5173`).

- [ ] **Step 2: Verify happy path**

1. Type a query in the search box (e.g. `graph`) and press Enter.
2. The input should clear.
3. A blue pill chip labelled `graph` with a ✕ should appear in the toolbar, to the right of the search bar.
4. Matching nodes should be highlighted on the canvas.

- [ ] **Step 3: Verify chip dismiss**

Click the ✕ on the chip. Expected: chip disappears, canvas returns to normal (no dim/highlight).

- [ ] **Step 4: Verify Escape key**

Type a query, press Enter (chip appears), then focus the input and press Escape. Expected: chip disappears, filter cleared.

- [ ] **Step 5: Verify empty-query guard**

Clear the input manually (no chip yet), click Search with an empty field. Expected: nothing changes, no chip appears.

- [ ] **Step 6: Verify narrow viewport**

Resize the browser window to ≤ 640 px wide. Expected: the `#stats` count text disappears; the chip still shows correctly.
