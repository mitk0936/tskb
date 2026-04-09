/**
 * Spinner utilities.
 * Global spinner is managed via CSS class on the #global-spinner element.
 * Per-node spinners are SVG <g> elements temporarily added to the canvas.
 */

export function showGlobalSpinner(): void {
  document.getElementById("global-spinner")?.classList.remove("hidden");
}

export function hideGlobalSpinner(): void {
  document.getElementById("global-spinner")?.classList.add("hidden");
}

/** Show a small animated ring at a given SVG position */
export function showNodeSpinner(
  container: SVGGElement,
  x: number,
  y: number,
  size = 20
): SVGGElement {
  const ns = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(ns, "g");
  g.setAttribute("class", "node-spinner");
  g.setAttribute("transform", `translate(${x},${y})`);

  const track = document.createElementNS(ns, "circle");
  track.setAttribute("cx", "0");
  track.setAttribute("cy", "0");
  track.setAttribute("r", String(size / 2));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "#1e293b");
  track.setAttribute("stroke-width", "2");

  const arc = document.createElementNS(ns, "circle");
  arc.setAttribute("cx", "0");
  arc.setAttribute("cy", "0");
  arc.setAttribute("r", String(size / 2));
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", "#3b82f6");
  arc.setAttribute("stroke-width", "2");
  arc.setAttribute("stroke-dasharray", `${size * 0.8} ${size * 2}`);
  arc.setAttribute("stroke-linecap", "round");

  const anim = document.createElementNS(ns, "animateTransform");
  anim.setAttribute("attributeName", "transform");
  anim.setAttribute("type", "rotate");
  anim.setAttribute("from", "0 0 0");
  anim.setAttribute("to", "360 0 0");
  anim.setAttribute("dur", "0.8s");
  anim.setAttribute("repeatCount", "indefinite");

  arc.appendChild(anim);
  g.appendChild(track);
  g.appendChild(arc);
  container.appendChild(g);

  return g;
}

export function removeNodeSpinner(spinner: SVGGElement): void {
  spinner.remove();
}
