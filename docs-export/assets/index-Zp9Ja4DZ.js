const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f || (m.f = ["assets/core-CnFGYgqa.js", "assets/highlight-nSGkUMep.js"])
) => i.map((i) => d[i]);
var Ut = Object.defineProperty;
var Vt = (r, t, e) =>
  t in r ? Ut(r, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : (r[t] = e);
var f = (r, t, e) => Vt(r, typeof t != "symbol" ? t + "" : t, e);
import {
  h as Kt,
  t as Jt,
  s as k,
  c as Rt,
  i as V,
  a as Zt,
  l as Qt,
  b as te,
  z as ee,
  q as ne,
  d as se,
} from "./vendor-qXcVXB0z.js";
(function () {
  const t = document.createElement("link").relList;
  if (t && t.supports && t.supports("modulepreload")) return;
  for (const n of document.querySelectorAll('link[rel="modulepreload"]')) s(n);
  new MutationObserver((n) => {
    for (const o of n)
      if (o.type === "childList")
        for (const a of o.addedNodes) a.tagName === "LINK" && a.rel === "modulepreload" && s(a);
  }).observe(document, { childList: !0, subtree: !0 });
  function e(n) {
    const o = {};
    return (
      n.integrity && (o.integrity = n.integrity),
      n.referrerPolicy && (o.referrerPolicy = n.referrerPolicy),
      n.crossOrigin === "use-credentials"
        ? (o.credentials = "include")
        : n.crossOrigin === "anonymous"
          ? (o.credentials = "omit")
          : (o.credentials = "same-origin"),
      o
    );
  }
  function s(n) {
    if (n.ep) return;
    n.ep = !0;
    const o = e(n);
    fetch(n.href, o);
  }
})();
function K(r, ...t) {
  return r === "folder" ? `./chunks/folder-${oe(t[0])}.json` : `./chunks/${r}.json`;
}
function oe(r) {
  return r.replace(/[^a-z0-9.\-]/gi, "_");
}
class re {
  constructor(t) {
    f(this, "map", new Map());
    this.maxSize = t;
  }
  get(t) {
    const e = this.map.get(t);
    return (e !== void 0 && (this.map.delete(t), this.map.set(t, e)), e);
  }
  set(t, e) {
    if ((this.map.delete(t), this.map.set(t, e), this.map.size > this.maxSize)) {
      const s = this.map.keys().next().value;
      this.map.delete(s);
    }
  }
  has(t) {
    return this.map.has(t);
  }
}
class ae {
  constructor() {
    f(this, "cache", new re(50));
    f(this, "inflight", new Map());
  }
  async load(t, ...e) {
    const s = t === "folder" ? K("folder", e[0]) : K(t),
      n = this.cache.get(s);
    if (n) return n;
    const o = this.inflight.get(s);
    if (o) return o;
    const a = fetch(s)
      .then((i) => {
        if (!i.ok) throw new Error(`Chunk fetch failed: ${s} (${i.status})`);
        return i.json();
      })
      .then((i) => (this.cache.set(s, i), this.inflight.delete(s), i))
      .catch((i) => {
        throw (this.inflight.delete(s), i);
      });
    return (this.inflight.set(s, a), a);
  }
  cancel(t, ...e) {
    const s = t === "folder" ? K("folder", e[0]) : K(t);
    this.inflight.delete(s);
  }
}
class ie {
  constructor() {
    f(this, "meta", null);
    f(this, "folderChunks", new Map());
    f(this, "listeners", new Set());
  }
  loadMeta(t) {
    ((this.meta = t), this.notifyListeners());
  }
  loadFolderChunk(t) {
    (this.folderChunks.set(t.folderId, t), this.notifyListeners());
  }
  loadFolderChunks(t) {
    for (const e of t) this.folderChunks.set(e.folderId, e);
    this.notifyListeners();
  }
  subscribe(t) {
    return (this.listeners.add(t), () => this.listeners.delete(t));
  }
  notifyListeners() {
    this.listeners.forEach((t) => t());
  }
}
const ct = (r) => r.detail._ghost === "true",
  dt = (r) => r.detail._hasChildren === "true",
  le = (r) => parseInt(r.detail._childCount ?? "0", 10),
  w = {
    folder: { w: 190, h: 52 },
    module: { w: 165, h: 48 },
    export: { w: 145, h: 40 },
    doc: { w: 165, h: 48 },
    flow: { w: 165, h: 48 },
    term: { w: 145, h: 40 },
    external: { w: 145, h: 40 },
    file: { w: 130, h: 38 },
  };
function B(r) {
  if (ct(r)) {
    const t = w[r.type] ?? w.module;
    return { w: Math.min(t.w, 130), h: 22 };
  }
  return w[r.type] ?? w.module;
}
const H = 40,
  yt = 64,
  J = 28,
  mt = 60,
  ce = 18;
function de(r, t) {
  if (!r.meta) return null;
  const e = Ht(r.meta.topFolders, r, t),
    s = (r.meta.topModules ?? []).map((o) =>
      !t(o) && dt(o) ? { ...o, treeChildren: at(o.id, 1, "export") } : { ...o }
    ),
    n = (r.meta.topFiles ?? []).map((o) => ({ ...o }));
  return { ...r.meta.root, treeChildren: [...e, ...s, ...n] };
}
function he(r, t) {
  return t.filter((e) => e.parentId === r && e.id !== r).map((e) => ({ ...e }));
}
function at(r, t, e = "module") {
  return Array.from({ length: Math.min(t, 4) }, (s, n) => ({
    id: `${r}:ghost:${n}`,
    type: e,
    label: "",
    description: "",
    edgeCount: 0,
    parentId: r,
    detail: { _ghost: "true" },
  }));
}
function Ht(r, t, e) {
  return r.map((s) => {
    var a;
    if (!e(s)) {
      const i = le(s);
      return i > 0 ? { ...s, treeChildren: at(s.id, i) } : { ...s };
    }
    const n = t.folderChunks.get(s.id);
    if (!n) return { ...s };
    const o = [];
    (a = n.subfolders) != null && a.length && o.push(...Ht(n.subfolders, t, e));
    for (const i of n.modules)
      if (e(i)) o.push({ ...i, treeChildren: he(i.id, n.exports) });
      else if (dt(i)) {
        const l = n.exports.filter((c) => c.parentId === i.id).length;
        o.push({ ...i, treeChildren: at(i.id, l, "export") });
      } else o.push({ ...i });
    for (const i of n.files ?? []) o.push({ ...i });
    return { ...s, treeChildren: o };
  });
}
function pe(r, t) {
  var h;
  const e = [];
  let s = J + H * 2 + w.folder.h;
  const n = de(r, t);
  if (n) {
    const d = Math.max(...Object.values(w).map((x) => x.h)),
      u = Math.max(...Object.values(w).map((x) => x.w)) + mt,
      p = Kt(n, (x) => x.treeChildren);
    Jt().nodeSize([d + ce, u])(p);
    let E = 1 / 0;
    (p.each((x) => {
      x.x < E && (E = x.x);
    }),
      p.each((x) => {
        x.depth !== 0 && e.push({ ...x.data, x: H + x.y - u, y: J + H + x.x - E });
      }),
      (s = Math.max(...e.map((x) => x.y + w[x.type].h)) + H));
  }
  const o = s + yt,
    a = [],
    i = o,
    l = [];
  (h = r.meta) != null &&
    h.externals.length &&
    r.meta.externals.forEach((d, u) => {
      const { w: p } = w.external;
      l.push({ ...d, x: H + u * (p + mt), y: i + J + H });
    });
  const c = l.length ? J + H * 2 + w.external.h : 0;
  return {
    structureNodes: e,
    docsNodes: a,
    otherNodes: l,
    docsLaneY: o,
    otherLaneY: i,
    totalHeight: i + c + yt,
  };
}
let m = null,
  it = 0,
  Mt = 0,
  Nt = 0,
  z = { k: 1, x: 0, y: 0 },
  O = null;
function ue(r) {
  ((O = r.getBoundingClientRect()),
    new ResizeObserver(() => {
      O = r.getBoundingClientRect();
    }).observe(r),
    (m = document.createElement("div")),
    (m.id = "node-tooltip"),
    Object.assign(m.style, {
      position: "fixed",
      display: "none",
      pointerEvents: "none",
      zIndex: "400",
      opacity: "0",
      transform: "translateY(6px)",
      transition: "opacity 0.12s ease, transform 0.12s ease",
    }),
    document.body.appendChild(m));
}
function fe(r, t, e, s, n, o, a) {
  m && ((Mt = n), (Nt = o), ge(r, t, e, s, a), (m.style.display = "block"), Ot(), xe());
}
function ye(r, t) {
  ((z = r), (O = t), m && m.style.display !== "none" && Ot());
}
function me() {
  m &&
    (cancelAnimationFrame(it),
    (m.style.opacity = "0"),
    (m.style.transform = "translateY(6px)"),
    setTimeout(() => {
      m && m.style.opacity === "0" && (m.style.display = "none");
    }, 120));
}
function ge(r, t, e, s, n) {
  if (!m) return;
  const o = n ? Object.entries(n).filter(([d, u]) => d !== "desc" && u !== null && u !== "") : [],
    a = o.length > 0,
    i = `<div style="display:flex;align-items:center;gap:5px;margin-bottom:${e || t || a ? "4px" : "0"}"><span style="width:6px;height:6px;border-radius:50%;background:${s};flex-shrink:0;display:inline-block;"></span><span style="font-size:16px;font-weight:700;color:#0f172a;white-space:nowrap;">${P(r)}</span></div>`,
    l = t
      ? `<div style="font-size:13px;color:#94a3b8;font-family:monospace;margin-bottom:${e || a ? "4px" : "0"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${P(t)}</div>`
      : "",
    c = e
      ? `<div style="font-size:12px;color:#64748b;line-height:1.5;max-width:220px;${a ? "margin-bottom:6px;" : ""}">${P(e)}</div>`
      : "",
    h = a
      ? '<div style="display:grid;grid-template-columns:auto 1fr;column-gap:8px;row-gap:2px;font-size:11px;line-height:1.4;max-width:220px;border-top:1px solid #e2e8f0;padding-top:6px;">' +
        o
          .map(
            ([d, u]) =>
              `<span style="color:#94a3b8;font-family:monospace;white-space:nowrap;">${P(d)}</span><span style="color:#475569;word-break:break-all;">${P(String(u))}</span>`
          )
          .join("") +
        "</div>"
      : "";
  m.innerHTML = `<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:16px;padding:9px 14px;box-shadow:0 2px 12px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${i}${l}${c}${h}</div>`;
}
function xe() {
  (cancelAnimationFrame(it),
    (it = requestAnimationFrame(() => {
      m && ((m.style.opacity = "1"), (m.style.transform = "translateY(0)"));
    })));
}
function Ot() {
  if (!m || !O) return;
  const r = Mt * z.k + z.x + O.left,
    t = Nt * z.k + z.y + O.top;
  be(r, t);
}
function be(r, t) {
  if (!m) return;
  const e = 14,
    s = m.offsetWidth || 240,
    n = m.offsetHeight || 80,
    o = r - s - e,
    a = t - n / 2;
  ((m.style.left = `${Math.max(8, Math.min(o, window.innerWidth - s - 8))}px`),
    (m.style.top = `${Math.max(8, Math.min(a, window.innerHeight - n - 8))}px`));
}
function P(r) {
  return r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const we = {
  info: { background: "rgba(15,23,42,0.90)", color: "#f1f5f9", duration: 2e3 },
  error: { background: "rgba(127,29,29,0.95)", color: "#fee2e2", duration: 4e3 },
};
let v = null,
  gt = 0;
function M(r, t = "info") {
  v ||
    ((v = document.createElement("div")),
    (v.id = "copy-toast"),
    Object.assign(v.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(8px)",
      borderRadius: "8px",
      padding: "7px 14px",
      fontSize: "12px",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fontWeight: "500",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: "600",
      opacity: "0",
      transition: "opacity 0.15s ease, transform 0.15s ease",
      boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
    }),
    document.body.appendChild(v));
  const e = we[t];
  (clearTimeout(gt),
    (v.textContent = r),
    (v.style.background = e.background),
    (v.style.color = e.color),
    (v.style.opacity = "1"),
    (v.style.transform = "translateX(-50%) translateY(0)"),
    (gt = window.setTimeout(() => {
      v && ((v.style.opacity = "0"), (v.style.transform = "translateX(-50%) translateY(8px)"));
    }, e.duration)));
}
/**
 * @license lucide v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const ke = [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    },
  ],
  ["circle", { cx: "12", cy: "12", r: "3" }],
];
/**
 * @license lucide v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */ const $e = [["path", { d: "M5 12h14" }]],
  xt = ke,
  bt = $e;
function ve(r, t, e = 12, s = "currentColor") {
  const n = e / 24,
    o = -e / 2,
    a = r
      .append("g")
      .attr("class", "lucide-icon")
      .attr("transform", `translate(${o},${o}) scale(${n})`)
      .attr("fill", "none")
      .attr("stroke", s)
      .attr("stroke-width", "2")
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("pointer-events", "none");
  for (const [i, l] of t) {
    const c = a.append(i);
    for (const [h, d] of Object.entries(l)) c.attr(h, d);
  }
  return a;
}
function wt(r, t, e = 12, s = "currentColor") {
  (r.select(".lucide-icon").remove(), ve(r, t, e, s));
}
const L = {
  folder: "#0057a1",
  module: "#ca8a04",
  export: "#16a34a",
  doc: "#9333ea",
  flow: "#0891b2",
  term: "#ea580c",
  external: "#0d9488",
  file: "#475569",
};
class Le {
  constructor(t, e, s, n, o, a, i, l, c) {
    ((this.onExpand = t),
      (this.onSelect = e),
      (this.onTraceLinks = s),
      (this.hasChildren = n),
      (this.isExpanded = o),
      (this.onCodePreview = a),
      (this.onChipClick = i),
      (this.getReferencingDocs = l),
      (this.getReferencingFlows = c));
  }
  getSize(t) {
    return B(t);
  }
  outgoing(t) {
    const { w: e } = this.getSize(t);
    return { x: t.x + e, y: t.y };
  }
  ingoing(t) {
    const { w: e, h: s } = this.getSize(t);
    return { x: t.x + e, y: t.y + s };
  }
  enter(t) {
    (t
      .on("mouseover", function (n, o) {
        var a;
        if (!n.currentTarget.contains(n.relatedTarget)) {
          const { h: i } = B(o),
            l = ((a = o.path) == null ? void 0 : a.split("/").pop()) ?? o.label,
            c =
              o.type === "external" && o.detail && typeof o.detail == "object" ? o.detail : void 0;
          fe(l, o.path, o.description, L[o.type], o.x, o.y + i / 2, c);
        }
      })
      .on("mouseout", function (n) {
        n.currentTarget.contains(n.relatedTarget) || me();
      }),
      t
        .append("rect")
        .attr("class", "node-bg")
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("fill", "#ffffff")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("click", (n, o) => {
          this.onSelect(o);
        }),
      t.append("rect").attr("class", "node-accent").attr("x", 0).attr("rx", 3).attr("width", 4),
      t
        .append("text")
        .attr("class", "node-icon")
        .attr("font-size", 12)
        .attr("dominant-baseline", "middle")
        .attr("fill", "#64748b"),
      t
        .append("text")
        .attr("class", "node-label")
        .attr("font-size", 11)
        .attr("font-weight", "700")
        .attr("fill", "#1e293b")
        .attr("dominant-baseline", "middle")
        .style("cursor", "pointer")
        .on("click", function (n, o) {
          n.stopPropagation();
          const a = o.path ?? o.label;
          navigator.clipboard
            .writeText(a)
            .then(() => M(`⎘ ${a}`))
            .catch(() => {});
        }),
      t
        .append("text")
        .attr("class", "node-desc")
        .attr("font-size", 9)
        .attr("fill", "#94a3b8")
        .attr("dominant-baseline", "middle"),
      t
        .append("line")
        .attr("class", "node-divider")
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 1));
    for (const n of ["docs", "flows"]) {
      const o = `node-btn-${n}`,
        a = t
          .append("g")
          .attr("class", o)
          .style("display", "none")
          .style("cursor", "pointer")
          .on("click", (i, l) => {
            (i.stopPropagation(), this.onChipClick && this.onChipClick(l, n));
          })
          .on("mouseenter", function () {
            k(this).style("filter", "brightness(0.88)");
          })
          .on("mouseleave", function () {
            k(this).style("filter", "none");
          });
      (a.append("rect").attr("rx", 3).attr("ry", 3).attr("height", 13),
        a
          .append("text")
          .attr("font-size", 8)
          .attr("font-weight", "600")
          .attr("dominant-baseline", "middle")
          .attr("text-anchor", "middle"));
    }
    const e = t
      .append("g")
      .attr("class", "node-preview-btn")
      .style("cursor", "pointer")
      .on("click", (n, o) => {
        (n.stopPropagation(), this.onCodePreview && this.onCodePreview(o, n.clientX, n.clientY));
      })
      .on("mouseenter", function (n, o) {
        const a = L[o.type];
        (k(this).select("circle").attr("fill", a), k(this).select("text").attr("fill", "#ffffff"));
      })
      .on("mouseleave", function (n, o) {
        const a = L[o.type];
        (k(this).select("circle").attr("fill", "#ffffff"), k(this).select("text").attr("fill", a));
      });
    (e.append("circle").attr("r", 9).attr("stroke-width", 1.5),
      e
        .append("text")
        .attr("font-size", 7)
        .attr("font-family", "monospace")
        .attr("font-weight", "600")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central"));
    const s = t
      .append("g")
      .attr("class", "node-expand-btn")
      .style("cursor", "pointer")
      .on("click", (n, o) => {
        (n.stopPropagation(), this.onExpand(o));
      })
      .on("mouseenter", function (n, o) {
        const a = L[o.type];
        (k(this).select("circle").attr("fill", a),
          k(this).select(".lucide-icon").attr("stroke", "#ffffff"));
      })
      .on("mouseleave", function (n, o) {
        const a = L[o.type];
        (k(this).select("circle").attr("fill", "#ffffff"),
          k(this).select(".lucide-icon").attr("stroke", a));
      });
    (s.append("circle").attr("r", 9).attr("stroke-width", 1.5).attr("fill", "#ffffff"),
      s.append("g").attr("class", "lucide-icon"),
      this.update(t));
  }
  update(t) {
    const e = this;
    t.each(function (s) {
      var ft;
      const n = k(this),
        { w: o, h: a } = e.getSize(s),
        i = L[s.type],
        l = e.hasChildren(s),
        c = 4,
        h = c + 8,
        d = a - 14,
        u = ct(s);
      if (
        (n
          .select(".node-bg")
          .attr("width", o)
          .attr("height", a)
          .attr("stroke", u ? "#cbd5e1" : i)
          .attr("stroke-dasharray", u ? "5,3" : "none")
          .attr("fill", "#ffffff")
          .style("opacity", u ? "0.55" : "1"),
        n.select(".node-icon").style("display", "none"),
        n.select(".node-divider").style("display", "none"),
        n.select(".node-accent").style("display", u ? "none" : ""),
        n.select(".node-btn-docs").style("display", u ? "none" : ""),
        n.select(".node-btn-flows").style("display", u ? "none" : ""),
        n.select(".node-preview-btn").style("display", "none"),
        u)
      ) {
        const C = Math.floor((o - 12) / 5.5);
        (n
          .select(".node-label")
          .style("display", null)
          .attr("x", 10)
          .attr("y", a / 2)
          .attr("fill", "#94a3b8")
          .attr("font-style", "italic")
          .text(kt(((ft = s.path) == null ? void 0 : ft.split("/").pop()) || s.label, C)),
          n.select(".node-desc").style("display", "none"));
        const S = n.select(".node-expand-btn");
        if ((S.style("display", l ? "block" : "none"), l)) {
          (S.attr("transform", `translate(${o},${a / 2})`), S.select("circle").attr("stroke", i));
          const qt = e.isExpanded(s) ? bt : xt;
          wt(S, qt, 10, i);
        }
        return;
      }
      (n.select(".node-label").style("display", null),
        n.select(".node-desc").style("display", "none"),
        n.select(".node-accent").attr("height", a).attr("fill", i));
      const p =
          (s.type === "module" || s.type === "export" || s.type === "file") &&
          Array.isArray(s.detail.code) &&
          s.detail.code.length > 0,
        y = s.type === "folder" || s.type === "file" || s.type === "module",
        E = Math.floor((o - h - 14) / 5.5);
      let $;
      if (y && s.path) {
        const C = s.path.split("/").pop() ?? s.label;
        s.parentId ? (s.type === "folder" ? ($ = `/${C}`) : ($ = C)) : ($ = `/${s.path}`);
      } else s.type === "export" ? ($ = Ft(s.label, s.detail.morphology)) : ($ = s.label);
      n.select(".node-label")
        .attr("x", h)
        .attr("y", d / 2)
        .text(kt($, E));
      const x = d - 1,
        ht = s.type !== "doc" && s.type !== "flow",
        pt = ht && e.getReferencingDocs ? e.getReferencingDocs(s.id) : [],
        ut = ht && e.getReferencingFlows ? e.getReferencingFlows(s.id) : [],
        Yt = "#ede9fe",
        Xt = "#7c3aed",
        Gt = "#cffafe",
        Wt = "#0e7490";
      let st = c + 6;
      const G = n.select(".node-btn-docs");
      if (pt.length > 0) {
        const C = `☰ Docs (${pt.length})`,
          S = C.length * 4.6 + 8;
        (G.style("display", "block").attr("transform", `translate(${st},${x})`),
          G.select("rect").attr("width", S).attr("fill", Yt).attr("stroke", "none"),
          G.select("text")
            .attr("x", S / 2)
            .attr("y", 6.5)
            .attr("fill", Xt)
            .text(C),
          (st += S + 4));
      } else G.style("display", "none");
      const W = n.select(".node-btn-flows");
      if (ut.length > 0) {
        const C = `→ Flows (${ut.length})`,
          S = C.length * 4.6 + 8;
        (W.style("display", "block").attr("transform", `translate(${st},${x})`),
          W.select("rect").attr("width", S).attr("fill", Gt).attr("stroke", "none"),
          W.select("text")
            .attr("x", S / 2)
            .attr("y", 6.5)
            .attr("fill", Wt)
            .text(C));
      } else W.style("display", "none");
      const q = n.select(".node-preview-btn");
      (q.style("display", p ? "block" : "none"),
        p &&
          (q.attr("transform", `translate(${o / 2},-4)`),
          q.select("circle").attr("stroke", i).attr("fill", "#ffffff"),
          q.select("text").attr("fill", i).text("<>")));
      const U = n.select(".node-expand-btn");
      if ((U.style("display", l ? "block" : "none"), l)) {
        (U.attr("transform", `translate(${o},${a / 2})`), U.select("circle").attr("stroke", i));
        const C = e.isExpanded(s) ? bt : xt;
        wt(U, C, 10, i);
      }
    });
  }
}
function kt(r, t) {
  return r ? (r.length > t ? r.slice(0, t - 1) + "…" : r) : "";
}
function Ft(r, t) {
  return t ? (t.includes("function") ? `${r}(...)` : t.includes("class") ? `${r} {...}` : r) : r;
}
function Ce(r, t, e, s, n, o, a, i, l) {
  return new Le(r, t, e, s, n, o, a, i, l);
}
function Ee(r) {
  const t = new Map();
  for (const s of r) t.has(s.id) || t.set(s.id, s);
  const e = [];
  for (const s of r) {
    if (!s.parentId) continue;
    const n = t.get(s.parentId);
    if (!n || n === s) continue;
    const o = B(n),
      a = B(s),
      i = ct(s);
    e.push({
      sourceId: n.id,
      targetId: s.id,
      sourceX: n.x + o.w,
      sourceY: n.y + o.h / 2,
      targetX: s.x,
      targetY: s.y + a.h / 2,
      targetType: s.type,
      ghost: i,
    });
  }
  return e;
}
function Se(r, t) {
  const e = r.selectAll("path.struct-link").data(t, (n) => `${n.sourceId}→${n.targetId}`);
  (e.exit().remove(),
    e
      .enter()
      .append("path")
      .attr("class", "struct-link")
      .attr("fill", "none")
      .attr("stroke-width", 1.5)
      .merge(e)
      .attr("stroke", (n) => L[n.targetType] + (n.ghost ? "59" : "66"))
      .attr("stroke-dasharray", (n) => (n.ghost ? "4,3" : "none"))
      .transition("layout")
      .duration(220)
      .ease(Rt)
      .attrTween("d", function (n) {
        const o = k(this),
          a = +(o.attr("data-sx") ?? n.sourceX),
          i = +(o.attr("data-sy") ?? n.sourceY),
          l = +(o.attr("data-tx") ?? n.targetX),
          c = +(o.attr("data-ty") ?? n.targetY);
        o.attr("data-sx", n.sourceX)
          .attr("data-sy", n.sourceY)
          .attr("data-tx", n.targetX)
          .attr("data-ty", n.targetY);
        const h = V(a, n.sourceX),
          d = V(i, n.sourceY),
          u = V(l, n.targetX),
          p = V(c, n.targetY);
        return (y) => Ne(h(y), d(y), u(y), p(y));
      }));
}
function Te(r, t, e) {
  const s = e,
    n = 28,
    o = [{ label: "Structure", y: 0, h: t.docsLaneY, color: "#f1f5f9" }];
  (t.docsNodes.length &&
    o.push({ label: "Docs", y: t.docsLaneY, h: t.otherLaneY - t.docsLaneY, color: "#f8fafc" }),
    t.otherNodes.length &&
      o.push({
        label: "Externals",
        y: t.otherLaneY,
        h: t.totalHeight - t.otherLaneY,
        color: "#f1f5f9",
      }));
  const a = r.selectAll("rect.lane-band").data(o);
  (a
    .enter()
    .append("rect")
    .attr("class", "lane-band")
    .merge(a)
    .attr("x", 0)
    .attr("y", (l) => l.y)
    .attr("width", s)
    .attr("height", (l) => l.h)
    .attr("fill", (l) => l.color)
    .attr("stroke", "#e2e8f0")
    .attr("stroke-width", 1),
    a.exit().remove());
  const i = r.selectAll("text.lane-label").data(o);
  (i
    .enter()
    .append("text")
    .attr("class", "lane-label")
    .attr("font-size", 10)
    .attr("font-weight", "600")
    .attr("fill", "#94a3b8")
    .attr("letter-spacing", "0.06em")
    .merge(i)
    .attr("x", 14)
    .attr("y", (l) => l.y + n / 2 + 4)
    .text((l) => l.label.toUpperCase()),
    i.exit().remove());
}
function Ae(r, t) {
  const e = new Map(r.map((n) => [n.id, n])),
    s = new Set();
  return t.flatMap((n) => {
    if (n.type !== "related-to" && n.type !== "imports" && n.type !== "imports-type") return [];
    const o = e.get(n.source),
      a = e.get(n.target);
    if (!o || !a || o.id === a.id) return [];
    const i = `${o.id}→${a.id}`;
    return s.has(i) ? [] : (s.add(i), [{ source: o, target: a, label: n.label, type: n.type }]);
  });
}
let _ = null;
function _e() {
  return (
    _ ||
      ((_ = document.createElement("div")),
      (_.id = "relation-tooltip"),
      Object.assign(_.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "500",
        display: "none",
        opacity: "0",
        transition: "opacity 0.1s ease",
        background: "#312e81",
        color: "#e0e7ff",
        borderRadius: "8px",
        padding: "5px 10px",
        fontSize: "12px",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        fontWeight: "600",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
      }),
      document.body.appendChild(_)),
    _
  );
}
function $t(r, t, e) {
  const s = _e();
  ((s.textContent = r),
    (s.style.display = "block"),
    requestAnimationFrame(() => {
      const n = s.offsetWidth;
      ((s.style.left = `${t - n / 2}px`), (s.style.top = `${e - 36}px`), (s.style.opacity = "1"));
    }));
}
function Ie() {
  _ && ((_.style.opacity = "0"), (_.style.display = "none"));
}
function Re(r, t) {
  if (!r || !t) return null;
  const e = r.split("/").slice(0, -1),
    s = t.split("/");
  let n = 0;
  for (; n < e.length && n < s.length && e[n] === s[n]; ) n++;
  const o = e.length - n,
    a = s.slice(n),
    i = [...Array(o).fill(".."), ...a].join("/");
  return o === 0 ? `./${i}` : i;
}
function D(r) {
  var t;
  return ((t = r.path) == null ? void 0 : t.split("/").pop()) ?? r.label;
}
function vt(r) {
  var e;
  if (r.type === "imports" || r.type === "imports-type") {
    const s = r.type === "imports-type" ? "imports type from" : "imports from",
      o =
        ((e = r.target.detail) == null ? void 0 : e.packageName) ??
        Re(r.source.path, r.target.path) ??
        r.target.path ??
        r.target.label;
    return `${D(r.source)} ${s} ${o}`;
  }
  const t = r.label;
  return t ? `${D(r.source)} → ${t} → ${D(r.target)}` : `${D(r.source)} → ${D(r.target)}`;
}
function He(r, t) {
  const e = r.selectAll("g.relation-link").data(t, (o) => `${o.source.id}→${o.target.id}`);
  e.exit().remove();
  const s = e.enter().append("g").attr("class", "relation-link");
  s.append("path").attr("class", "relation-path");
  const n = s.merge(e);
  (n.each(function (o) {
    const { sx: a, sy: i, tx: l, ty: c, fromColor: h } = jt(o.source, o.target, o.type),
      d = o.type === "imports-type";
    k(this)
      .select(".relation-path")
      .attr("stroke", d ? h : "none")
      .attr("stroke-width", d ? 1 : 0)
      .attr("stroke-dasharray", d ? "4,3" : "none")
      .attr("fill", h)
      .attr("fill-opacity", d ? 0.08 : 0.2)
      .attr("d", Oe(a, i, l, c));
  }),
    n
      .on("mouseenter", function (o, a) {
        const i = a.type === "imports-type";
        (k(this)
          .select(".relation-path")
          .attr("fill-opacity", i ? 0.35 : 0.65),
          $t(vt(a), o.clientX, o.clientY));
      })
      .on("mousemove", function (o, a) {
        $t(vt(a), o.clientX, o.clientY);
      })
      .on("mouseleave", function (o, a) {
        (k(this)
          .select(".relation-path")
          .attr("fill-opacity", a.type === "imports-type" ? 0.08 : 0.2),
          Ie());
      }));
}
function Me(r, t) {
  const e = r.selectAll("g.relation-endpoint").data(t, (i) => `${i.source.id}→${i.target.id}`);
  e.exit().remove();
  const s = e
      .enter()
      .append("g")
      .attr("class", "relation-endpoint")
      .style("pointer-events", "none"),
    n = s.append("g").attr("class", "relation-end-src");
  (n.append("circle").attr("r", 9).attr("fill", "#ffffff").attr("stroke", "none"),
    n
      .append("path")
      .attr("class", "arrow-icon")
      .attr("fill", "none")
      .attr("stroke-width", 1)
      .attr("stroke-linecap", "round"));
  const o = s.append("g").attr("class", "relation-end-tgt");
  (o.append("circle").attr("r", 9).attr("fill", "#ffffff").attr("stroke", "none"),
    o
      .append("path")
      .attr("class", "arrow-icon")
      .attr("fill", "none")
      .attr("stroke-width", 1)
      .attr("stroke-linecap", "round"),
    s.merge(e).each(function (i) {
      const {
          sx: l,
          sy: c,
          tx: h,
          ty: d,
          fromColor: u,
          toColor: p,
        } = jt(i.source, i.target, i.type),
        y = k(this);
      (y.select(".relation-end-src").attr("transform", `translate(${l},${c})`),
        y
          .select(".relation-end-src .arrow-icon")
          .attr("stroke", u)
          .attr("d", "M -3,3 L 3,-3 M 0.5,-3 L 3,-3 L 3,-0.5"),
        y.select(".relation-end-tgt").attr("transform", `translate(${h},${d})`),
        y
          .select(".relation-end-tgt .arrow-icon")
          .attr("stroke", p)
          .attr("d", "M 3,3 L -3,-3 M -0.5,-3 L -3,-3 L -3,-0.5"));
    }));
}
function jt(r, t, e) {
  const s = B(r),
    n = B(t);
  return e === "imports" || e === "imports-type"
    ? {
        sx: t.x + n.w,
        sy: t.y,
        tx: r.x + s.w,
        ty: r.y + s.h,
        fromColor: L[t.type],
        toColor: L[r.type],
      }
    : {
        sx: r.x + s.w,
        sy: r.y,
        tx: t.x + n.w,
        ty: t.y + n.h,
        fromColor: L[r.type],
        toColor: L[t.type],
      };
}
function Ne(r, t, e, s) {
  const n = (r + e) / 2;
  return `M${r},${t} C${n},${t} ${n},${s} ${e},${s}`;
}
function Oe(r, t, e, s) {
  const o = Math.abs(s - t),
    a = Math.max(60, o * 0.4),
    i = Math.max(r, e) + a,
    l = (t + s) / 2,
    c = s > t ? Math.max(0.5, Math.min(1, (s - t) / 16)) : 1,
    h = 1 - c;
  return [
    `M${r - 8},${t}`,
    `Q${i},${l} ${e - 8 * h},${s - 8 * c}`,
    `L${e + 8 * h},${s + 8 * c}`,
    `Q${i},${l} ${r + 8},${t}`,
    "Z",
  ].join(" ");
}
function Fe(r, t, e) {
  var l;
  const s = [...t.structureNodes, ...t.docsNodes, ...t.otherNodes],
    n = Math.max(4e3, Math.max(...s.map((c) => c.x + w[c.type].w), 0)),
    o = Ee(t.structureNodes),
    a = ((l = r.meta) == null ? void 0 : l.crossEdges) ?? [],
    i = Ae(s, a);
  return { allNodes: s, canvasW: n, structureLinks: o, relationLinks: i, matchIds: e };
}
function je() {
  var r;
  (r = document.getElementById("global-spinner")) == null || r.classList.remove("hidden");
}
function Lt() {
  var r;
  (r = document.getElementById("global-spinner")) == null || r.classList.add("hidden");
}
function Be(r, t, e, s = 20) {
  const n = "http://www.w3.org/2000/svg",
    o = document.createElementNS(n, "g");
  (o.setAttribute("class", "node-spinner"), o.setAttribute("transform", `translate(${t},${e})`));
  const a = document.createElementNS(n, "circle");
  (a.setAttribute("cx", "0"),
    a.setAttribute("cy", "0"),
    a.setAttribute("r", String(s / 2)),
    a.setAttribute("fill", "none"),
    a.setAttribute("stroke", "#1e293b"),
    a.setAttribute("stroke-width", "2"));
  const i = document.createElementNS(n, "circle");
  (i.setAttribute("cx", "0"),
    i.setAttribute("cy", "0"),
    i.setAttribute("r", String(s / 2)),
    i.setAttribute("fill", "none"),
    i.setAttribute("stroke", "#1a76c2"),
    i.setAttribute("stroke-width", "2"),
    i.setAttribute("stroke-dasharray", `${s * 0.8} ${s * 2}`),
    i.setAttribute("stroke-linecap", "round"));
  const l = document.createElementNS(n, "animateTransform");
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
    r.appendChild(o),
    o
  );
}
function Pe(r) {
  r.remove();
}
const De = "modulepreload",
  ze = function (r) {
    return "/" + r;
  },
  Ct = {},
  T = function (t, e, s) {
    let n = Promise.resolve();
    if (e && e.length > 0) {
      let a = function (c) {
        return Promise.all(
          c.map((h) =>
            Promise.resolve(h).then(
              (d) => ({ status: "fulfilled", value: d }),
              (d) => ({ status: "rejected", reason: d })
            )
          )
        );
      };
      document.getElementsByTagName("link");
      const i = document.querySelector("meta[property=csp-nonce]"),
        l = (i == null ? void 0 : i.nonce) || (i == null ? void 0 : i.getAttribute("nonce"));
      n = a(
        e.map((c) => {
          if (((c = ze(c)), c in Ct)) return;
          Ct[c] = !0;
          const h = c.endsWith(".css"),
            d = h ? '[rel="stylesheet"]' : "";
          if (document.querySelector(`link[href="${c}"]${d}`)) return;
          const u = document.createElement("link");
          if (
            ((u.rel = h ? "stylesheet" : De),
            h || (u.as = "script"),
            (u.crossOrigin = ""),
            (u.href = c),
            l && u.setAttribute("nonce", l),
            document.head.appendChild(u),
            h)
          )
            return new Promise((p, y) => {
              (u.addEventListener("load", p),
                u.addEventListener("error", () => y(new Error(`Unable to preload CSS for ${c}`))));
            });
        })
      );
    }
    function o(a) {
      const i = new Event("vite:preloadError", { cancelable: !0 });
      if (((i.payload = a), window.dispatchEvent(i), !i.defaultPrevented)) throw a;
    }
    return n.then((a) => {
      for (const i of a || []) i.status === "rejected" && o(i.reason);
      return t().catch(o);
    });
  },
  Ye =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  Xe =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>',
  Ge = "✕",
  We = { copy: Ye, close: Ge, back: Xe };
