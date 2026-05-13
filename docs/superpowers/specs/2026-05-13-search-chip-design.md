# Search Active-Filter Chip

**Date:** 2026-05-13  
**Status:** Approved

## Summary

Replace the small ✕ inside the search field with a closable chip in the toolbar that shows the active search query. When a search is applied, the query text moves from the input to the chip, clearing the input. The chip is dismissed by clicking its ✕, which clears the filter.

## Behaviour

- User types a query and presses Enter or clicks Search.
- The query is dispatched to the search worker.
- On results: the input is cleared, the chip appears in the toolbar showing the query text and a ✕ button.
- The input is now empty and ready for a new query.
- Clicking the chip's ✕ clears `matchIds`, hides the chip, and re-renders (same as existing clear flow).
- On narrow viewports (≤ 640 px) the `#stats` span is hidden to make room for the chip.

## Files Changed

### `packages/tskb/explorer-app/index.html`

- Add `<div id="search-chip" hidden></div>` in `#toolbar`, immediately after `#search-bar`.
- Add CSS for `#search-chip`: pill shape (`border-radius: 999px`), blue tint (`background: #dbeafe`, `color: #1d4ed8`), flex row, aligned to toolbar height.
- Add CSS for `.chip-close` button: no border, transparent background, hover turns red.
- Add `@media (max-width: 640px) { #stats { display: none } }`.
- Remove the `#search-clear` button and its CSS (the chip replaces its role).

### `packages/tskb/explorer-app/src/main.ts`

- `setupSearch()`: remove `searchClear` wiring; add `searchChip` reference.
- Capture the query string before posting to the worker.
- On worker `results` message: call `showSearchChip(query)` before `expandToReveal`.
- New private `showSearchChip(query: string)`: sets chip content to a label span + ✕ button, wires ✕ to `clearSearch()`, sets `chip.hidden = false`.
- `clearSearch()`: extend to also set `chip.hidden = true` and clear `chip.innerHTML`; remove `clearBtn` parameter since there is no longer a separate clear button.

## Out of Scope

- Multiple simultaneous active filters (only one search is active at a time).
- Chip animations or transitions.
