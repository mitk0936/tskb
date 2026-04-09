var X = Object.defineProperty;
var j = (s, t, n) =>
  t in s ? X(s, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (s[t] = n);
var E = (s, t, n) => j(s, typeof t != "symbol" ? t + "" : t, n);
import { h as G, t as Q, s as Y, z as R } from "./vendor-kPgBzchc.js";
(function () {
  const t = document.createElement("link").relList;
  if (t && t.supports && t.supports("modulepreload")) return;
  for (const r of document.querySelectorAll('link[rel="modulepreload"]')) e(r);
  new MutationObserver((r) => {
    for (const o of r)
      if (o.type === "childList")
        for (const a of o.addedNodes) a.tagName === "LINK" && a.rel === "modulepreload" && e(a);
  }).observe(document, { childList: !0, subtree: !0 });
  function n(r) {
    const o = {};
    return (
      r.integrity && (o.integrity = r.integrity),
      r.referrerPolicy && (o.referrerPolicy = r.referrerPolicy),
      r.crossOrigin === "use-credentials"
        ? (o.credentials = "include")
        : r.crossOrigin === "anonymous"
          ? (o.credentials = "omit")
          : (o.credentials = "same-origin"),
      o
    );
  }
  function e(r) {
    if (r.ep) return;
    r.ep = !0;
    const o = n(r);
    fetch(r.href, o);
  }
})();
function N(s, ...t) {
  return s === "folder" ? `./chunks/folder-${V(t[0])}.json` : `./chunks/${s}.json`;
}
function V(s) {
  return s.replace(/[^a-z0-9.\-]/gi, "_");
}
class U {
  constructor(t) {
    E(this, "map", new Map());
    this.maxSize = t;
  }
  get(t) {
    const n = this.map.get(t);
    return (n !== void 0 && (this.map.delete(t), this.map.set(t, n)), n);
  }
  set(t, n) {
    if ((this.map.delete(t), this.map.set(t, n), this.map.size > this.maxSize)) {
      const e = this.map.keys().next().value;
      this.map.delete(e);
    }
  }
  has(t) {
    return this.map.has(t);
  }
}
class W {
  constructor() {
    E(this, "cache", new U(50));
    E(this, "inflight", new Map());
  }
  async load(t, ...n) {
    const e = t === "folder" ? N("folder", n[0]) : N(t),
      r = this.cache.get(e);
    if (r) return r;
    const o = this.inflight.get(e);
    if (o) return o;
    const a = fetch(e)
      .then((i) => {
        if (!i.ok) throw new Error(`Chunk fetch failed: ${e} (${i.status})`);
        return i.json();
      })
      .then((i) => (this.cache.set(e, i), this.inflight.delete(e), i))
      .catch((i) => {
        throw (this.inflight.delete(e), i);
      });
    return (this.inflight.set(e, a), a);
  }
  cancel(t, ...n) {
    const e = t === "folder" ? N("folder", n[0]) : N(t);
    this.inflight.delete(e);
  }
}
class q {
  constructor() {
    E(this, "meta", null);
    E(this, "folderChunks", new Map());
    E(this, "listeners", new Set());
  }
  setMeta(t) {
    ((this.meta = t), this.notify());
  }
  addFolderChunk(t) {
    (this.folderChunks.set(t.folderId, t), this.notify());
  }
  getVisibleStructureNodes(t) {
    if (!this.meta) return [];
    const n = [this.meta.root];
    return (this.collectFolderNodes(this.meta.topFolders, t, n), n);
  }
  collectFolderNodes(t, n, e) {
    var r;
    for (const o of t) {
      if ((e.push(o), !n.has(o.id))) continue;
      const a = this.folderChunks.get(o.id);
      if (a) {
        (r = a.subfolders) != null && r.length && this.collectFolderNodes(a.subfolders, n, e);
        for (const i of a.modules)
          (e.push(i), n.has(i.id) && e.push(...a.exports.filter((l) => l.parentId === i.id)));
      }
    }
  }
  getVisibleLinks(t) {
    const n = [];
    for (const [e, r] of this.folderChunks) t.has(e) && n.push(...r.internalEdges);
    return n;
  }
  subscribe(t) {
    return (this.listeners.add(t), () => this.listeners.delete(t));
  }
  notify() {
    this.listeners.forEach((t) => t());
  }
}
const x = {
    folder: { w: 190, h: 76 },
    module: { w: 165, h: 68 },
    export: { w: 145, h: 56 },
    doc: { w: 165, h: 68 },
    flow: { w: 165, h: 68 },
    term: { w: 145, h: 56 },
    external: { w: 145, h: 56 },
    file: { w: 130, h: 52 },
  },
  w = 40,
  I = 64,
  A = 28,
  z = 60,
  K = 18;
function Z(s, t) {
  return s.meta ? { ...s.meta.root, treeChildren: M(s.meta.topFolders, s, t) } : null;
}
function M(s, t, n) {
  return s.map((e) => {
    var a;
    if (!n.has(e.id)) return { ...e };
    const r = t.folderChunks.get(e.id);
    if (!r) return { ...e };
    const o = [];
    (a = r.subfolders) != null && a.length && o.push(...M(r.subfolders, t, n));
    for (const i of r.modules)
      n.has(i.id)
        ? o.push({
            ...i,
            treeChildren: r.exports.filter((l) => l.parentId === i.id).map((l) => ({ ...l })),
          })
        : o.push({ ...i });
    return { ...e, treeChildren: o };
  });
}
function J(s, t) {
  var C;
  const n = [];
  let e = A + w * 2 + x.folder.h;
  const r = Z(s, t);
  if (r) {
    const m = Math.max(...Object.values(x).map((d) => d.h)),
      f = Math.max(...Object.values(x).map((d) => d.w)) + z,
      h = G(r, (d) => d.treeChildren);
    Q().nodeSize([m + K, f])(h);
    let c = 1 / 0;
    (h.each((d) => {
      d.x < c && (c = d.x);
    }),
      h.each((d) => {
        n.push({ ...d.data, x: w + d.y, y: A + w + d.x - c });
      }),
      (e = Math.max(...n.map((d) => d.y + x[d.type].h)) + w));
  }
  const o = e + I,
    a = [];
  if ((C = s.meta) != null && C.docs.length) {
    const m = { essential: 0, constraint: 1, supplementary: 2 };
    [...s.meta.docs]
      .sort(
        (h, y) => (m[h.priority ?? "supplementary"] ?? 2) - (m[y.priority ?? "supplementary"] ?? 2)
      )
      .forEach((h, y) => {
        const { w: c } = x.doc;
        a.push({ ...h, x: w + y * (c + z), y: o + A + w });
      });
  }
  const i = a.length ? A + w * 2 + x.doc.h : 0,
    l = o + i + (i > 0 ? I : 0),
    u = [];
  s.meta &&
    [...s.meta.flows, ...s.meta.terms, ...s.meta.externals].forEach((f, h) => {
      const { w: y } = x[f.type] ?? x.term;
      u.push({ ...f, x: w + h * (y + z), y: l + A + w });
    });
  const b = u.length ? A + w * 2 + x.term.h : 0;
  return {
    structureNodes: n,
    docsNodes: a,
    otherNodes: u,
    docsLaneY: o,
    otherLaneY: l,
    totalHeight: l + b + I,
  };
}
const B = {
    folder: "#3b82f6",
    module: "#eab308",
    export: "#22c55e",
    doc: "#a855f7",
    flow: "#06b6d4",
    term: "#f97316",
    external: "#14b8a6",
    file: "#64748b",
  },
  F = {
    folder: "▤",
    module: "◻",
    export: "⚡",
    doc: "☰",
    flow: "→",
    term: "◆",
    external: "⬡",
    file: "⊞",
  };
class tt {
  constructor(t, n, e, r) {
    ((this.onExpand = t), (this.onSelect = n), (this.onTraceLinks = e), (this.hasChildren = r));
  }
  getSize(t) {
    return x[t.type] ?? x.module;
  }
  rightAnchor(t) {
    const { w: n, h: e } = this.getSize(t);
    return { x: t.x + n, y: t.y + e / 2 };
  }
  leftAnchor(t) {
    const { h: n } = this.getSize(t);
    return { x: t.x, y: t.y + n / 2 };
  }
  enter(t) {
    const n = this;
    (t
      .append("rect")
      .attr("class", "node-bg")
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "#1a1f2e")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (r, o) => n.onSelect(o)),
      t.append("rect").attr("class", "node-accent").attr("x", 0).attr("rx", 3).attr("width", 4),
      t
        .append("text")
        .attr("class", "node-icon")
        .attr("font-size", 12)
        .attr("dominant-baseline", "middle")
        .attr("fill", "#94a3b8"),
      t
        .append("text")
        .attr("class", "node-label")
        .attr("font-size", 11)
        .attr("font-weight", "700")
        .attr("fill", "#e2e8f0")
        .attr("dominant-baseline", "middle"),
      t
        .append("text")
        .attr("class", "node-desc")
        .attr("font-size", 9)
        .attr("fill", "#64748b")
        .attr("dominant-baseline", "middle"),
      t
        .append("line")
        .attr("class", "node-divider")
        .attr("stroke", "#1e293b")
        .attr("stroke-width", 1),
      t
        .append("text")
        .attr("class", "node-badge")
        .attr("font-size", 9)
        .attr("fill", "#475569")
        .attr("dominant-baseline", "middle")
        .style("cursor", "pointer")
        .on("click", (r, o) => {
          (r.stopPropagation(), n.onTraceLinks(o));
        }));
    const e = t
      .append("g")
      .attr("class", "node-expand-btn")
      .style("cursor", "pointer")
      .on("click", (r, o) => {
        (r.stopPropagation(), n.onExpand(o));
      });
    (e
      .append("rect")
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("fill", "#1e293b")
      .attr("width", 20)
      .attr("height", 14),
      e
        .append("text")
        .attr("font-size", 9)
        .attr("fill", "#3b82f6")
        .attr("dominant-baseline", "middle")
        .attr("text-anchor", "middle"),
      this.update(t));
  }
  update(t) {
    const n = this;
    (t.each(function (e) {
      const r = Y(this),
        { w: o, h: a } = n.getSize(e),
        i = B[e.type],
        l = n.hasChildren(e),
        u = 4,
        b = u + 7,
        C = b + 15,
        m = a - 16;
      (r.select(".node-bg").attr("width", o).attr("height", a).attr("stroke", i),
        r.select(".node-accent").attr("height", a).attr("fill", i),
        r
          .select(".node-icon")
          .attr("x", b)
          .attr("y", a * 0.3)
          .text(F[e.type]),
        r
          .select(".node-label")
          .attr("x", C)
          .attr("y", a * 0.28)
          .text(_(e.label, 19)),
        r
          .select(".node-desc")
          .attr("x", C)
          .attr("y", a * 0.55)
          .text(_(e.description, 24)),
        r
          .select(".node-divider")
          .attr("x1", u + 6)
          .attr("x2", o - 6)
          .attr("y1", m - 5)
          .attr("y2", m - 5),
        r
          .select(".node-badge")
          .attr("x", u + 7)
          .attr("y", m + 4)
          .text(`○ ${e.edgeCount}`));
      const f = r.select(".node-expand-btn");
      if ((f.style("display", l ? "block" : "none"), l)) {
        const h = o - 26,
          y = m - 5;
        (f.attr("transform", `translate(${h},${y})`),
          f.select("text").attr("x", 10).attr("y", 7).text("▶"));
      }
    }),
      t.attr("transform", (e) => `translate(${e.x},${e.y})`));
  }
}
function _(s, t) {
  return s ? (s.length > t ? s.slice(0, t - 1) + "…" : s) : "";
}
function et(s, t, n, e) {
  return new tt(s, t, n, e);
}
function nt(s) {
  const t = new Map(s.map((e) => [e.id, e])),
    n = [];
  for (const e of s) {
    if (!e.parentId) continue;
    const r = t.get(e.parentId);
    if (!r) continue;
    const o = x[r.type],
      a = x[e.type];
    n.push({
      sourceX: r.x + o.w,
      sourceY: r.y + o.h / 2,
      targetX: e.x,
      targetY: e.y + a.h / 2,
      targetType: e.type,
    });
  }
  return n;
}
function rt(s, t) {
  const n = s
    .selectAll("path.struct-link")
    .data(t, (e) => `${e.sourceX},${e.sourceY}:${e.targetX},${e.targetY}`);
  (n
    .enter()
    .append("path")
    .attr("class", "struct-link")
    .attr("fill", "none")
    .attr("stroke", (e) => B[e.targetType] + "66")
    .attr("stroke-width", 1.5)
    .merge(n)
    .attr("d", (e) => ot(e.sourceX, e.sourceY, e.targetX, e.targetY)),
    n.exit().remove());
}
function st(s, t, n) {
  const e = n,
    r = 28,
    o = [{ label: "Structure", y: 0, h: t.docsLaneY, color: "#0f172a" }];
  (t.docsNodes.length &&
    o.push({ label: "Docs", y: t.docsLaneY, h: t.otherLaneY - t.docsLaneY, color: "#0c1220" }),
    t.otherNodes.length &&
      o.push({
        label: "Terms / Flows",
        y: t.otherLaneY,
        h: t.totalHeight - t.otherLaneY,
        color: "#0f172a",
      }));
  const a = s.selectAll("rect.lane-band").data(o);
  (a
    .enter()
    .append("rect")
    .attr("class", "lane-band")
    .merge(a)
    .attr("x", 0)
    .attr("y", (l) => l.y)
    .attr("width", e)
    .attr("height", (l) => l.h)
    .attr("fill", (l) => l.color)
    .attr("stroke", "#1e293b")
    .attr("stroke-width", 1),
    a.exit().remove());
  const i = s.selectAll("text.lane-label").data(o);
  (i
    .enter()
    .append("text")
    .attr("class", "lane-label")
    .attr("font-size", 10)
    .attr("font-weight", "600")
    .attr("fill", "#334155")
    .attr("letter-spacing", "0.06em")
    .merge(i)
    .attr("x", 14)
    .attr("y", (l) => l.y + r / 2 + 4)
    .text((l) => l.label.toUpperCase()),
    i.exit().remove());
}
function ot(s, t, n, e) {
  const r = (s + n) / 2;
  return `M${s},${t} C${r},${t} ${r},${e} ${n},${e}`;
}
function at() {
  var s;
  (s = document.getElementById("global-spinner")) == null || s.classList.remove("hidden");
}
function it() {
  var s;
  (s = document.getElementById("global-spinner")) == null || s.classList.add("hidden");
}
function ct(s, t, n, e = 20) {
  const r = "http://www.w3.org/2000/svg",
    o = document.createElementNS(r, "g");
  (o.setAttribute("class", "node-spinner"), o.setAttribute("transform", `translate(${t},${n})`));
  const a = document.createElementNS(r, "circle");
  (a.setAttribute("cx", "0"),
    a.setAttribute("cy", "0"),
    a.setAttribute("r", String(e / 2)),
    a.setAttribute("fill", "none"),
    a.setAttribute("stroke", "#1e293b"),
    a.setAttribute("stroke-width", "2"));
  const i = document.createElementNS(r, "circle");
  (i.setAttribute("cx", "0"),
    i.setAttribute("cy", "0"),
    i.setAttribute("r", String(e / 2)),
    i.setAttribute("fill", "none"),
    i.setAttribute("stroke", "#3b82f6"),
    i.setAttribute("stroke-width", "2"),
    i.setAttribute("stroke-dasharray", `${e * 0.8} ${e * 2}`),
    i.setAttribute("stroke-linecap", "round"));
  const l = document.createElementNS(r, "animateTransform");
  return (
    l.setAttribute("attributeName", "transform"),
    l.setAttribute("type", "rotate"),
    l.setAttribute("from", "0 0 0"),
    l.setAttribute("to", "360 0 0"),
    l.setAttribute("dur", "0.8s"),
    l.setAttribute("repeatCount", "indefinite"),
    i.appendChild(l),
    o.appendChild(a),
    o.appendChild(i),
    s.appendChild(o),
    o
  );
}
function lt(s) {
  s.remove();
}
function dt(s) {
  const t = document.getElementById("detail-panel"),
    n = document.getElementById("dp-type-badge"),
    e = document.getElementById("dp-title"),
    r = document.getElementById("dp-body");
  document.getElementById("dp-close").addEventListener("click", () => {
    (i(), s());
  });
  function a(u) {
    const b = B[u.type];
    ((n.textContent = `${F[u.type]} ${u.type}`),
      (n.style.cssText = `background:${b}22; color:${b}; border:1px solid ${b}55`),
      (e.textContent = u.label),
      (r.innerHTML = ""),
      l("ID", `<code>${u.id}</code>`),
      u.description && l("Description", u.description),
      u.path && l("Path", `<code>${u.path}</code>`),
      u.priority && l("Priority", u.priority),
      u.edgeCount > 0 && l("Connections", String(u.edgeCount)));
    const C = new Set(["_hasChildren"]);
    for (const [m, f] of Object.entries(u.detail)) {
      if (C.has(m)) continue;
      const h = Array.isArray(f) ? f.join(", ") : f;
      h && l(m, h);
    }
    (r.insertAdjacentHTML(
      "beforeend",
      `<div class="sketch-note">
        ✦ Edges, morphology, and related nodes — coming in a future iteration.
      </div>`
    ),
      t.classList.add("open"));
  }
  function i() {
    t.classList.remove("open");
  }
  function l(u, b) {
    r.insertAdjacentHTML(
      "beforeend",
      `<div class="field">
        <div class="field-label">${u}</div>
        <div class="field-value">${b}</div>
      </div>`
    );
  }
  return { show: a, hide: i };
}
const O = new W(),
  L = new q(),
  p = { expanded: new Set(), selected: null, searchQuery: "" };
