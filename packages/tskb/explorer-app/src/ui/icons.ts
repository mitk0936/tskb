// ─── Icon helpers ─────────────────────────────────────────────────────────────
// Thin d3 wrapper around Lucide icon node arrays.
// Each Lucide icon is `[tagName, attrs][]` for a 24×24 viewBox.

import * as d3 from "d3";
import { Eye, Minus, ArrowDownLeft, ArrowUpRight } from "lucide";

type IconNode = [string, Record<string, string>][];

export const EyeIcon: IconNode = Eye as unknown as IconNode;
export const MinusIcon: IconNode = Minus as unknown as IconNode;
export const ArrowDownLeftIcon: IconNode = ArrowDownLeft as unknown as IconNode;
export const ArrowUpRightIcon: IconNode = ArrowUpRight as unknown as IconNode;

/**
 * Append a Lucide icon into a d3 SVG <g> selection.
 * The icon is scaled to `size` px and centered on (0, 0).
 *
 * @param g     - target <g> element
 * @param icon  - Lucide icon node array
 * @param size  - rendered size in px (default 12)
 * @param color - stroke color (default "currentColor")
 */
export function appendIcon(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  icon: IconNode,
  size = 12,
  color = "currentColor"
): d3.Selection<SVGGElement, unknown, null, undefined> {
  const s = size / 24;
  const offset = -size / 2;

  const ig = g
    .append("g")
    .attr("class", "lucide-icon")
    .attr("transform", `translate(${offset},${offset}) scale(${s})`)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", "2")
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("pointer-events", "none");

  for (const [tag, attrs] of icon) {
    const el = ig.append(tag as "path");
    for (const [key, val] of Object.entries(attrs)) {
      el.attr(key, val);
    }
  }

  return ig;
}

/**
 * Replace the icon inside a <g> that already has a .lucide-icon child.
 * Removes the old icon group and appends the new one.
 */
export function replaceIcon(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  icon: IconNode,
  size = 12,
  color = "currentColor"
): void {
  g.select(".lucide-icon").remove();
  appendIcon(g, icon, size, color);
}
