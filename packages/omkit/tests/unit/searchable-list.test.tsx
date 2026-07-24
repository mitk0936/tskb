import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { SearchableList } from "../../src/cli/ui/views/SearchableList.tsx";

const items = Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}` }));

const renderList = (onSelect: (x: { id: string }) => void = () => {}) =>
  render(
    <SearchableList
      items={items}
      getKey={(x) => x.id}
      getSearchText={(x) => x.id}
      onSelect={onSelect}
      renderRow={(x, sel) => (
        <Text>
          {sel ? "> " : "  "}
          {x.id}
        </Text>
      )}
    />
  );

const DOWN = "[B";

describe("SearchableList", () => {
  test("windows to 15 rows and shows a '+N more' footer", () => {
    const { lastFrame } = renderList();
    expect(lastFrame()).toContain("item-0");
    expect(lastFrame()).toContain("item-14");
    expect(lastFrame()).not.toContain("item-15");
    expect(lastFrame()).toContain("+5 more");
  });

  test("typing filters the list and reveals the search line", async () => {
    const { lastFrame, stdin } = renderList();
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("item-1"); // item-1, item-10 … item-19 → 11 rows, all fit
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain("search:");
    expect(lastFrame()).toContain("item-19");
    expect(lastFrame()).not.toContain("item-2");
    expect(lastFrame()).not.toContain("more"); // no footer once everything fits
  });

  test("Enter selects the highlighted filtered item", async () => {
    const onSelect = vi.fn();
    const { stdin } = renderList(onSelect);
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("item-7");
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(onSelect).toHaveBeenCalledWith({ id: "item-7" });
  });

  test("arrow-down scrolls the viewport past the first screen", async () => {
    const { lastFrame, stdin } = renderList();
    await new Promise((r) => setTimeout(r, 20));
    for (let i = 0; i < 16; i++) stdin.write(DOWN);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain("item-16"); // now within the viewport
    expect(lastFrame()).toContain("↑ 2 more"); // scrolled-down indicator
    expect(lastFrame()).not.toContain("item-0");
  });
});