async function ut() {
  const s = document.getElementById("canvas"),
    t = Y(s),
    n = t.append("g").attr("class", "zoom-layer"),
    e = n.append("g").attr("class", "lane-bg-layer"),
    r = n.append("g").attr("class", "edge-layer"),
    o = n.append("g").attr("class", "node-layer"),
    a = R()
      .scaleExtent([0.05, 5])
      .on("zoom", (c) => {
        n.attr("transform", c.transform);
      });
  (t.call(a).on("dblclick.zoom", null), t.call(a.translateBy, 20, 20));
  const i = dt(() => {
      p.selected = null;
    }),
    l = (c) => c.detail._hasChildren === "true",
    u = async (c) => {
      if (c.type === "folder")
        if (p.expanded.has(c.id)) (p.expanded.delete(c.id), b(c.id), y());
        else {
          if (!L.folderChunks.has(c.id)) {
            const g = ct(o.node(), c.x + 190, c.y + 38);
            try {
              const d = await O.load("folder", c.id);
              L.addFolderChunk(d);
            } catch (d) {
              console.error("Failed to load chunk for", c.id, d);
            } finally {
              lt(g);
            }
          }
          (p.expanded.add(c.id), y());
        }
      else
        c.type === "module" &&
          (p.expanded.has(c.id) ? p.expanded.delete(c.id) : p.expanded.add(c.id), y());
    };
  function b(c) {
    const g = L.folderChunks.get(c);
    if (g) {
      for (const d of g.subfolders ?? []) (p.expanded.delete(d.id), b(d.id));
      for (const d of g.modules) p.expanded.delete(d.id);
    }
  }
  const f = et(
      u,
      (c) => {
        ((p.selected = c), i.show(c));
      },
      (c) => {
        console.info("[tskb explorer] trace links for:", c.id, `(${c.edgeCount} edges)`);
      },
      l
    ),
    h = document.getElementById("search-input");
  (h.addEventListener("input", () => {
    ((p.searchQuery = h.value.toLowerCase().trim()), y());
  }),
    L.subscribe(() => y()));
  function y() {
    if (!L.meta) return;
    const c = J(L, p.expanded),
      g = [...c.structureNodes, ...c.docsNodes, ...c.otherNodes],
      d = L.meta.metadata;
    document.getElementById("stats").textContent =
      `${d.stats.folderCount ?? 0} folders · ${d.stats.moduleCount ?? 0} modules · ${d.stats.exportCount ?? 0} exports`;
    const H = Math.max(4e3, Math.max(...g.map((k) => k.x + 250), 0));
    st(e, c, H);
    const P = nt(c.structureNodes);
    rt(r, P);
    const D = p.searchQuery
        ? g.filter(
            (k) =>
              k.id.toLowerCase().includes(p.searchQuery) ||
              k.label.toLowerCase().includes(p.searchQuery) ||
              k.description.toLowerCase().includes(p.searchQuery)
          )
        : g,
      S = o.selectAll("g.node").data(g, (k) => k.id),
      T = S.enter().append("g").attr("class", "node");
    f.enter(T);
    const $ = T.merge(S);
    if (p.searchQuery) {
      const k = new Set(D.map((v) => v.id));
      $.style("opacity", (v) => (k.has(v.id) ? "1" : "0.15"));
    } else $.style("opacity", "1");
    (f.update($), S.exit().remove());
  }
  at();
  try {
    const c = await O.load("meta");
    L.setMeta(c);
  } catch (c) {
    console.error("Failed to load meta chunk:", c);
    const g = document.getElementById("global-spinner");
    g &&
      (g.innerHTML = `
        <div style="color:#ef4444;font-size:13px;text-align:center;padding:20px">
          Failed to load graph.<br/>
          <code style="font-size:11px;color:#64748b">./chunks/meta.json</code>
        </div>`);
    return;
  }
  it();
}
ut();