function et(r, t) {
  const e = document.createElement("button");
  return (
    (e.type = "button"),
    (e.className = `header-action-btn header-action-${r}`),
    (e.title = t.title),
    (e.innerHTML = We[r]),
    t.hidden && (e.hidden = !0),
    e.addEventListener("click", t.onClick),
    e
  );
}
function qe(r, t) {
  r &&
    navigator.clipboard.writeText(r).then(() => {
      M(`⎘ ${r}`);
    });
}
let g = null,
  F = null,
  R = null,
  Bt = 0,
  Pt = 0,
  Y = { k: 1, x: 0, y: 0 },
  j = null;
function Ue(r) {
  ((j = r.getBoundingClientRect()),
    new ResizeObserver(() => {
      j = r.getBoundingClientRect();
    }).observe(r),
    (g = document.createElement("div")),
    (g.id = "code-tooltip"),
    Object.assign(g.style, {
      position: "fixed",
      display: "none",
      flexDirection: "column",
      width: "620px",
      maxWidth: "90vw",
      maxHeight: "80vh",
      minWidth: "260px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
      zIndex: "500",
      opacity: "0",
      transform: "translateY(4px) scale(0.98)",
      transition: "opacity 0.15s ease, transform 0.15s ease",
      userSelect: "text",
    }),
    document.body.appendChild(g));
  const t = document.createElement("style");
  ((t.textContent = Qe), document.head.appendChild(t));
}
function Ve(r, t) {
  ((Y = r), (j = t), F && Dt());
}
async function Ke(r, t, e, s, n, o, a) {
  if (F === r) {
    ot();
    return;
  }
  ((F = r), (Bt = s), (Pt = n));
  let i = "";
  (o != null &&
    o.length &&
    (i +=
      o.map((p) => `import ${p}`).join(`
`) +
      `

`),
    (i += t.join(`
`)));
  const l = await Ze;
  if (F !== r) return;
  const c = a ?? "javascript",
    h = l.highlight(i, { language: c, ignoreIllegals: !0 }).value;
  if (!g) return;
  ((g.innerHTML = `<div class="code-tooltip-header" style="padding:5px 6px 5px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:4px;"><span style="min-width:0;font-size:12px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tn(e)}</span><div class="header-actions" data-slot="path"></div><div style="flex:1"></div><div class="header-actions" data-slot="end"></div></div><pre style="margin:0;padding:10px 16px 12px;overflow:auto;white-space:pre;font-family:'Cascadia Code','JetBrains Mono','Fira Code',monospace;font-size:11px;line-height:1.7;color:#1e293b;flex:1;min-height:0;user-select:text;"><code>${h}</code></pre>`),
    g
      .querySelector('.header-actions[data-slot="path"]')
      .appendChild(et("copy", { title: `Copy ${e}`, onClick: () => qe(e) })),
    g
      .querySelector('.header-actions[data-slot="end"]')
      .appendChild(et("close", { title: "Close", onClick: () => ot() })),
    (g.style.display = "flex"),
    Dt(),
    requestAnimationFrame(() => {
      g && ((g.style.opacity = "1"), (g.style.transform = "translateY(0) scale(1)"));
    }),
    R && document.removeEventListener("mousedown", R, !0),
    (R = (p) => {
      g && !g.contains(p.target) && ot();
    }),
    setTimeout(() => {
      R && document.addEventListener("mousedown", R, !0);
    }, 0));
}
function ot() {
  g &&
    ((F = null),
    R && (document.removeEventListener("mousedown", R, !0), (R = null)),
    (g.style.opacity = "0"),
    (g.style.transform = "translateY(4px) scale(0.98)"),
    setTimeout(() => {
      g && !F && (g.style.display = "none");
    }, 150));
}
function Dt() {
  if (!j) return;
  const r = Bt * Y.k + Y.x + j.left,
    t = Pt * Y.k + Y.y + j.top;
  Je(r, t);
}
function Je(r, t) {
  if (!g) return;
  const e = 14,
    s = g.offsetWidth || 620,
    n = g.offsetHeight || 220,
    o = window.innerWidth,
    a = window.innerHeight,
    i = r + e + s > o - 8 ? r - s - e : r + e,
    l = t + e + n > a - 8 ? t - n - e : t + e;
  ((g.style.left = `${Math.max(8, i)}px`), (g.style.top = `${Math.max(8, l)}px`));
}
const Ze = (async () => {
    const [
      { default: r },
      { default: t },
      { default: e },
      { default: s },
      { default: n },
      { default: o },
      { default: a },
      { default: i },
      { default: l },
      { default: c },
      { default: h },
    ] = await Promise.all([
      T(() => import("./core-CnFGYgqa.js"), __vite__mapDeps([0, 1])),
      T(() => import("./json-DIYVocXf.js"), []),
      T(() => import("./yaml-drsDnIKT.js"), []),
      T(() => import("./sql-BC88IN-V.js"), []),
      T(() => import("./dockerfile-Co-AyC30.js"), []),
      T(() => import("./xml-BXBhIUeX.js"), []),
      T(() => import("./css-DazXZka4.js"), []),
      T(() => import("./bash-I8pq0VWm.js"), []),
      T(() => import("./graphql-DPQANhhf.js"), []),
      T(() => import("./javascript-BKRaQes9.js"), []),
      T(() => import("./markdown-BrP960CR.js"), []),
    ]);
    return (
      r.registerLanguage("json", t),
      r.registerLanguage("yaml", e),
      r.registerLanguage("sql", s),
      r.registerLanguage("dockerfile", n),
      r.registerLanguage("xml", o),
      r.registerLanguage("html", o),
      r.registerLanguage("css", a),
      r.registerLanguage("bash", i),
      r.registerLanguage("graphql", l),
      r.registerLanguage("javascript", c),
      r.registerLanguage("markdown", h),
      r
    );
  })(),
  Qe = `
.hljs-comment,.hljs-quote{color:#6a737d;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-subst{color:#d73a49}
.hljs-number,.hljs-literal{color:#005cc5}
.hljs-string,.hljs-regexp,.hljs-addition,.hljs-meta-string{color:#032f62}
.hljs-doctag{color:#d73a49}
.hljs-title,.hljs-section{color:#6f42c1}
.hljs-built_in,.hljs-tag,.hljs-name{color:#22863a}
.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-type{color:#005cc5}
.hljs-symbol,.hljs-bullet,.hljs-link{color:#0366d6}
.hljs-deletion{color:#b31d28;background:#ffeef0}
.hljs-emphasis{font-style:italic}
.hljs-strong{font-weight:bold}
`;
function tn(r) {
  return r
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
let b = null,
  lt = 0;
function en() {
  ((b = document.createElement("div")),
    (b.id = "dom-tooltip"),
    Object.assign(b.style, {
      position: "fixed",
      display: "none",
      pointerEvents: "none",
      zIndex: "500",
      opacity: "0",
      transform: "translateX(4px)",
      transition: "opacity 0.12s ease, transform 0.12s ease",
    }),
    document.body.appendChild(b));
}
function nn(r, t, e, s, n) {
  b &&
    (on(r, t, e, s),
    (b.style.display = "block"),
    rn(n),
    cancelAnimationFrame(lt),
    (lt = requestAnimationFrame(() => {
      b && ((b.style.opacity = "1"), (b.style.transform = "translateX(0)"));
    })));
}
function sn() {
  b &&
    (cancelAnimationFrame(lt),
    (b.style.opacity = "0"),
    (b.style.transform = "translateX(4px)"),
    setTimeout(() => {
      b && b.style.opacity === "0" && (b.style.display = "none");
    }, 120));
}
function on(r, t, e, s) {
  if (!b) return;
  const o = `<div style="display:flex;align-items:center;gap:5px;margin-bottom:${!!(e || t) ? "4px" : "0"}"><span style="width:6px;height:6px;border-radius:50%;background:${s};flex-shrink:0;display:inline-block;"></span><span style="font-size:16px;font-weight:700;color:#0f172a;white-space:nowrap;">${rt(r)}</span></div>`,
    a = t
      ? `<div style="font-size:13px;color:#94a3b8;font-family:monospace;margin-bottom:${e ? "4px" : "0"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${rt(t)}</div>`
      : "",
    i = e
      ? `<div style="font-size:12px;color:#64748b;line-height:1.5;max-width:220px;">${rt(e)}</div>`
      : "";
  b.innerHTML = `<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:16px;padding:9px 14px;box-shadow:0 2px 12px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${o}${a}${i}</div>`;
}
function rn(r) {
  if (!b) return;
  const t = r.getBoundingClientRect(),
    e = b.offsetWidth || 240,
    s = b.offsetHeight || 60,
    o = Math.max(8, t.left - e - 10),
    a = Math.max(8, Math.min(t.top + t.height / 2 - s / 2, window.innerHeight - s - 8));
  ((b.style.left = `${o}px`), (b.style.top = `${a}px`));
}
function rt(r) {
  return r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
class an {
  constructor(t) {
    f(this, "panel");
    f(this, "title");
    f(this, "body");
    f(this, "backSlot");
    f(this, "backButton");
    f(this, "unsubscribe", null);
    ((this.router = t),
      (this.panel = document.getElementById("doc-panel")),
      (this.title = document.getElementById("doc-panel-title")),
      (this.body = document.getElementById("doc-panel-body")),
      (this.backSlot = document.getElementById("doc-panel-back")),
      (this.backButton = et("back", { title: "Back", onClick: () => this.router.back() })),
      this.backSlot.appendChild(this.backButton),
      (this.backSlot.hidden = !0),
      document
        .getElementById("doc-panel-actions")
        .appendChild(et("close", { title: "Close", onClick: () => this.router.close() })),
      (this.unsubscribe = this.router.subscribe((s, n) => {
        this.onViewChange(s, n);
      })));
  }
  destroy() {
    var t;
    ((t = this.unsubscribe) == null || t.call(this), (this.unsubscribe = null));
  }
  get isOpen() {
    return this.panel.classList.contains("open");
  }
  onViewChange(t, e) {
    if (!t) {
      (this.panel.classList.remove("open"), (this.backSlot.hidden = !0));
      return;
    }
    (this.resetTitle(), (this.body.innerHTML = ""));
    const s = this.router.context();
    (t.renderHeader(this.title, s),
      t.renderBody(this.body),
      (this.backSlot.hidden = !e),
      this.panel.classList.add("open"));
  }
  resetTitle() {
    ((this.title.innerHTML = ""), this.title.removeAttribute("data-refs"));
    for (const t of Array.from(this.title.attributes))
      t.name.startsWith("data-") && this.title.removeAttribute(t.name);
  }
}
class ln {
  constructor() {
    f(this, "stack", []);
    f(this, "listeners", new Set());
    f(this, "viewFactories", new Map());
    f(this, "syncHash", !1);
    f(this, "writingHash", !1);
    f(this, "onHashChange", () => {
      this.writingHash || this.restoreFromHash();
    });
  }
  registerView(t, e) {
    this.viewFactories.set(t.prefix, (s) => t.parse(s, e));
  }
  init(t = {}) {
    ((this.syncHash = t.syncHash ?? !1),
      this.syncHash &&
        (window.addEventListener("hashchange", this.onHashChange), this.restoreFromHash()));
  }
  refresh() {
    this.notify();
  }
  push(t) {
    const e = this.active();
    (e && e.route === t.route) || (this.stack.push(t), this.notify(), this.writeHash());
  }
  replace(t) {
    var s;
    const e = this.stack.pop();
    ((s = e == null ? void 0 : e.onLeave) == null || s.call(e),
      this.stack.push(t),
      this.notify(),
      this.writeHash());
  }
  back() {
    var e;
    if (this.stack.length === 0) return;
    const t = this.stack.pop();
    ((e = t == null ? void 0 : t.onLeave) == null || e.call(t), this.notify(), this.writeHash());
  }
  close() {
    var t, e;
    for (; this.stack.length > 0; )
      (e = (t = this.stack.pop()) == null ? void 0 : t.onLeave) == null || e.call(t);
    (this.notify(), this.writeHash());
  }
  active() {
    return this.stack[this.stack.length - 1] ?? null;
  }
  canGoBack() {
    return this.stack.length > 1;
  }
  context() {
    return { canGoBack: this.canGoBack(), back: () => this.back(), close: () => this.close() };
  }
  subscribe(t) {
    return (
      this.listeners.add(t),
      () => {
        this.listeners.delete(t);
      }
    );
  }
  notify() {
    const t = this.active(),
      e = this.canGoBack();
    for (const s of this.listeners) s(t, e);
  }
  writeHash() {
    if (!this.syncHash) return;
    const t = this.active(),
      e = t ? `#/${t.route}` : "",
      s = window.location.hash;
    if (!(s === e || (!e && s === ""))) {
      this.writingHash = !0;
      try {
        e
          ? (window.location.hash = e.slice(1))
          : window.history.pushState(null, "", window.location.pathname + window.location.search);
      } finally {
        setTimeout(() => {
          this.writingHash = !1;
        }, 0);
      }
    }
  }
  restoreFromHash() {
    var s, n, o, a;
    const t = window.location.hash.replace(/^#\/?/, "");
    if (!t) {
      for (; this.stack.length > 0; )
        (n = (s = this.stack.pop()) == null ? void 0 : s.onLeave) == null || n.call(s);
      this.notify();
      return;
    }
    const e = this.parseRoute(t);
    if (e) {
      for (; this.stack.length > 0; )
        (a = (o = this.stack.pop()) == null ? void 0 : o.onLeave) == null || a.call(o);
      (this.stack.push(e), this.notify());
    }
  }
  parseRoute(t) {
    const e = t.indexOf("/"),
      s = e < 0 ? t : t.slice(0, e),
      n = e < 0 ? "" : t.slice(e + 1),
      o = this.viewFactories.get(s);
    return o ? o(n) : null;
  }
}
const cn = new ln(),
  Et = { essential: 0, constraint: 1, supplementary: 2 },
  A = (r) =>
    r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function dn(r, t, e) {
  return r.length === 0
    ? `<p class="panel-empty">No ${t} reference this node.</p>`
    : r
        .slice()
        .sort((n, o) => {
          const a = n.priority ? (Et[n.priority] ?? 3) : 3,
            i = o.priority ? (Et[o.priority] ?? 3) : 3;
          return a - i;
        })
        .map((n, o) => {
          var y;
          const a = n.priority
              ? `<span class="priority-badge priority-${n.priority}">${n.priority}</span>`
              : "",
            i = n.path ?? n.label ?? n.id,
            l = ((y = n.description) == null ? void 0 : y.trim()) || i,
            c = `<span class="accordion-headline">${A(l)}</span>`,
            d = `<div class="accordion-path">${`<a class="tskb-ref accordion-path-ref" data-node-id="${A(n.id)}" data-node-display="${A(i)}" data-no-rewrite title="Open ${A(i)} in graph">${A(i)}</a>`}</div>`;
          let u;
          if (t === "flows") u = `<div class="accordion-body">${d}${hn(n, e)}</div>`;
          else {
            const E = n.detail.html;
            u = E
              ? `<div class="accordion-body">${d}${E}</div>`
              : `<div class="accordion-body">${d}</div>`;
          }
          return `<details class="accordion-item"${o === 0 ? " open" : ""}>
  <summary class="accordion-summary">${c}${a}</summary>
  ${u}
</details>`;
        })
        .join("");
}
function hn(r, t) {
  const e = r.detail.stepsJson;
  if (!e) return "";
  let s;
  try {
    s = JSON.parse(e);
  } catch {
    return "";
  }
  return s.length === 0
    ? ""
    : `<ol class="flow-steps">${s
        .map((o, a) => {
          const i = t.getNode(o.nodeId),
            l = i ? ` data-node-type="${A(i.type)}"` : "",
            c = i ? (i.path ?? o.nodeId) : o.nodeId,
            h = ` data-node-display="${A(c)}"`,
            d = o.label ? `<span class="flow-step-label">${A(o.label)}</span>` : "";
          return `<li class="flow-step">
  <span class="flow-step-num">${a + 1}</span>
  <div class="flow-step-content">
    <a class="tskb-ref" data-node-id="${A(o.nodeId)}"${l}${h}>${A(o.nodeId)}</a>
    ${d}
  </div>
</li>`;
        })
        .join("")}</ol>`;
}
const St = "__tskbRefClickHandler";
function Tt(r, t) {
  const e = r,
    s = e[St];
  s && e.removeEventListener("click", s);
  const n = (o) => {
    var l;
    const a = (l = o.target) == null ? void 0 : l.closest("a.tskb-ref");
    if (!a) return;
    o.preventDefault();
    const i = a.getAttribute("data-node-id");
    i && t.onNodeRef(i);
  };
  (e.addEventListener("click", n),
    (e[St] = n),
    e.querySelectorAll("a.tskb-ref").forEach((o) => {
      const a = o.getAttribute("data-node-id");
      if (!a) return;
      const i = o.hasAttribute("data-no-rewrite"),
        l = t.getNode(a);
      (i || (o.textContent = pn(l, o, a)), (o.title = (l == null ? void 0 : l.path) ?? a));
      let c = !1;
      (o.addEventListener("mouseenter", () => {
        c = !0;
        const h = t.getNode(a) ?? l;
        (At(h, o, a),
          t.onNodeHighlight(a),
          h ||
            t
              .onNodePrefetch(a)
              .then(() => {
                if (!c) return;
                const d = t.getNode(a);
                d && At(d, o, a);
              })
              .catch(() => {}));
      }),
        o.addEventListener("mouseleave", () => {
          ((c = !1), sn(), t.onNodeHighlight(null));
        }));
    }));
}
function pn(r, t, e) {
  return r
    ? r.type === "export"
      ? Ft(r.label, r.detail.morphology)
      : r.type === "folder"
        ? (r.path ?? r.label) + "/"
        : (r.path ?? r.label)
    : (t.getAttribute("data-node-display") ?? e);
}
function At(r, t, e) {
  const s = t.getAttribute("data-node-display") ?? e,
    n = (r == null ? void 0 : r.label) || s,
    o = (r == null ? void 0 : r.type) ?? t.getAttribute("data-node-type") ?? null,
    a = o ? (L[o] ?? "#64748b") : "#64748b";
  nn(n, r == null ? void 0 : r.path, (r == null ? void 0 : r.description) ?? "", a, t);
}
const Z = (r) =>
    r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  X = class X {
    constructor(t, e, s) {
      ((this.nodeId = t), (this.kind = e), (this.deps = s));
    }
    get route() {
      return `${X.prefix}/${encodeURIComponent(this.nodeId)}/${this.kind}`;
    }
    static parse(t, e) {
      const s = t.lastIndexOf("/");
      if (s <= 0 || s === t.length - 1) return null;
      const n = t.slice(0, s),
        o = t.slice(s + 1);
      if (o !== "docs" && o !== "flows") return null;
      let a;
      try {
        a = decodeURIComponent(n);
      } catch {
        return null;
      }
      return new X(a, o, e);
    }
    renderHeader(t, e) {
      const s = this.deps.getNode(this.nodeId),
        n = (s == null ? void 0 : s.path) ?? (s == null ? void 0 : s.label) ?? this.nodeId,
        o = this.kind === "docs" ? "Docs" : "Flows",
        a = `<a class="tskb-ref title-refs-target-link" data-node-id="${Z(this.nodeId)}" data-node-display="${Z(n)}" data-no-rewrite title="Open ${Z(n)} in graph">${Z(n)}</a>`;
      ((t.dataset.refs = "true"),
        (t.innerHTML = `<span class="title-kind-chip title-kind-${this.kind}">${o}</span><span class="title-refs-target">related to ${a}</span>`),
        Tt(t, this.deps));
    }
    renderBody(t) {
      const e = this.deps.getRefsFor(this.nodeId, this.kind);
      ((t.innerHTML = dn(e, this.kind, { getNode: this.deps.getNode })), Tt(t, this.deps));
    }
  };
f(X, "prefix", "refs");
let nt = X;
function un(r, t) {
  const e = new Map();
  for (const a of r) {
    const i = a.detail.boundary;
    i && e.set(a.id, i);
  }
  const s = new Map(),
    n = new Map();
  function o(a) {
    const i = [],
      l = new Set();
    let c = a;
    for (;;) {
      if (l.has(c)) {
        for (const d of i) n.set(d, null);
        return null;
      }
      if (n.has(c)) {
        const d = n.get(c);
        for (const u of i) n.set(u, d);
        return d;
      }
      if (e.has(c)) {
        const d = e.get(c);
        n.set(c, d);
        for (const u of i) n.set(u, d);
        return d;
      }
      const h = t[c];
      if (!h) {
        n.set(c, null);
        for (const d of i) n.set(d, null);
        return null;
      }
      (l.add(c), i.push(c), (c = h));
    }
  }
  for (const a of r) {
    const i = o(a.id);
    i && s.set(a.id, i);
  }
  return s;
}
const N = 18;
function fn(r) {
  const { w: t, h: e } = w[r.type] ?? w.module,
    s = r.x - N,
    n = r.y - N,
    o = r.x + t + N,
    a = r.y + e + N;
  return [
    [s, n],
    [o, n],
    [o, a],
    [s, a],
    [(s + o) / 2, n],
    [(s + o) / 2, a],
    [s, (n + a) / 2],
    [o, (n + a) / 2],
  ];
}
function yn(r) {
  let t = 5381;
  for (let e = 0; e < r.length; e++) t = (t * 33) ^ r.charCodeAt(e);
  return t >>> 0;
}
function _t(r, t) {
  const e = Math.sin(r + t) * 43758.5453123;
  return (e - Math.floor(e)) * 2 - 1;
}
const It = 6;
function mn(r, t) {
  const e = r.flatMap(fn),
    s = Zt(e);
  if (!s || s.length < 3) {
    const a = r[0],
      { w: i, h: l } = w[a.type] ?? w.module,
      c = a.x + i / 2,
      h = a.y + l / 2,
      d = Math.max(i, l) / 2 + N + 4;
    return `M ${c - d},${h} a ${d},${d} 0 1,0 ${d * 2},0 a ${d},${d} 0 1,0 ${-d * 2},0`;
  }
  const n = s.map(([a, i], l) => [a + _t(t, l * 2) * It, i + _t(t, l * 2 + 1) * It]);
  return Qt()
    .x((a) => a[0])
    .y((a) => a[1])
    .curve(te)(n);
}
const Q = "#7c3aed",
  gn = "rgba(124,58,237,0.02)";
function xn(r, t) {
  console.log(
    `[boundary] buildGroups — ${r.length} nodes, ${Object.keys(t).length} parentOf entries`
  );
  const e = un(r, t);
  console.log(`[boundary] resolveBoundaries done — ${e.size} resolved`);
  const s = new Map();
  for (const o of r) {
    const a = e.get(o.id);
    a && (s.has(a) || s.set(a, []), s.get(a).push(o));
  }
  const n = [];
  for (const [o, a] of s) {
    const i = yn(o),
      l = mn(a, i);
    if (!l) continue;
    const c = Math.min(...a.map((p) => p.y)),
      h = Math.min(...a.map((p) => p.x)),
      d = Math.max(
        ...a.map((p) => {
          var y;
          return p.x + (((y = w[p.type]) == null ? void 0 : y.w) ?? 160);
        })
      ),
      u = (h + d) / 2;
    n.push({ name: o, nodes: a, path: l, labelX: u, labelY: c - N + 4 });
  }
  return n;
}
const tt = 14;
function bn(r, t, e, s) {
  const n = xn(t, e),
    o = r.selectAll("g.boundary-group").data(n, (c) => c.name);
  o.exit().remove();
  const a = o.enter().append("g").attr("class", "boundary-group").style("pointer-events", "none");
  (a.append("path").attr("class", "boundary-hull"),
    a.append("line").attr("class", "boundary-label-tick"));
  const i = a.append("g").attr("class", "boundary-label");
  (i.append("rect").attr("rx", 3).attr("ry", 3), i.append("text"));
  const l = a.merge(o);
  (l
    .select(".boundary-hull")
    .attr("d", (c) => c.path)
    .attr("fill", gn)
    .attr("stroke", Q)
    .attr("stroke-opacity", 1)
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "8,5"),
    l.select(".boundary-label").each(function (c) {
      const h = k(this),
        d = h.select("text"),
        u = h.select("rect");
      d.attr("font-size", tt)
        .attr("font-weight", "700")
        .attr("fill", Q)
        .attr("fill-opacity", 1)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("x", 0)
        .attr("y", 0)
        .text(c.name);
      const p = d.node(),
        $ = (p ? p.getBBox().width : c.name.length * 8) + 6 * 2,
        x = tt + 6;
      u.attr("x", -$ / 2)
        .attr("y", -x / 2)
        .attr("width", $)
        .attr("height", x)
        .attr("fill", "#ffffff")
        .attr("stroke", Q)
        .attr("stroke-opacity", 1)
        .attr("stroke-width", 0.8);
    }),
    l
      .select(".boundary-label-tick")
      .attr("x1", (c) => c.labelX)
      .attr("x2", (c) => c.labelX)
      .attr("y1", (c) => c.labelY + (tt + 6) / 2 / s)
      .attr("y2", (c) => c.labelY + N - 4)
      .attr("stroke", Q)
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", 1),
    zt(r, s));
}
function zt(r, t) {
  (r
    .selectAll(".boundary-label")
    .attr("transform", (e) => `translate(${e.labelX},${e.labelY}) scale(${1 / t})`),
    r.selectAll(".boundary-label-tick").attr("y1", (e) => e.labelY + (tt + 6) / 2 / t));
}
const wn = 0.85;
class I {
  constructor() {
    f(this, "loader", new ae());
    f(this, "store", new ie());
    f(this, "router", cn);
    f(this, "nodeRefHelperHooks");
    f(this, "docsOf", new Map());
    f(this, "flowsOf", new Map());
    f(this, "expanded", new Set());
    f(this, "selected", null);
    f(this, "matchIds", null);
    f(this, "searchWorker", null);
    f(this, "searchChip", null);
    f(this, "zoomK", 1);
    f(this, "pendingScrollGen", 0);
    f(this, "cachedLayout", null);
    f(this, "layoutDirty", !0);
    f(this, "svgEl");
    f(this, "svg");
    f(this, "zoom");
    f(this, "laneBgLayer");
    f(this, "boundaryLayer");
    f(this, "edgeLayer");
    f(this, "relationEdgeLayer");
    f(this, "nodeLayer");
    f(this, "relationEndLayer");
    f(this, "renderer");
  }
  static expandKey(t) {
    return `${t.id}:${t.type}`;
  }
  async mount() {
    (this.setupCanvas(),
      this.setupTooltips(),
      this.setupRenderer(),
      (this.nodeRefHelperHooks = {
        getNode: (t) => this.findNode(t),
        getRefsFor: (t, e) => this.getRefsFor(t, e),
        onNodeRef: (t) => this.navigateToNode(t),
        onNodeHighlight: (t) => this.onNodeHighlight(t),
        onNodePrefetch: (t) => this.prefetchNodeChunk(t),
      }),
      new an(this.router),
      this.router.registerView(nt, this.nodeRefHelperHooks),
      this.router.init({ syncHash: !0 }),
      this.setupSearch(),
      this.store.subscribe(() => {
        ((this.layoutDirty = !0), this.render());
      }),
      await this.loadInitialData());
  }
  setupCanvas() {
    this.svgEl = document.getElementById("canvas");
    const t = k(this.svgEl),
      e = t.append("g").attr("class", "zoom-layer");
    ((this.laneBgLayer = e.append("g").attr("class", "lane-bg-layer")),
      (this.boundaryLayer = e.append("g").attr("class", "boundary-layer")),
      (this.edgeLayer = e.append("g").attr("class", "edge-layer")),
      (this.relationEdgeLayer = e.append("g").attr("class", "relation-edge-layer")),
      (this.nodeLayer = e.append("g").attr("class", "node-layer")),
      (this.relationEndLayer = e.append("g").attr("class", "relation-end-layer")));
    const s = ee()
      .scaleExtent([0.05, 5])
      .on("zoom", (n) => {
        e.attr("transform", n.transform);
        const { k: o, x: a, y: i } = n.transform;
        this.zoomK = o;
        const l = this.svgEl.getBoundingClientRect();
        (Ve({ k: o, x: a, y: i }, l), ye({ k: o, x: a, y: i }, l), zt(this.boundaryLayer, o));
      });
    (t.call(s).on("dblclick.zoom", null),
      t.call(s.translateBy, 20, 20),
      (this.svg = t),
      (this.zoom = s));
  }
  setupTooltips() {
    (ue(this.svgEl), Ue(this.svgEl), en());
  }
  setupRenderer() {
    const t = (e) => this.expanded.has(I.expandKey(e));
    this.renderer = Ce(
      (e) => this.onExpand(e),
      (e) => this.onSelect(e),
      (e) => this.onTraceLinks(e),
      dt,
      t,
      (e) => {
        const s = e.detail.code,
          n = Array.isArray(e.detail.importLines) ? e.detail.importLines : void 0,
          { w: o } = w[e.type] ?? w.module,
          a = e.detail.fileType;
        Ke(e.id, s, e.path ?? e.id, e.x + o / 2, e.y, n, a);
      },
      (e, s) => this.onChipClick(e, s),
      (e) => this.docsOf.get(e) ?? [],
      (e) => this.flowsOf.get(e) ?? []
    );
  }
  setupSearch() {
    const t = document.getElementById("search-input"),
      e = document.getElementById("search-btn");
    ((this.searchChip = document.getElementById("search-chip")),
      (this.searchWorker = new Worker(
        new URL("/assets/search.worker-LQ0x_Wql.js", import.meta.url),
        { type: "module" }
      )),
      this.searchWorker.postMessage({
        type: "init",
        url: new URL("./chunks/search-index.json", document.baseURI).href,
      }),
      this.searchWorker.addEventListener("message", (n) => {
        const o = n.data;
        if (o.type === "results") {
          const a = o.ids;
          ((this.matchIds = new Set(a)),
            this.searchChip && this.searchChip.classList.remove("chip-searching"),
            a.length > 0 ? this.expandToReveal(a, a[0], !0) : this.render());
        }
      }));
    const s = () => {
      var o, a;
      const n = t.value.trim();
      if (!n) {
        this.clearSearch(t);
        return;
      }
      ((t.value = ""),
        this.showSearchChip(n, t),
        (o = this.searchChip) == null || o.classList.add("chip-searching"),
        (a = this.searchWorker) == null || a.postMessage({ type: "search", query: n }));
    };
    (e.addEventListener("click", s),
      t.addEventListener("keydown", (n) => {
        (n.key === "Enter" && s(), n.key === "Escape" && this.clearSearch(t));
      }));
  }
  clearSearch(t) {
    ((t.value = ""),
      (this.matchIds = null),
      this.searchChip && ((this.searchChip.hidden = !0), (this.searchChip.innerHTML = "")),
      this.render());
  }
  showSearchChip(t, e) {
    if (!this.searchChip) return;
    this.searchChip.innerHTML = "";
    const s = document.createElement("span");
    s.textContent = t;
    const n = document.createElement("button");
    ((n.className = "chip-close"),
      (n.title = "Clear search"),
      (n.textContent = "✕"),
      n.addEventListener("click", () => this.clearSearch(e)),
      this.searchChip.appendChild(s),
      this.searchChip.appendChild(n),
      (this.searchChip.hidden = !1));
  }
  buildRefMaps(t) {
    (this.docsOf.clear(), this.flowsOf.clear());
    const e = new Map(),
      s = new Map();
    for (const n of t.crossEdges)
      if (n.type === "references") {
        const o = e.get(n.target) ?? new Set();
        if (!o.has(n.source)) {
          (o.add(n.source), e.set(n.target, o));
          const a = this.docsOf.get(n.target) ?? [];
          (a.push(n.source), this.docsOf.set(n.target, a));
        }
      } else if (n.type === "flow-step") {
        const o = s.get(n.target) ?? new Set();
        if (!o.has(n.source)) {
          (o.add(n.source), s.set(n.target, o));
          const a = this.flowsOf.get(n.target) ?? [];
          (a.push(n.source), this.flowsOf.set(n.target, a));
        }
      }
  }
  async loadInitialData() {
    var t;
    je();
    try {
      const e = await this.loader.load("meta");
      (this.buildRefMaps(e), this.store.loadMeta(e));
      const s = (t = e.metadata) == null ? void 0 : t.projectName;
      if (s) {
        const n = document.getElementById("project-name");
        (n && (n.textContent = s), (document.title = `${s} · TSKB Explorer`));
      }
      this.router.refresh();
    } catch (e) {
      (console.error("Failed to load meta chunk:", e),
        Lt(),
        M("⚠ Failed to load graph (meta.json)", "error"));
      return;
    }
    Lt();
  }
  render() {
    if (!this.store.meta) return;
    const t = performance.now();
    if ((console.log("[render] start"), this.layoutDirty || !this.cachedLayout)) {
      const p = performance.now();
      ((this.cachedLayout = pe(this.store, (y) => this.expanded.has(I.expandKey(y)))),
        (this.layoutDirty = !1),
        console.log(`[render] computeLayout (${(performance.now() - p).toFixed(1)}ms)`));
    }
    let e = performance.now();
    const {
      allNodes: s,
      canvasW: n,
      structureLinks: o,
      relationLinks: a,
      matchIds: i,
    } = Fe(this.store, this.cachedLayout, this.matchIds);
    console.log(
      `[render] computeRenderState — ${s.length} nodes, ${o.length} struct, ${a.length} relation (${(performance.now() - e).toFixed(1)}ms)`
    );
    const l = this.store.meta.metadata.stats,
      c = [
        ["folderCount", "folder", "folders"],
        ["moduleCount", "module", "modules"],
        ["fileCount", "file", "files"],
        ["exportCount", "export", "exports"],
        ["termCount", "term", "terms"],
        ["externalCount", "external", "externals"],
        ["flowCount", "flow", "flows"],
        ["docCount", "doc", "docs"],
        ["edgeCount", "edge", "edges"],
      ];
    ((document.getElementById("stats").textContent = c
      .map(([p, y, E]) => {
        const $ = l[p] ?? 0;
        return `${$} ${$ === 1 ? y : E}`;
      })
      .join(" · ")),
      (e = performance.now()),
      Te(this.laneBgLayer, this.cachedLayout, n),
      console.log(`[render] renderLaneBands (${(performance.now() - e).toFixed(1)}ms)`),
      (e = performance.now()),
      bn(this.boundaryLayer, s, this.store.meta.parentOf ?? {}, this.zoomK),
      console.log(`[render] renderBoundaryGroups (${(performance.now() - e).toFixed(1)}ms)`),
      (e = performance.now()),
      Se(this.edgeLayer, o),
      console.log(`[render] renderStructureEdges (${(performance.now() - e).toFixed(1)}ms)`),
      (e = performance.now()),
      He(this.relationEdgeLayer, a),
      console.log(`[render] renderRelationEdges (${(performance.now() - e).toFixed(1)}ms)`),
      (e = performance.now()),
      Me(this.relationEndLayer, a),
      console.log(`[render] renderRelationEndpoints (${(performance.now() - e).toFixed(1)}ms)`),
      (e = performance.now()),
      console.log(`[render] D3 nodes… (${(performance.now() - t).toFixed(1)}ms total so far)`));
    const h = this.nodeLayer.selectAll("g.node").data(s, (p) => I.expandKey(p));
    h.exit()
      .transition()
      .duration(140)
      .ease(ne)
      .style("opacity", "0")
      .attr("transform", (p) => `translate(${p.x},${p.y + 8})`)
      .remove();
    const d = h
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (p) => `translate(${p.x},${p.y - 10})`)
      .style("opacity", "0");
    this.renderer.enter(d);
    const u = d.merge(h);
    (this.renderer.update(u),
      u
        .transition()
        .duration(220)
        .ease(Rt)
        .attr("transform", (p) => `translate(${p.x},${p.y})`)
        .style("opacity", (p) => (i && !i.has(p.id) ? "0.15" : "1")),
      this.edgeLayer
        .selectAll("path.struct-link")
        .transition("search")
        .duration(220)
        .style("opacity", (p) => (i && !i.has(p.sourceId) && !i.has(p.targetId) ? "0.08" : "1")),
      this.relationEdgeLayer
        .selectAll("g.relation-link")
        .transition("search")
        .duration(220)
        .style("opacity", (p) => (i && !i.has(p.source.id) && !i.has(p.target.id) ? "0.08" : "1")),
      this.relationEndLayer
        .selectAll("g.relation-endpoint")
        .transition("search")
        .duration(220)
        .style("opacity", (p) => (i && !i.has(p.source.id) && !i.has(p.target.id) ? "0.08" : "1")));
  }
  async onExpand(t) {
    const e = I.expandKey(t);
    if (t.type === "folder")
      if (this.expanded.has(e))
        (this.expanded.delete(e),
          this.collapseDescendants(t.id),
          (this.layoutDirty = !0),
          this.render(),
          this.scrollToNode(t.id));
      else {
        if (!this.store.folderChunks.has(t.id)) {
          const s = Be(this.nodeLayer.node(), t.x + 190, t.y + 38);
          try {
            const n = await this.loader.load("folder", t.id);
            this.store.loadFolderChunk(n);
          } catch (n) {
            (console.error("Failed to load chunk for", t.id, n),
              M(`⚠ Failed to load ${t.label}`, "error"));
            return;
          } finally {
            Pe(s);
          }
        }
        (this.expanded.add(e), (this.layoutDirty = !0), this.render(), this.scrollToNode(t.id));
      }
    else
      t.type === "module" &&
        (this.expanded.has(e) ? this.expanded.delete(e) : this.expanded.add(e),
        (this.layoutDirty = !0),
        this.render(),
        this.scrollToNode(t.id));
  }
  async expandToReveal(t, e, s = !1) {
    if (!this.store.meta) return;
    const { parentOf: n, folderIds: o } = this.store.meta,
      a = new Set(o),
      i = new Set(),
      l = new Set();
    for (const h of t) {
      a.has(h) && i.add(h);
      let d = n[h];
      for (; d && !l.has(d); ) (l.add(d), i.add(d), (d = n[d]));
    }
    const c = new Set([...i].filter((h) => a.has(h)));
    if ((await this.fetchAndStoreFolders(c), s))
      this.expanded = new Set([...i].map((h) => `${h}:${a.has(h) ? "folder" : "module"}`));
    else for (const h of i) this.expanded.add(`${h}:${a.has(h) ? "folder" : "module"}`);
    ((this.layoutDirty = !0),
      this.render(),
      e &&
        (s
          ? this.scheduleSearchScroll(t, e)
          : requestAnimationFrame(() => this.scrollToNode(e, !0))));
  }
  scheduleSearchScroll(t, e) {
    var a, i;
    const s = new Set(
        [
          ...(((a = this.cachedLayout) == null ? void 0 : a.structureNodes) ?? []),
          ...(((i = this.cachedLayout) == null ? void 0 : i.otherNodes) ?? []),
        ].map((l) => l.id)
      ),
      n = s.has(e) ? e : t.find((l) => s.has(l));
    if (!n) return;
    const o = ++this.pendingScrollGen;
    setTimeout(() => {
      this.pendingScrollGen === o && this.scrollToNode(n, !0);
    }, 250);
  }
  async prefetchNodeChunk(t) {
    if (!this.store.meta) return;
    const { parentOf: e, folderIds: s } = this.store.meta,
      n = new Set(s),
      o = new Set(),
      a = new Set();
    let i = e[t];
    for (; i && !a.has(i); )
      (a.add(i), n.has(i) && !this.store.folderChunks.has(i) && o.add(i), (i = e[i]));
    if (!o.size) return;
    const l = await Promise.all([...o].map((d) => this.loader.load("folder", d).catch(() => null))),
      c = l.filter((d) => d !== null),
      h = l.length - c.length;
    h > 0 && M(`⚠ Failed to prefetch ${h} folder chunk${h === 1 ? "" : "s"}`, "error");
    for (const d of c) this.store.folderChunks.set(d.folderId, d);
  }
  async fetchAndStoreFolders(t) {
    const e = [...t].filter((a) => !this.store.folderChunks.has(a));
    if (!e.length) return;
    const s = await Promise.all(
        e.map(async (a) => {
          try {
            return await this.loader.load("folder", a);
          } catch (i) {
            return (console.error("Failed to load chunk for", a, i), null);
          }
        })
      ),
      n = s.filter((a) => a !== null),
      o = s.length - n.length;
    (o > 0 && M(`⚠ Failed to load ${o} folder chunk${o === 1 ? "" : "s"}`, "error"),
      n.length && this.store.loadFolderChunks(n));
  }
  scrollToNode(t, e = !1) {
    const s = this.nodeLayer.selectAll("g.node").filter((h) => h.id === t);
    if (s.empty()) return;
    const n = s.datum(),
      { w: o, h: a } = w[n.type] ?? w.module,
      i = n.x + o / 2,
      l = n.y + a / 2,
      c = this.svgEl.getBoundingClientRect();
    if (e) {
      const h = Math.min(Math.max(this.zoomK, wn), 1.2),
        d = se
          .translate(c.width / 2, c.height / 2)
          .scale(h)
          .translate(-i, -l);
      this.svg.transition().duration(400).call(this.zoom.transform, d);
      return;
    }
    this.svg
      .transition()
      .duration(300)
      .call(this.zoom.translateTo, i, l, [c.width / 2, c.height / 2]);
  }
  collapseDescendants(t) {
    const e = this.store.folderChunks.get(t);
    if (e) {
      for (const s of e.subfolders ?? [])
        (this.expanded.delete(I.expandKey(s)), this.collapseDescendants(s.id));
      for (const s of e.modules) this.expanded.delete(I.expandKey(s));
    }
  }
  onSelect(t) {
    const e = t.path && (t.type === "folder" || t.type === "module" || t.type === "file"),
      s = e ? t.path : t.label,
      n = e ? s : `${s} · ${t.type}`;
    navigator.clipboard.writeText(s).then(() => M(`⎘ ${n}`));
  }
  async navigateToNode(t) {
    if (!this.cachedLayout) return;
    const e = () => [
      ...this.cachedLayout.structureNodes,
      ...this.cachedLayout.docsNodes,
      ...this.cachedLayout.otherNodes,
    ];
    let s = e().find((n) => n.id === t);
    (s
      ? this.scrollToNode(t, !0)
      : (await this.expandToReveal([t], t),
        (s = e().find((n) => n.id === t)),
        this.onNodeHighlight(t)),
      s && this.onSelect(s));
  }
  findNode(t) {
    if (this.cachedLayout) {
      const s = [
        ...this.cachedLayout.structureNodes,
        ...this.cachedLayout.docsNodes,
        ...this.cachedLayout.otherNodes,
      ].find((n) => n.id === t);
      if (s) return s;
    }
    const e = this.store.meta;
    if (e) {
      const s =
        e.docs.find((n) => n.id === t) ??
        e.flows.find((n) => n.id === t) ??
        e.terms.find((n) => n.id === t) ??
        e.externals.find((n) => n.id === t) ??
        e.topFolders.find((n) => n.id === t);
      if (s) return s;
    }
    for (const s of this.store.folderChunks.values()) {
      const n =
        s.modules.find((o) => o.id === t) ??
        s.exports.find((o) => o.id === t) ??
        s.subfolders.find((o) => o.id === t) ??
        s.files.find((o) => o.id === t);
      if (n) return n;
    }
  }
  onNodeHighlight(t) {
    this.nodeLayer.selectAll("g.node").style("filter", (e) => {
      if (!t || e.id !== t) return null;
      const s = L[e.type] ?? "#0057a1";
      return `drop-shadow(0 0 6px ${s}bb) drop-shadow(0 0 14px ${s}66)`;
    });
  }
  onChipClick(t, e) {
    this.store.meta && this.router.push(new nt(t.id, e, this.nodeRefHelperHooks));
  }
  getRefsFor(t, e) {
    const s = this.store.meta;
    if (!s) return [];
    const n = (e === "docs" ? this.docsOf : this.flowsOf).get(t) ?? [],
      o = e === "docs" ? s.docs : s.flows;
    return n.map((a) => o.find((i) => i.id === a)).filter(Boolean);
  }
  onTraceLinks(t) {
    console.info("[tskb explorer] trace links for:", t.id, `(${t.edgeCount} edges)`);
  }
}
new I().mount();
