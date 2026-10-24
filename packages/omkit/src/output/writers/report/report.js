/* omkit run report — the viewer. Runs in the browser against the JSON block the writer
 * inlined (`#omkit-data`) and the global `d3`. Plain script, no build step: the writer
 * reads this file and pastes it into report.html as-is. */
(function () {
  "use strict";

  const TIP_TAGS = 6; // tag chips a hover tooltip shows before "+N"
  const TREE_TAGS = 4; // …and a timeline tree row
  const ROW_H = 42;
  const BAR_Y = 6;
  const BAR_H = 20;

  // ── icons (24×24, stroked) ───────────────────────────────
  const ICON = {
    timeline: "M3 17l5-5 4 4 8-8M3 21h18",
    flow: "M4 4h7v6H4zM13 14h7v6h-7zM7.5 10v4h9v0M16.5 14v-1",
    zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6",
    zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    close: "M6 6l12 12M18 6L6 18",
    chevron: "M9 6l6 6-6 6",
    play: "M8 5v14l11-7z",
    terminal: "M4 5h16v14H4zM7 9l3 3-3 3M12 15h5",
    globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    window: "M3 5h18v14H3zM3 9h18M6 7h.01M9 7h.01",
    pulse: "M3 12h4l2-5 4 10 2-5h6",
    cursor: "M5 3l14 7-6 2-2 6z",
    box: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
    camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
    file: "M6 3h8l4 4v14H6zM14 3v4h4",
    check: "M5 12l4 4 10-10",
    x: "M6 6l12 12M18 6L6 18",
    alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
    root: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3",
    chat: "M4 5h16v11H9l-5 4z",
    flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
    braces:
      "M8 4c-2 0-3 1-3 3v2c0 1-1 2-2 3 1 1 2 2 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1 1 2 2 3-1 1-2 2-2 3v2c0 2-1 3-3 3",
    image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01",
    sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    download: "M12 4v11M7 10l5 5 5-5M5 20h14",
    copy: "M9 9h11v11H9zM5 15V4h11",
    stop: "M6 6h12v12H6z",
    info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01",
    locate:
      "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 2v3M12 19v3M2 12h3M19 12h3M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    code: "M8 7l-5 5 5 5M16 7l5 5-5 5",
    external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  };
  const svgIcon = (name, extra) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${
      extra || ""
    }><path d="${ICON[name]}"/></svg>`;

  const PALETTE = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--c8"];
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const MARK = {
    event: { color: "--c3", icon: "check", label: "Process event" },
    snapshot: { color: "--c2", icon: "camera", label: "Snapshot" },
    artifact: { color: "--c6", icon: "file", label: "Artifact" },
    pass: { color: "--ok", icon: "check", label: "Assertion passed" },
    fail: { color: "--fail", icon: "alert", label: "Assertion failed" },
    error: { color: "--fail", icon: "x", label: "Error" },
    cancel: { color: "--cancel", icon: "stop", label: "Cancelled" },
    lifecycle: { color: "--c1", icon: "play", label: "Lifecycle" },
    run: { color: "--text-3", icon: "root", label: "Run" },
    link: { color: "--text-3", icon: "flow", label: "Link" },
  };

  // ── formatting ───────────────────────────────────────────
  const fmtDur = (ms) => {
    if (!isFinite(ms)) return "–";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m ${String(s).padStart(2, "0")}s`;
  };
  const fmtRel = (ms) => `+${fmtDur(Math.max(0, ms)).replace(/^0ms$/, "0ms")}`;
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtDate = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };
  const fmtSize = (b) =>
    b < 1024
      ? `${b} B`
      : b < 1048576
        ? `${Math.round(b / 1024)} KB`
        : `${(b / 1048576).toFixed(1)} MB`;
  const fmtTick = (ms) => {
    if (ms === 0) return "0s";
    const a = Math.abs(ms);
    if (a < 1000) return `${Math.round(ms)}ms`;
    if (a < 60000) return `${+(ms / 1000).toFixed(a < 10000 ? 2 : 1)}s`;
    return `${Math.floor(ms / 60000)}m${pad2(Math.round((ms % 60000) / 1000))}s`;
  };
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  const basename = (p) => String(p).split(/[\\/]/).pop();
  const fileUrl = (p) =>
    "file:///" +
    String(p)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/")
      .replace(/^([A-Za-z])%3A/, "$1:");
  const editorUrl = (site) => {
    const m = /^(.*):(\d+)$/.exec(site);
    const file = (m ? m[1] : site).replace(/\\/g, "/");
    return `vscode://file/${file.replace(/^\/+/, "")}${m ? ":" + m[2] : ""}`;
  };
  const json = (v) => {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  // ── model ────────────────────────────────────────────────
  function buildModel(data) {
    const run = data.run;
    const t0 = run.startedAt;
    const nodes = [];
    const byId = new Map();
    let tEnd = run.endedAt || t0;
    let topIndex = 0;
    (function walk(v, parent, depth, branch) {
      const isTop = depth === 1;
      const b = depth === 0 ? 0 : isTop ? topIndex++ % PALETTE.length : branch;
      const n = {
        v,
        id: v.id,
        name: v.name,
        parent,
        depth,
        branch: depth === 0 ? -1 : b,
        children: [],
        status: ["ok", "failed", "cancelled"].includes(v.status)
          ? v.status
          : v.endedAt
            ? v.status
            : "running",
        startAbs: v.startedAt || t0,
        endAbs: v.endedAt || 0,
        entries: [],
        marks: [],
      };
      nodes.push(n);
      byId.set(n.id, n);
      if (parent) parent.children.push(n);
      if (n.endAbs > tEnd) tEnd = n.endAbs;
      for (const c of v.children || []) walk(c, n, depth + 1, b);
    })(run.root, null, 0, 0);

    for (const e of data.entries) if (e.ts > tEnd) tEnd = e.ts;
    for (const n of nodes) {
      if (!n.endAbs) n.endAbs = tEnd;
      n.start = n.startAbs - t0;
      n.end = Math.max(n.start, n.endAbs - t0);
      n.duration = n.v.duration || n.end - n.start;
    }

    const items = [];
    const runEntries = [];
    for (const e of data.entries) {
      if (e.level === "child" || e.level === "tag") continue;
      const kind = kindOf(e);
      const item = {
        idx: items.length,
        e,
        kind,
        t: e.ts - t0,
        label: labelOf(e, kind),
        node: byId.get(e.nodeId) || null,
      };
      items.push(item);
      if (item.node) {
        item.node.entries.push(item);
        if (kind !== "info" && kind !== "lifecycle" && kind !== "link") item.node.marks.push(item);
      } else runEntries.push(item);
    }

    const assets = new Map();
    const gallery = [];
    for (const f of data.files) {
      gallery.push({
        type: "file",
        f,
        name: f.name,
        t: f.ts ? f.ts - t0 : null,
        node: f.nodeId ? byId.get(f.nodeId) || null : null,
        image: f.mime.startsWith("image/") && !!f.asset,
      });
    }
    for (const s of data.snapshots) {
      gallery.push({
        type: "snapshot",
        s,
        name: s.name,
        t: s.ts - t0,
        node: byId.get(s.nodeId) || null,
        image: false,
      });
    }
    gallery.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    // Let a mark find its gallery item (snapshot by file, artifact by file).
    const galleryByFile = new Map();
    for (const g of gallery)
      galleryByFile.set(String(g.type === "file" ? g.f.file : g.s.file).toLowerCase(), g);
    for (const it of items) {
      if (it.kind === "snapshot" || it.kind === "artifact") {
        const i = it.e.message.lastIndexOf(" → ");
        if (i >= 0) it.gallery = galleryByFile.get(it.e.message.slice(i + 3).toLowerCase()) || null;
      }
    }

    // cross-node interactions, recorded on their target: who waited on, cancelled, or called into whom
    const links = [];
    for (const it of items) {
      const l = it.kind === "link" && it.node && it.e.link;
      const from = l && byId.get(l.from);
      if (!from) continue;
      links.push({
        item: it,
        op: l.op,
        from,
        to: it.node,
        t: it.t,
        t0: it.t - (l.ms || 0),
        key: l.key || "",
        ms: l.ms,
        outcome: l.outcome || "",
        site: l.site || "",
      });
    }
    // …drawn as a point on the row of the action that made it: what it did, when it did it
    for (const l of links) {
      l.label = linkLabel(l);
      l.from.marks.push({
        idx: l.item.idx,
        e: l.item.e,
        kind: "link",
        t: l.t,
        label: l.label,
        node: l.from,
        link: l,
      });
    }
    for (const l of links) l.from.marks.sort((a, b) => a.t - b.t);

    const asserts = items.filter((i) => i.kind === "pass" || i.kind === "fail");
    const errors = collectErrors(items, nodes, run, tEnd - t0);
    const errorsBy = new Map();
    const errPath = new Set();
    for (const e of errors) {
      if (!e.node) continue;
      errorsBy.set(e.node, (errorsBy.get(e.node) || 0) + 1);
      for (let p = e.node.parent; p; p = p.parent) errPath.add(p.id);
    }
    const errNodes = new Set([...errorsBy.keys()].map((n) => n.id));
    return {
      errors,
      errorsBy,
      errNodes,
      errPath,
      data,
      run,
      t0,
      span: Math.max(1, tEnd - t0),
      nodes,
      byId,
      root: nodes[0],
      items,
      links,
      runEntries,
      gallery,
      asserts,
      assets,
      asset(id) {
        if (!assets.has(id)) {
          const el = document.getElementById(id);
          assets.set(id, el ? `data:${el.dataset.mime};base64,${el.textContent.trim()}` : "");
        }
        return assets.get(id);
      },
    };
  }

  /**
   * Everything that went wrong, in time order, as three kinds:
   * - `failure` — an action threw: its error (with stack), one per failed node;
   * - `assert`  — a failed `assert(…)`;
   * - `output`  — error output (stderr, console.error). A process's consecutive lines arrive as
   *   separate entries; lines from one source within a short gap are one block, so a stack
   *   trace reads as one error rather than thirty.
   */
  function collectErrors(items, nodes, run, span) {
    const out = [];
    const open = new Map(); // `${nodeId}\0${source}` → the output block still accepting lines
    for (const it of items) {
      if (it.kind === "fail") {
        out.push({
          type: "assert",
          node: it.node,
          t: it.t,
          title: it.label,
          text: it.e.message,
          items: [it],
        });
      } else if (it.kind === "error" && it.e.source === "error") {
        out.push({
          type: "failure",
          node: it.node,
          t: it.t,
          title: firstLine(it.e.message),
          text: it.e.message,
          items: [it],
        });
      } else if (it.kind === "error") {
        const key = `${it.e.nodeId}\0${it.e.source}`;
        const block = open.get(key);
        if (block && it.t - block.tEnd <= 300) {
          block.lines.push(it.e.message);
          block.items.push(it);
          block.tEnd = it.t;
          block.text = block.lines.join("\n");
          continue;
        }
        const fresh = {
          type: "output",
          node: it.node,
          t: it.t,
          tEnd: it.t,
          source: it.e.source,
          title: firstLine(it.e.message),
          lines: [it.e.message],
          text: it.e.message,
          items: [it],
        };
        open.set(key, fresh);
        out.push(fresh);
      }
    }
    // a failure the verdict holds but no node logged (e.g. the body threw outside any action)
    for (const f of run.failures || []) {
      const n =
        nodes.find((x) => x.v.path === f.action || x.id === f.action || x.name === f.action) ||
        null;
      if (out.some((e) => e.type === "failure" && e.node === n)) continue;
      // a failed assert is already its own entry; the verdict just lists it again as a fault
      if (out.some((e) => e.type === "assert" && e.node === n && String(f.error).includes(e.title)))
        continue;
      out.push({
        type: "failure",
        node: n,
        t: n ? n.end : span,
        title: firstLine(f.error),
        text: f.error,
        items: [],
      });
    }
    out.sort((a, b) => a.t - b.t);
    out.forEach((e, i) => (e.idx = i));
    return out;
  }
  /** A link's short label, as its point or chip shows it. */
  function linkLabel(l) {
    if (l.op === "once") return `waited ${l.key}`;
    if (l.op === "cancel") return `cancel ${displayName(l.to)}`;
    return `${displayName(l.to)}.${l.key}()`;
  }
  function firstLine(s) {
    return String(s).split("\n")[0];
  }
  function kindOf(e) {
    if (e.level === "link") return "link";
    if (e.level === "assert") return e.message.startsWith("⊭") ? "fail" : "pass";
    if (e.level === "snapshot") return "snapshot";
    if (e.level === "artifact") return "artifact";
    if (e.level === "error") return "error";
    if (e.level === "run") return "run";
    if (e.level === "event" && e.source === "cancel") return "cancel";
    if (e.level === "event" && e.source === "lifecycle") return "lifecycle";
    if (e.level === "event") return "event";
    return "info";
  }

  function labelOf(e, kind) {
    const m = e.message;
    if (kind === "snapshot" || kind === "artifact") {
      const i = m.lastIndexOf(" → ");
      return i >= 0 ? m.slice(0, i) : m;
    }
    if (kind === "pass" || kind === "fail") return m.replace(/^[⊨⊭]\s*(pass|FAIL)\s*·\s*/, "");
    if (kind === "error") return m.split("\n")[0];
    if (kind === "event") {
      // Command events repeat their source as a prefix — drop it.
      let s = m.startsWith(e.source + " · ") ? m.slice(e.source.length + 3) : m;
      s = s.split(" · ")[0];
      return s;
    }
    return m;
  }

  // ── app ──────────────────────────────────────────────────
  function App(model) {
    const app = document.getElementById("app");
    const state = {
      view: "timeline",
      selected: model.root.id,
      collapsed: new Set(),
      zoom: d3.zoomIdentity,
      detailOpen: new Set(["errors"]), // details-panel sections left open
      errFilter: "all",
      errHl: false,
      errOpen: new Set(),
      lowerTab: "snapshots",
      filter: "",
      pin: null,
      details: true,
    };
    // Deep, wide runs start collapsed below the second level so the first screen stays readable.
    if (model.nodes.length > 60)
      for (const n of model.nodes) if (n.depth >= 2 && n.children.length) state.collapsed.add(n.id);

    app.innerHTML = shellHtml(model);
    const el = {
      main: app.querySelector(".main"),
      timeline: app.querySelector(".timeline"),
      head: app.querySelector(".tl-head"),
      axis: app.querySelector(".tl-head svg"),
      body: app.querySelector(".tl-body"),
      tree: app.querySelector(".tree"),
      chart: app.querySelector(".chart"),
      flow: app.querySelector(".flow-view"),
      details: app.querySelector(".details"),
      lower: app.querySelector(".lower"),
      overview: app.querySelector(".overview svg"),
      range: app.querySelector(".overview .range"),
      windowSel: app.querySelector("#window"),
    };
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    document.body.appendChild(tip);

    let W = 600; // chart pixel width
    let baseX = d3.scaleLinear();
    const xz = () => state.zoom.rescaleX(baseX);

    // ── header controls ──
    app
      .querySelectorAll("[data-view]")
      .forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
    app.querySelector("#zin").addEventListener("click", () => zoomBy(1.6));
    app.querySelector("#zout").addEventListener("click", () => zoomBy(1 / 1.6));
    app.querySelector("#fit").addEventListener("click", fit);
    el.windowSel.addEventListener("change", () => {
      const ms = +el.windowSel.value;
      if (!ms) return fit();
      const [d0] = xz().domain();
      zoomToDomain(Math.max(0, d0), Math.max(0, d0) + ms);
    });
    app.querySelector("#more").addEventListener("click", (ev) => openMenu(ev.currentTarget));
    const goErrors = app.querySelector("#go-errors");
    if (goErrors) goErrors.addEventListener("click", () => openErrors(true));
    const info = app.querySelector("#om-info");
    info.addEventListener("mouseenter", (ev) => showTip(ev, omTip(), true));
    info.addEventListener("mousemove", (ev) => moveTip(ev));
    info.addEventListener("mouseleave", hideTip);
    info.addEventListener("click", () => select(model.root.id));
    const legendBtn = app.querySelector("#legend-btn");
    const legend = app.querySelector("#legend");
    const toggleLegend = (open) => {
      legend.hidden = !open;
      legendBtn.setAttribute("aria-expanded", String(open));
      legendBtn.classList.toggle("active", open);
    };
    legendBtn.addEventListener("click", () => toggleLegend(legend.hidden));
    document.addEventListener("mousedown", (e) => {
      if (!legend.hidden && !legend.contains(e.target) && !legendBtn.contains(e.target))
        toggleLegend(false);
    });
    document.addEventListener(
      "keydown",
      (e) => e.key === "Escape" && !legend.hidden && toggleLegend(false)
    );

    // ── zoom behaviours ──
    const chartZoom = d3
      .zoom()
      .scaleExtent([1, 5000])
      .filter((e) =>
        e.type === "wheel" ? e.ctrlKey || e.metaKey : !e.button && e.type !== "dblclick"
      )
      .on("zoom", (e) => onZoom(e.transform));
    const flowZoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (e) => flowG && flowG.attr("transform", e.transform));

    function activeZoom() {
      return { z: chartZoom, sel: d3.select(el.chart).select("svg") };
    }
    function onZoom(t) {
      state.zoom = t;
      redrawX();
    }
    function zoomBy(k) {
      if (state.view === "flow")
        return d3
          .select(el.flow)
          .select("svg")
          .transition()
          .duration(200)
          .call(flowZoom.scaleBy, k);
      const { z, sel } = activeZoom();
      const [cx] = state.pin != null ? [xz()(state.pin)] : [W / 2];
      sel.transition().duration(200).call(z.scaleBy, k, [cx, 0]);
    }
    function fit() {
      if (state.view === "flow") return fitFlow();
      const { z, sel } = activeZoom();
      sel.transition().duration(250).call(z.transform, d3.zoomIdentity);
    }
    function zoomToDomain(a, b) {
      const x0 = baseX(a);
      const x1 = baseX(b);
      if (!(x1 > x0)) return;
      const k = Math.max(1, W / (x1 - x0));
      const t = d3.zoomIdentity.scale(k).translate(-x0, 0);
      const { z, sel } = activeZoom();
      sel.call(z.transform, t);
    }

    // ── layout ──
    function measure() {
      const sb = el.body.offsetWidth - el.body.clientWidth;
      el.head.style.paddingRight = `${sb}px`;
      W = Math.max(200, el.chart.clientWidth);
      const span = model.span;
      baseX = d3
        .scaleLinear()
        .domain([-span * 0.01, span * 1.015])
        .range([0, W]);
      chartZoom
        .translateExtent([
          [0, -1e6],
          [W, 1e6],
        ])
        .extent([
          [0, 0],
          [W, 1],
        ]);
    }

    function setView(v) {
      state.view = v;
      app
        .querySelectorAll("[data-view]")
        .forEach((b) => b.classList.toggle("active", b.dataset.view === v));
      el.body.hidden = v !== "timeline";
      el.head.hidden = v === "flow";
      el.timeline.classList.toggle("is-flow", v === "flow");
      el.flow.hidden = v !== "flow";
      el.windowSel.disabled = v === "flow";
      renderAll();
    }

    // ── tree + timeline ──
    function visible() {
      const out = [];
      (function walk(n) {
        out.push(n);
        if (!state.collapsed.has(n.id)) n.children.forEach(walk);
      })(model.root);
      return out;
    }

    function renderTree(rows) {
      el.tree.innerHTML = rows.map((n) => treeRowHtml(n)).join("");
      el.tree.querySelectorAll(".row").forEach((r) => {
        const n = model.byId.get(r.dataset.id);
        r.addEventListener("click", (ev) => {
          if (ev.target.closest(".twist")) {
            toggle(n);
            return;
          }
          select(n.id);
        });
        r.addEventListener("dblclick", () => focusNode(n));
        r.addEventListener("mouseenter", (ev) => showTip(ev, nodeTip(n), true, 280));
        r.addEventListener("mousemove", (ev) => moveTip(ev));
        r.addEventListener("mouseleave", hideTip);
      });
    }
    function treeRowHtml(n) {
      const guides = Array.from({ length: n.depth }, () => '<span class="guide"></span>').join("");
      const open = !state.collapsed.has(n.id);
      const twist = n.children.length
        ? `<button class="twist ${open ? "open" : ""}" title="${open ? "Collapse" : "Expand"}">${svgIcon("chevron")}</button>`
        : '<span class="twist"></span>';
      const color = colorOf(n);
      const tags = chipsHtml(n.v.tags, TREE_TAGS, 18);
      return `<div class="row ${state.selected === n.id ? "selected" : ""}" data-id="${esc(n.id)}" title="${esc(n.v.path)}">
        <div class="name" style="padding-left:${n.depth ? 4 : 10}px">${guides}${twist}
          <span class="icon" style="color:${color};background:${alpha(color, 0.16)}">${svgIcon(iconOf(n))}</span>
          <span class="lines">
            <span class="l1"><span class="label">${labelHtml(n)}</span>${
              model.errorsBy.get(n)
                ? `<span class="errbadge" title="${model.errorsBy.get(n)} error${model.errorsBy.get(n) > 1 ? "s" : ""}">${model.errorsBy.get(n)}</span>`
                : ""
            }</span>
            <span class="l2">${tags}<span class="meta"><span class="st"><span class="dot ${n.status}"></span>${esc(n.status)}</span><span class="sep">·</span><span class="du">${fmtDur(n.duration)}</span></span></span>
          </span>
        </div>
      </div>`;
    }
    function toggle(n) {
      if (state.collapsed.has(n.id)) state.collapsed.delete(n.id);
      else state.collapsed.add(n.id);
      renderTimeline();
    }

    let chartSvg = null;
    let rowsNow = [];
    function renderTimeline() {
      rowsNow = visible();
      renderTree(rowsNow);
      const H = rowsNow.length * ROW_H + 8;
      d3.select(el.chart).selectAll("svg").remove();
      chartSvg = d3
        .select(el.chart)
        .append("svg")
        .attr("width", W)
        .attr("height", H)
        .on("mousemove", (ev) => moveCursor(d3.pointer(ev)[0]))
        .on("mouseleave", () => moveCursor(null));
      chartSvg.append("g").attr("class", "grid");
      chartSvg.append("g").attr("class", "links");
      chartSvg.append("g").attr("class", "xwires");
      chartSvg.append("g").attr("class", "rows");
      chartSvg
        .append("line")
        .attr("class", "pin")
        .attr("stroke", css("--accent"))
        .attr("stroke-width", 1.5)
        .attr("y1", 0)
        .attr("y2", H);
      chartSvg
        .append("line")
        .attr("class", "cursor")
        .attr("y1", 0)
        .attr("y2", H)
        .attr("visibility", "hidden");
      chartSvg.call(chartZoom).call(chartZoom.transform, state.zoom);
      redrawX();
    }

    function redrawX() {
      const x = xz();
      updateAxis(x);
      updateWindowLabel(x);
      updateOverviewBrush(x);
      if (state.view === "timeline" && chartSvg) drawRows(x);
    }

    function drawRows(x) {
      const H = rowsNow.length * ROW_H + 8;
      const ticks = x.ticks(Math.max(2, Math.floor(W / 90)));
      chartSvg
        .select(".grid")
        .selectAll("line")
        .data(ticks)
        .join("line")
        .attr("x1", (d) => x(d))
        .attr("x2", (d) => x(d))
        .attr("y1", 0)
        .attr("y2", H);
      const index = new Map(rowsNow.map((n, i) => [n.id, i]));
      // parent → child elbows
      const links = rowsNow.filter((n) => n.parent && index.has(n.parent.id));
      chartSvg
        .select(".links")
        .selectAll("path")
        .data(links, (n) => n.id)
        .join("path")
        .attr("class", "link")
        .attr("d", (n) => {
          const pi = index.get(n.parent.id);
          const ci = index.get(n.id);
          const cx = x(n.start);
          const px = Math.max(x(n.parent.start) + 6, cx - 12);
          const py = pi * ROW_H + BAR_Y + BAR_H;
          const cy = ci * ROW_H + BAR_Y + BAR_H / 2;
          return `M${px},${py}V${cy - 4}Q${px},${cy} ${px + 4},${cy}H${cx}`;
        });

      const g = chartSvg
        .select(".rows")
        .selectAll("g.r")
        .data(rowsNow, (n) => n.id)
        .join((enter) => {
          const r = enter.append("g").attr("class", "r");
          // A transparent target spanning the bar *and* its label, so a 2px bar is still hoverable.
          r.append("rect")
            .attr("class", "hit")
            .attr("y", BAR_Y - 4)
            .attr("height", BAR_H + 8);
          r.append("rect")
            .attr("class", "bar")
            .attr("rx", 5)
            .attr("y", BAR_Y)
            .attr("height", BAR_H);
          r.append("text")
            .attr("class", "bar-label")
            .attr("y", BAR_Y + BAR_H / 2 + 4);
          r.append("g").attr("class", "marks");
          const cb = r.append("g").attr("class", "code-btn src");
          cb.append("circle").attr("r", 9);
          cb.append("text").attr("text-anchor", "middle").attr("y", 3.5).text("<>");
          return r;
        })
        .attr("transform", (_n, i) => `translate(0,${i * ROW_H})`)
        .classed("sel", (n) => n.id === state.selected);

      g.select("rect.bar")
        .attr("x", (n) => x(n.start))
        .attr("width", (n) => Math.max(3, x(n.end) - x(n.start)))
        .attr("fill", (n) => colorOf(n))
        .attr("fill-opacity", (n) => (n.status === "cancelled" ? 0.55 : 0.92))
        .attr("stroke", (n) => (n.status === "failed" ? css("--fail") : null))
        .attr("stroke-width", (n) => (n.status === "failed" ? 2 : null))
        .attr("stroke-dasharray", (n) => (n.status === "cancelled" ? "4 3" : null))
        .classed("selected", (n) => n.id === state.selected)
        .call(bindNode);

      g.select("text.bar-label").each(function (n) {
        const t = d3.select(this);
        const x0 = x(n.start);
        const w = x(n.end) - x0;
        const text = `${boxLabel(n)} (${fmtDur(n.duration)})`;
        const need = text.length * 6.6 + 14;
        const inside = w >= need;
        const clipX = Math.max(x0, 0);
        const outside = !inside && w <= 60;
        const shown = inside || outside ? text : truncate(text, (w - 14) / 6.6);
        const tw = shown.length * 6.6;
        // an outside label that would run off the chart hangs left of its bar instead
        const flip = outside && x0 + Math.max(w, 3) + 6 + tw > W;
        const lx = flip
          ? x0 - 6
          : outside
            ? x0 + Math.max(w, 3) + 6
            : Math.min(clipX + 8, x0 + w - 20);
        t.text(shown)
          .classed("outside", outside)
          .attr("x", lx)
          .attr("text-anchor", flip ? "end" : "start");
        // the hit target covers bar + label, padded so a sliver of a bar is still easy to reach
        const left = Math.min(x0, flip ? lx - tw : lx) - 6;
        const right = Math.max(x0 + Math.max(w, 3), flip ? x0 : lx + tw) + 6;
        d3.select(this.parentNode)
          .select("rect.hit")
          .attr("x", left)
          .attr("width", Math.max(16, right - left));
        // the <> sits just past the block (or just before it, when that would leave the chart)
        // …and, for a block spanning the chart, inside it right after its label
        const cx =
          right + 8 <= W - 10
            ? right + 8
            : left - 8 >= 10
              ? left - 8
              : Math.min(W - 12, (flip ? x0 : lx + tw) + 14);
        d3.select(this.parentNode)
          .select("g.code-btn.src")
          .style("display", hasPopup(n) ? null : "none")
          .attr("transform", `translate(${cx},${BAR_Y + BAR_H / 2})`);
      });
      g.select("g.code-btn.src")
        .on("click", (ev, n) => {
          ev.stopPropagation();
          toggleCode(n, ev);
        })
        .on("mouseenter", (ev, n) => showTip(ev, popupTip(n)))
        .on("mouseleave", hideTip);
      g.selectAll("rect.hit, text.bar-label").call(bindNode);

      g.select("g.marks").each(function (n) {
        drawMarks(d3.select(this), n, x);
      });
      rowIndex = index;
      drawWires(x);

      chartSvg
        .select("line.pin")
        .attr("x1", state.pin != null ? x(state.pin) : -10)
        .attr("x2", state.pin != null ? x(state.pin) : -10);
      if (app.classList.contains("hl-on") || state.errHl) applyHl();
    }

    function linkColor(l) {
      return l.op === "cancel" ? css("--cancel") : colorOf(l.to);
    }
    /** A link in words: who did what to whom, how it ended, and the line that did it. */
    function linkTip(l, count) {
      const from = esc(displayName(l.from));
      const to = esc(displayName(l.to));
      const title =
        l.op === "once"
          ? `once · ${esc(l.key)}`
          : l.op === "cancel"
            ? "cancel"
            : `ref · ${esc(l.key)}()`;
      const what =
        l.op === "once"
          ? `<b>${from}</b> waited for <b>${esc(l.key)}</b> on <b>${to}</b>`
          : l.op === "cancel"
            ? `<b>${from}</b> cancelled <b>${to}</b>`
            : `<b>${from}</b> called <b>${esc(l.key)}()</b> on <b>${to}</b>'s ref`;
      const meta = [
        count > 1 ? `×${count}` : "",
        l.outcome ? esc(l.outcome) : "",
        l.ms != null ? (l.op === "once" ? `after ${fmtDur(l.ms)}` : fmtDur(l.ms)) : "",
        fmtRel(l.t),
      ].filter(Boolean);
      const line = (/:(\d+)$/.exec(l.site) || [])[1];
      return `<div class="tt">${title}</div><div class="summary">${what}</div>
        <div class="tmeta">${meta.join('<span class="sep">·</span>')}</div>
        ${l.site ? `<div class="mono small" style="margin-top:6px">${esc(relOf(l.site))}${line ? ":" + line : ""}</div>` : ""}`;
    }

    let rowIndex = new Map();
    /** The visible row standing in for `n`: its own, or its nearest expanded ancestor's. */
    function rowOf(n) {
      for (let p = n; p; p = p.parent) if (rowIndex.has(p.id)) return rowIndex.get(p.id);
      return -1;
    }
    /**
     * A link's wire: straight down (or up) the timeline at the moment it happened, from the
     * caller's point to the target's row — both ends share the instant, so the line reads as
     * "this, then, to that". Waits and cancels always have one; a ref call's shows on hover only,
     * since a chatty handle would otherwise hatch the chart.
     */
    function wireOf(l, x) {
      const a = rowOf(l.from);
      const b = rowOf(l.to);
      if (a < 0 || b < 0 || a === b) return null;
      const cy = BAR_Y + BAR_H / 2;
      return { l, x: x(l.t), y1: a * ROW_H + cy, y2: b * ROW_H + cy };
    }
    function drawWires(x, extra) {
      const shown = model.links.filter((l) => l.op !== "ref" || l === extra);
      chartSvg
        .select(".xwires")
        .selectAll("line")
        .data(shown.map((l) => wireOf(l, x)).filter(Boolean))
        .join("line")
        .attr("class", (w) => `xwire ${w.l.op}${w.l === extra ? " hot" : ""}`)
        .attr("x1", (w) => w.x)
        .attr("x2", (w) => w.x)
        .attr("y1", (w) => w.y1)
        .attr("y2", (w) => w.y2)
        .attr("stroke", (w) => linkColor(w.l));
    }

    function drawMarks(g, n, x) {
      const cy = BAR_Y + BAR_H / 2;
      // cluster marks closer than 4px so a chatty node draws a readable line of dots
      const marks = [];
      let last = -Infinity;
      for (const m of n.marks) {
        const px = x(m.t);
        if (px - last < 4 && marks.length) {
          marks[marks.length - 1].more.push(m);
          continue;
        }
        marks.push({ m, px, more: [] });
        last = px;
      }
      g.selectAll("circle.mark")
        .data(marks)
        .join("circle")
        .attr("class", (d) => `mark ${worst(d)}`)
        .attr("cx", (d) => d.px)
        .attr("cy", cy)
        .attr("r", (d) => (d.more.length ? 6 : 5))
        .attr("fill", (d) => css(MARK[worst(d)].color))
        // a link is a ring in its target's colour — set as styles, over the `.mark` stroke rule
        .style("fill", (d) => (worst(d) === "link" ? "var(--panel)" : null))
        .style("stroke", (d) => (worst(d) === "link" ? linkColor(d.m.link) : null))
        .on("click", (ev, d) => {
          ev.stopPropagation();
          openItem(d.m);
        })
        .on("mouseenter", (ev, d) => {
          showTip(ev, markTip(d), d.m.kind === "link");
          if (d.m.kind === "link") drawWires(xz(), d.m.link);
        })
        .on("mousemove", (ev) => moveTip(ev))
        .on("mouseleave", (ev, d) => {
          hideTip();
          if (d.m.kind === "link") drawWires(xz());
        });
      // labels under the bar, skipped where they would collide
      const labels = [];
      let edge = -Infinity;
      for (const d of marks) {
        const text = truncate(d.more.length ? `${d.m.label} +${d.more.length}` : d.m.label, 22);
        const w = text.length * 6 + 8;
        if (d.px - 6 < edge) continue;
        labels.push({ d, text });
        edge = d.px + w;
      }
      // a label that would run off the right edge hangs left of its mark instead
      const flip = (l) => l.d.px - 4 + l.text.length * 6 > W;
      g.selectAll("text.mark-label")
        .data(labels)
        .join("text")
        .attr("class", "mark-label")
        .attr("x", (l) => (flip(l) ? l.d.px + 4 : l.d.px - 4))
        .attr("text-anchor", (l) => (flip(l) ? "end" : "start"))
        .attr("y", BAR_Y + BAR_H + 13)
        .text((l) => l.text)
        .on("click", (ev, l) => {
          ev.stopPropagation();
          openItem(l.d.m);
        })
        .on("mouseenter", (ev, l) => showTip(ev, markTip(l.d)))
        .on("mousemove", (ev) => moveTip(ev))
        .on("mouseleave", hideTip);
    }
    function worst(d) {
      const all = [d.m, ...d.more].map((m) => m.kind);
      for (const k of ["fail", "error", "cancel", "snapshot", "artifact", "pass", "event"])
        if (all.includes(k)) return k;
      return all[0];
    }

    // ── axis + cursor ──
    function updateAxis(x) {
      const svg = d3.select(el.axis);
      if (state.view === "flow") return;
      const w = el.chart.clientWidth || W;
      svg.attr("viewBox", null);
      const g = svg
        .selectAll("g.axis")
        .data([0])
        .join("g")
        .attr("class", "axis")
        .attr("transform", "translate(0,33)");
      g.call(
        d3
          .axisTop(x)
          .ticks(Math.max(2, Math.floor(w / 90)))
          .tickFormat(fmtTick)
          .tickSizeOuter(0)
      );
      g.selectAll(".tick text").attr("dy", "-0.5em");
      svg
        .selectAll("text.cursor-t")
        .data([0])
        .join("text")
        .attr("class", "cursor-t")
        .attr("y", 12)
        .attr("fill", css("--accent"))
        .attr("font-size", 11);
    }
    function moveCursor(px) {
      if (chartSvg) {
        chartSvg
          .select("line.cursor")
          .attr("visibility", px == null ? "hidden" : "visible")
          .attr("x1", px)
          .attr("x2", px);
      }
      const label = d3.select(el.axis).select("text.cursor-t");
      if (px == null) label.text("");
      else {
        const t = xz().invert(px);
        label.attr("x", px + 4).text(fmtTick(Math.max(0, t)));
      }
    }
    function updateWindowLabel(x) {
      const [a, b] = x.domain();
      const span = b - a;
      const opt = el.windowSel.querySelector("option[value='0']");
      opt.textContent = `${fmtTick(span)} window`;
      el.windowSel.value = "0";
    }

    // ── flow view ──
    //
    // Each node's children form one *lane*: a column to its right, in start order, joined by
    // dashed down-arrows — the direction the run went. The node's own snapshots sit on those
    // arrows, between the children they happened between, so "when, relative to what" reads
    // off the picture. A leaf has no lane; its snapshots sit in a strip under its card.
    let flowG = null;
    let flowPos = new Map();
    let flowBounds = null;
    const FLOW = { CW: 250, CH: 58, TAGS_H: 18, GX: 64, GY: 26, LANE_DX: 22, TW: 46, TH: 28 };
    /** A tag chip in SVG, matching the HTML `.chip`; returns its group and width. */
    function svgChip(parent, x, label, color) {
      const g = parent.append("g").attr("class", "tchip").attr("transform", `translate(${x},0)`);
      const rect = g.append("rect").attr("height", 16).attr("rx", 4);
      const text = g.append("text").attr("x", 6).attr("y", 11.5).text(label);
      const w = (text.node().getComputedTextLength() || label.length * 6) + 12;
      rect
        .attr("width", w)
        .attr("fill", color ? alpha(color, 0.14) : "none")
        .attr("stroke", color ? alpha(color, 0.45) : css("--line"));
      return { g, w };
    }
    /** A link chip's text: what kind of interaction, at a glance. */
    function linkGlyph(x2) {
      if (x2.l.op === "once") return "wait";
      if (x2.l.op === "cancel") return "stop";
      return x2.n > 1 ? `()×${x2.n}` : "()";
    }
    /** "3 snapshots", "2 links", or "4 items" for a mix. */
    function chipCount(shots) {
      const links = shots.filter((x2) => x2.type === "link").length;
      if (!links) return `${shots.length} snapshots`;
      return links === shots.length ? `${links} links` : `${shots.length} items`;
    }
    function renderFlow() {
      d3.select(el.flow).selectAll("svg").remove();
      const svg = d3.select(el.flow).append("svg");
      svg
        .append("defs")
        .append("marker")
        .attr("id", "flow-arrow")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 9)
        .attr("refY", 5)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("class", "flow-arrowhead")
        .attr("d", "M0,1 L10,5 L0,9 z");
      flowG = svg.append("g");
      const { CW, GX, GY, LANE_DX, TW, TH } = FLOW;
      // every card gets the tag row when any is tagged, so lanes stay on one rhythm
      const CH = FLOW.CH + (model.nodes.some((n) => n.v.tags && n.v.tags.length) ? FLOW.TAGS_H : 0);

      const shotsBy = new Map();
      for (const g of model.gallery) {
        if (!g.node) continue;
        if (!shotsBy.has(g.node)) shotsBy.set(g.node, []);
        shotsBy.get(g.node).push(g);
      }
      // a node's links sit with its snapshots, in time order; a run of identical ref calls is one chip
      for (const l of model.links) {
        const list = shotsBy.get(l.from) || shotsBy.set(l.from, []).get(l.from);
        const prev = list[list.length - 1];
        if (
          l.op === "ref" &&
          prev &&
          prev.type === "link" &&
          prev.l.op === "ref" &&
          prev.l.to === l.to &&
          prev.l.key === l.key
        ) {
          prev.n++;
          continue;
        }
        list.push({ type: "link", l, n: 1, t: l.t, name: l.label });
      }
      const byTime = (a, b) => (a.t ?? Infinity) - (b.t ?? Infinity);
      const pos = new Map();
      const lanes = [];
      const chipRows = [];
      const strips = [];
      const STRIP_H = 6 + TH;
      const cardBottom = (n, y) => y + CH + (!n.children.length && shotsBy.has(n) ? STRIP_H : 0);

      // Lays `n` out with its card's top-left at (x, y); returns the bottom of its whole subtree.
      const lay = (n, x, y) => {
        pos.set(n.id, { x, y });
        const shots = [...(shotsBy.get(n) || [])].sort(byTime);
        if (!n.children.length) {
          if (shots.length) strips.push({ n, x: x + 6, y: y + CH + 6, shots });
          return cardBottom(n, y);
        }
        const cx = x + CW + GX;
        const kids = [...n.children].sort((a, b) => a.start - b.start);
        const seq = [];
        let si = 0;
        for (const k of kids) {
          const before = [];
          while (si < shots.length && (shots[si].t ?? Infinity) < k.start) before.push(shots[si++]);
          if (before.length) seq.push({ shots: before });
          seq.push({ node: k });
        }
        if (si < shots.length) seq.push({ shots: shots.slice(si) });
        const items = [];
        let cy = y;
        for (const it of seq) {
          if (it.shots) {
            const row = { x: cx + LANE_DX - TW / 2, y: cy, shots: it.shots };
            chipRows.push(row);
            items.push({ top: cy, bottom: cy + TH, row });
            cy += TH + GY;
          } else {
            const bottom = lay(it.node, cx, cy);
            items.push({ top: cy, bottom: cardBottom(it.node, cy), node: it.node });
            cy = bottom + GY;
          }
        }
        lanes.push({ parent: n, x: cx + LANE_DX, cardX: cx, items });
        return Math.max(cardBottom(n, y), cy - GY);
      };
      const total = lay(model.root, 0, 0);

      let maxX = CW;
      for (const p of pos.values()) maxX = Math.max(maxX, p.x + CW);
      for (const r of chipRows) maxX = Math.max(maxX, r.x + r.shots.length * (TW + 4) + 60);
      flowBounds = { x0: -24, y0: -24, x1: maxX + 24, y1: total + 24 };

      // parent → its lane: across from the card, then down into the first item
      const links = flowG.append("g").attr("class", "flow-links");
      for (const lane of lanes) {
        const p = pos.get(lane.parent.id);
        const first = lane.items[0];
        const mid = p.y + CH / 2;
        const d =
          first.node && first.top === p.y
            ? `M${p.x + CW},${mid}H${lane.cardX}`
            : `M${p.x + CW},${mid}H${lane.x - 8}Q${lane.x},${mid} ${lane.x},${mid + 8}V${first.top - 2}`;
        links.append("path").attr("class", "flow-link").attr("d", d);
        // sibling → next sibling: the flow direction. Overlapping siblings ran in parallel.
        let prevNode = null;
        for (let i = 0; i + 1 < lane.items.length; i++) {
          const a = lane.items[i];
          const b = lane.items[i + 1];
          if (a.node) prevNode = a.node;
          const parallel = !!(b.node && prevNode && b.node.start < prevNode.end - 1);
          links
            .append("path")
            .attr("class", `flow-seq${parallel ? " parallel" : ""}`)
            .attr("d", `M${lane.x},${a.bottom + 2}V${b.top - 3}`)
            .attr("marker-end", parallel ? null : "url(#flow-arrow)");
          if (parallel) {
            links
              .append("text")
              .attr("class", "flow-par")
              .attr("x", lane.x + 6)
              .attr("y", (a.bottom + b.top) / 2 + 3)
              .text("∥ parallel");
          }
        }
      }

      const nodes = [...pos.keys()].map((id) => model.byId.get(id));
      const card = flowG
        .append("g")
        .selectAll("g.flow-card")
        .data(nodes, (n) => n.id)
        .join("g")
        .attr("class", (n) => `flow-card ${n.id === state.selected ? "selected" : ""}`)
        .attr("transform", (n) => `translate(${pos.get(n.id).x},${pos.get(n.id).y})`)
        .style("cursor", "pointer")
        .on("click", (ev, n) => select(n.id))
        .on("dblclick", (ev, n) => {
          ev.stopPropagation();
          setView("timeline");
          focusNode(n);
        })
        .on("mouseenter", (ev, n) => showTip(ev, nodeTip(n), true))
        .on("mousemove", (ev) => moveTip(ev))
        .on("mouseleave", hideTip);
      card.append("rect").attr("class", "box").attr("width", CW).attr("height", CH).attr("rx", 9);
      card
        .append("rect")
        .attr("class", "icon-bg")
        .attr("x", 10)
        .attr("y", 10)
        .attr("width", 24)
        .attr("height", 24)
        .attr("rx", 6)
        .attr("fill", (n) => alpha(colorOf(n), 0.16));
      card
        .append("g")
        .attr("class", "flow-icon")
        .attr("transform", "translate(15,15) scale(0.58)")
        .attr("color", (n) => colorOf(n))
        .html(
          (n) =>
            `<path d="${ICON[iconOf(n)]}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
        );
      card.each(function (n) {
        const lines = wrapName(boxLabel(n), 31);
        const t = d3.select(this);
        lines.forEach((line, i) =>
          t
            .append("text")
            .attr("class", "nm")
            .attr("x", 42)
            .attr("y", (lines.length > 1 ? 17 : 22) + i * 14)
            .text(line)
        );
        t.append("text")
          .attr("class", "sub")
          .attr("x", 42)
          .attr("y", lines.length > 1 ? 49 : 41)
          .text(`${nodeKind(n)} · ${n.status} · ${fmtDur(n.duration)} · +${fmtTick(n.start)}`);
        const tags = n.v.tags || [];
        if (!tags.length) return;
        const row = t
          .append("g")
          .attr("class", "tchips")
          .attr("transform", `translate(42,${lines.length > 1 ? 56 : 51})`);
        const room = CW - 42 - 10;
        let x = 0;
        for (let i = 0; i < tags.length; i++) {
          const c = svgChip(row, x, truncate(tags[i], 22), tagColor(tags[i]));
          // keep room for a "+N" after it, unless it is the last
          if (i > 0 && x + c.w > room - (i < tags.length - 1 ? 30 : 0)) {
            c.g.remove();
            svgChip(row, x, `+${tags.length - i}`, null).g.classed("more", true);
            break;
          }
          x += c.w + 4;
        }
      });
      card
        .append("circle")
        .attr("cx", CW - 12)
        .attr("cy", 12)
        .attr("r", 4)
        .attr("fill", (n) => css(statusVar(n.status)));
      const fcb = card
        .filter((n) => hasPopup(n))
        .append("g")
        .attr("class", "code-btn")
        .attr("transform", `translate(${CW / 2},0)`)
        .on("click", (ev, n) => {
          ev.stopPropagation();
          toggleCode(n, ev);
        })
        .on("mouseenter", (ev, n) => {
          ev.stopPropagation();
          showTip(ev, popupTip(n));
        });
      fcb.append("circle").attr("r", 9);
      fcb.append("text").attr("text-anchor", "middle").attr("y", 3.5).text("<>");

      // snapshot chips — on lane arrows, and in strips under leaf cards
      const chipLayer = flowG.append("g").attr("class", "flow-shots");
      // A link chip's wire, drawn under everything else: out of the chip to a gutter right of the
      // column, along it, and into the target card's right edge — so it never runs behind the cards
      // between. Waits and cancels always have one; a ref call's shows while hovered.
      const wireLayer = flowG.insert("g", ":first-child").attr("class", "flow-wires");
      const linkChips = [];
      const drawFlowWires = (hot) => {
        const wires = [];
        for (const c of linkChips) {
          const p = pos.get(c.x2.l.to.id);
          if (!p || (c.x2.l.op === "ref" && c.x2 !== hot)) continue;
          wires.push({ c, p });
        }
        wireLayer
          .selectAll("path")
          .data(wires)
          .join("path")
          .attr("class", (w) => `fwire ${w.c.x2.l.op}${w.c.x2 === hot ? " hot" : ""}`)
          .attr("d", (w, i) => {
            const tx = w.p.x + CW;
            const ty = w.p.y + CH / 2;
            const gx = Math.max(tx, w.c.cx + TW / 2) + 12 + (i % 6) * 6; // staggered within the column gap
            return `M${w.c.cx + TW / 2},${w.c.cy} H${gx} V${ty} H${tx}`;
          })
          .attr("stroke", (w) => linkColor(w.c.x2.l));
      };
      const drawChips = (x, y, shots, max, owner) => {
        const shown = shots.length > max ? shots.slice(0, max - 1) : shots;
        const g = chipLayer.append("g").attr("transform", `translate(${x},${y})`);
        const cell = g
          .selectAll("g.shot")
          .data(shown)
          .join("g")
          .attr("class", "shot")
          .attr("transform", (_x, i) => `translate(${i * (TW + 4)},0)`)
          .on("click", (ev, x2) => {
            ev.stopPropagation();
            if (x2.type !== "link") return openGallery(x2);
            setPin(x2.t);
            select(x2.l.from.id, "links");
          })
          .on("mouseenter", (ev, x2) => {
            showTip(
              ev,
              x2.type === "link" ? linkTip(x2.l, x2.n) : galleryTip(x2),
              x2.type === "link"
            );
            if (x2.type === "link") drawFlowWires(x2);
          })
          .on("mousemove", (ev) => moveTip(ev))
          .on("mouseleave", (ev, x2) => {
            hideTip();
            if (x2.type === "link") drawFlowWires(null);
          });
        shown.forEach((x2, i) => {
          if (x2.type === "link")
            linkChips.push({ x2, cx: x + i * (TW + 4) + TW / 2, cy: y + TH / 2 });
        });
        cell
          .append("rect")
          .attr("width", TW)
          .attr("height", TH)
          .attr("rx", 5)
          .attr("stroke", (x2) => (x2.type === "link" ? linkColor(x2.l) : null));
        cell
          .filter((x2) => x2.image)
          .append("image")
          .attr("href", (x2) => model.asset(x2.f.asset))
          .attr("x", 1)
          .attr("y", 1)
          .attr("width", TW - 2)
          .attr("height", TH - 2)
          .attr("preserveAspectRatio", "xMidYMid slice");
        cell
          .filter((x2) => !x2.image)
          .append("text")
          .attr("x", TW / 2)
          .attr("y", TH / 2 + 3.5)
          .attr("text-anchor", "middle")
          .text((x2) =>
            x2.type === "link" ? linkGlyph(x2) : x2.type === "snapshot" ? "{ }" : "file"
          );
        let end = shown.length * (TW + 4);
        if (shots.length > shown.length) {
          const more = g
            .append("g")
            .attr("class", "shot more")
            .attr("transform", `translate(${end},0)`)
            .on("click", (ev) => {
              ev.stopPropagation();
              select(owner.id, "snapshots");
            });
          more.append("rect").attr("width", TW).attr("height", TH).attr("rx", 5);
          more
            .append("text")
            .attr("x", TW / 2)
            .attr("y", TH / 2 + 3.5)
            .attr("text-anchor", "middle")
            .text(`+${shots.length - shown.length}`);
          end += TW + 4;
        }
        const t = shots[0].t;
        if (t != null) {
          g.append("text")
            .attr("class", "flow-shot-t")
            .attr("x", end + 2)
            .attr("y", TH / 2 + 4)
            .text(
              `${fmtRel(t)} · ${shots.length > 1 ? chipCount(shots) : truncate(shots[0].name, 22)}`
            );
        }
      };
      for (const r of chipRows) {
        const owner = lanes.find((l) => l.items.some((i) => i.row === r)).parent;
        drawChips(r.x, r.y, r.shots, 6, owner);
      }
      for (const s of strips) drawChips(s.x, s.y, s.shots, Math.floor((CW - 12) / (TW + 4)), s.n);
      drawFlowWires(null);

      flowPos = new Map([...pos].map(([id, p]) => [id, { x: p.x + CW / 2, y: p.y + CH / 2 }]));
      svg.call(flowZoom).on("dblclick.zoom", null);
      fitFlow(true, "start");
      if (state.errHl) applyHl();
    }
    /**
     * `"start"` (the first view): a readable zoom, anchored at the run's beginning — a large run
     * fit whole is a field of unreadable dots. Otherwise (the Fit button): everything on screen.
     */
    function fitFlow(instant, mode) {
      const svg = d3.select(el.flow).select("svg");
      if (svg.empty() || !flowBounds) return;
      const w = el.flow.clientWidth;
      const h = el.flow.clientHeight;
      const b = flowBounds;
      const fitK = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0)) * 0.95;
      const k = mode === "start" ? Math.max(0.62, Math.min(1, fitK)) : Math.min(1.2, fitK);
      const fits = (b.x1 - b.x0) * k <= w && (b.y1 - b.y0) * k <= h;
      const t = fits
        ? d3.zoomIdentity
            .translate(w / 2 - (k * (b.x0 + b.x1)) / 2, h / 2 - (k * (b.y0 + b.y1)) / 2)
            .scale(k)
        : d3.zoomIdentity.translate(-k * b.x0, -k * b.y0).scale(k);
      (instant ? svg : svg.transition().duration(250)).call(flowZoom.transform, t);
    }

    // ── overview minimap ──
    let ovBrush = null;
    let ovX = null;
    let brushing = false;
    function renderOverview() {
      const svg = d3.select(el.overview);
      svg.selectAll("*").remove();
      const w = el.overview.clientWidth || 220;
      const h = el.overview.clientHeight || 120;
      ovX = d3.scaleLinear().domain(baseX.domain()).range([0, w]);
      const rowH = Math.max(1.5, Math.min(7, (h - 6) / model.nodes.length));
      svg
        .append("g")
        .selectAll("rect")
        .data(model.nodes)
        .join("rect")
        .attr("x", (n) => ovX(n.start))
        .attr("width", (n) => Math.max(1, ovX(n.end) - ovX(n.start)))
        .attr("y", (_n, i) => 3 + i * rowH)
        .attr("height", Math.max(1, rowH - 1))
        .attr("rx", Math.min(2, rowH / 2))
        .attr("fill", (n) => colorOf(n));
      ovBrush = d3
        .brushX()
        .extent([
          [0, 0],
          [w, h],
        ])
        .on("start", (ev) => {
          if (ev.sourceEvent) brushing = true;
        })
        .on("brush end", (ev) => {
          if (ev.type === "end") brushing = false;
          if (!ev.sourceEvent || !ev.selection) return;
          const [a, b] = ev.selection.map(ovX.invert);
          zoomToDomain(a, b);
        });
      svg.append("g").attr("class", "brush").call(ovBrush);
      el.range.textContent = `0s – ${fmtTick(model.span)} (${fmtDur(model.root.duration)} body)`;
      updateOverviewBrush(xz());
    }
    function updateOverviewBrush(x) {
      if (!ovBrush || !ovX || brushing) return;
      const [a, b] = x.domain();
      const s = [Math.max(0, ovX(a)), Math.min(ovX.range()[1], ovX(b))];
      d3.select(el.overview).select("g.brush").call(ovBrush.move, s);
    }

    // ── selection + details ──
    function select(id, tab) {
      state.selected = id;
      if (tab) state.detailOpen.add(tab);
      state.details = true;
      el.main.classList.remove("no-details");
      el.tree
        .querySelectorAll(".row")
        .forEach((r) => r.classList.toggle("selected", r.dataset.id === id));
      if (chartSvg) {
        chartSvg.selectAll("rect.bar").classed("selected", (n) => n.id === id);
        chartSvg.selectAll("g.r").classed("sel", (n) => n.id === id);
      }
      d3.select(el.flow)
        .selectAll("g.flow-card")
        .classed("selected", (n) => n.id === id);
      renderDetails();
    }
    function focusNode(n) {
      const pad = Math.max(n.end - n.start, 50) * 0.08;
      zoomToDomain(n.start - pad, n.end + pad);
    }
    function revealRow(n, block) {
      let p = n.parent;
      let changed = false;
      while (p) {
        if (state.collapsed.delete(p.id)) changed = true;
        p = p.parent;
      }
      if (changed && state.view === "timeline") renderTimeline();
      const row = el.tree.querySelector(`.row[data-id="${CSS.escape(n.id)}"]`);
      if (row) row.scrollIntoView({ block: block || "nearest" });
    }

    /**
     * Bring a gallery item into view in whichever graph is showing: select its node, pin its
     * time, pan (keeping the zoom) so that time is on screen, and pulse its mark.
     */
    function locate(g) {
      if (!g) return;
      locateAt(g.node, g.t, (m) => m.gallery === g, "snapshots");
    }
    /** Select `node` (on `tab`), pin `t` and pan to it, then pulse the marks `matchMark` accepts. */
    function locateAt(node, t0, matchMark, tab) {
      const g = { node, t: t0 };
      if (g.node) select(g.node.id, tab);
      if (state.view === "flow") {
        if (g.node) centerFlowOn(g.node);
        return;
      }
      if (g.t != null) {
        state.pin = g.t;
        const [a, b] = xz().domain();
        if (g.t < a || g.t > b) {
          const k = state.zoom.k;
          const t = d3.zoomIdentity.translate(W / 2 - k * baseX(g.t), 0).scale(k);
          const { z, sel } = activeZoom();
          sel.call(z.transform, t);
        } else redrawX();
      }
      if (g.node && state.view === "timeline") revealRow(g.node, "center");
      flash(matchMark);
    }
    function flash(matchMark) {
      if (chartSvg) {
        chartSvg.selectAll("line.pin").classed("flash", false).node()?.getBoundingClientRect();
        chartSvg.selectAll("line.pin").classed("flash", true);
      }
      if (chartSvg) {
        const hit = chartSvg
          .selectAll("circle.mark")
          .filter((d) => matchMark(d.m) || d.more.some(matchMark));
        hit.classed("flash", false).node()?.getBoundingClientRect();
        hit.classed("flash", true);
      }
      setTimeout(() => d3.selectAll(".flash").classed("flash", false), 1800);
    }
    function centerFlowOn(n) {
      const svg = d3.select(el.flow).select("svg");
      const p = flowPos.get(n.id);
      if (svg.empty() || !p) return;
      const k = Math.max(0.8, d3.zoomTransform(svg.node()).k);
      const t = d3.zoomIdentity
        .translate(el.flow.clientWidth / 2 - k * p.x, el.flow.clientHeight / 2 - k * p.y)
        .scale(k);
      svg.transition().duration(300).call(flowZoom.transform, t);
    }

    function renderDetails() {
      const n = model.byId.get(state.selected) || model.root;
      const color = colorOf(n);
      const call = callOf(n);
      el.details.innerHTML = `
        <div class="dh">Action details <button class="x" title="Close">${svgIcon("close", ' width="16" height="16"')}</button></div>
        <div class="who">
          <span class="icon" style="color:${color};background:${alpha(color, 0.16)}">${svgIcon(iconOf(n))}</span>
          <span class="nm" title="${esc(n.name)}">${esc(displayName(n))}</span>
          <span class="pill"><span class="dot ${n.status}"></span>${esc(n.status)}</span>
        </div>
        <div class="scroll">
          ${call ? `<div class="tcall who-call">${callHtml(n, call)}</div>` : ""}
          <div class="kv">
            <div class="k">Duration</div><div class="v">${fmtDur(n.duration)}</div>
            ${n.v.description ? `<div class="k">Summary</div><div class="v">${esc(n.v.description.summary)}</div>` : ""}
            ${n.v.tags.length ? `<div class="k">Tags</div><div class="v">${chipsHtml(n.v.tags, Infinity, 40)}</div>` : ""}
            ${n.v.mcp ? `<div class="k">MCP</div><div class="v"><span class="badge-inline">${esc(n.v.mcp.mode)}</span></div>` : ""}
            <div class="k">Id</div><div class="v mono-sm">${esc(n.id)}</div>
            ${
              userSite(n)
                ? `<div class="k">${siteLabel(n)}</div><div class="v defined">
              <button class="icon-btn" data-copy-source aria-label="Copy relative path">${svgIcon("copy")}</button>
              ${hasPopup(n) ? `<button class="icon-btn" data-show-code aria-label="Show source">${svgIcon("code")}</button>` : ""}
              <a class="icon-btn" href="${esc(editorUrl(userSite(n)))}" aria-label="Open in VS Code" data-tip-text="Open in VS Code">${svgIcon("external")}</a>
              <span class="defined-name" >${esc(basename(sourceOf(n)))}</span>
            </div>`
                : ""
            }
          </div>
          <div class="acc">${detailSections(n)
            .map((sec) =>
              sec.empty
                ? `<div class="acc-sec empty"><div class="acc-h">${svgIcon("chevron")}<span>${esc(sec.title)}</span><span class="acc-n">0</span></div></div>`
                : `<details class="acc-sec ${sec.key}" data-sec="${sec.key}" ${state.detailOpen.has(sec.key) ? "open" : ""}>
                    <summary class="acc-h">${svgIcon("chevron")}<span>${esc(sec.title)}</span>${sec.count != null ? `<span class="acc-n">${sec.count}</span>` : ""}</summary>
                    <div class="acc-b">${sec.body()}</div>
                  </details>`
            )
            .join("")}</div>
        </div>`;
      const copySrc = el.details.querySelector("[data-copy-source]");
      if (copySrc) {
        copySrc.addEventListener("click", () => copySource(n));
        copySrc.addEventListener("mouseenter", (ev) =>
          showTip(
            ev,
            `<div class="mono">${esc(sourceOf(n))}</div><div class="hint">Click (or press <kbd>C</kbd>) to copy</div>`
          )
        );
        copySrc.addEventListener("mousemove", (ev) => moveTip(ev));
        copySrc.addEventListener("mouseleave", hideTip);
      }
      wireValue(el.details, n);
      const showCode = el.details.querySelector("[data-show-code]");
      if (showCode) {
        showCode.addEventListener("click", (ev) => toggleCode(n, ev));
        showCode.addEventListener("mouseenter", (ev) => showTip(ev, popupTip(n)));
        showCode.addEventListener("mouseleave", hideTip);
      }
      el.details.querySelectorAll("[data-tip-text]").forEach((a) => {
        a.addEventListener("mouseenter", (ev) => showTip(ev, esc(a.dataset.tipText)));
        a.addEventListener("mouseleave", hideTip);
      });
      el.details.querySelector(".x").addEventListener("click", () => {
        state.details = false;
        el.main.classList.add("no-details");
        relayout();
      });
      // which sections are open is a preference: it carries over from action to action
      el.details.querySelectorAll("details[data-sec]").forEach((d) =>
        d.addEventListener("toggle", () => {
          if (d.open) state.detailOpen.add(d.dataset.sec);
          else state.detailOpen.delete(d.dataset.sec);
        })
      );
      wireItems(el.details);
    }

    /** The details panel's accordion: one section per facet of `n`, empty ones shown but shut. */
    function detailSections(n) {
      const errs = model.errors.filter((e) => e.node === n);
      const params = schemaFields(n.v.inputSchema);
      const evs = n.entries.filter((i) => i.kind !== "info" && i.kind !== "link");
      const logs = n.entries.filter((i) => i.kind === "info" || i.kind === "error");
      const lks = model.links.filter((l) => l.from === n || l.to === n);
      const shots = model.gallery.filter((x) => x.node === n);
      const asserts = n.entries.filter((i) => i.kind === "pass" || i.kind === "fail");
      const logLink = `<div class="acc-file">${svgIcon("file", ' width="14" height="14"')}<a href="${esc(fileUrl(n.v.logFile))}" title="${esc(n.v.logFile)}">${esc(basename(n.v.logFile))}</a></div>`;
      return [
        {
          key: "errors",
          title: "Errors",
          count: errs.length,
          empty: !errs.length,
          body: () =>
            errs
              .map((e) => {
                const kind = ERR_TYPES.find(([k]) => k === e.type)[1];
                return `<div class="section-title err-kind ${e.type}">${esc(kind)} <span class="muted">${fmtRel(e.t - n.start)}</span></div><pre class="code err-text">${esc(e.text)}</pre>`;
              })
              .join(""),
        },
        {
          key: "args",
          title: "Args",
          empty: !hasArgs(n) && !params.length,
          body: () =>
            (params.length ? `<div class="params">${params.map(paramHtml).join("")}</div>` : "") +
            (hasArgs(n)
              ? `<div class="code-box">${argsHtml(n)}</div>`
              : '<div class="muted">No arguments.</div>'),
        },
        {
          key: "value",
          title: "Returned",
          empty: !hasValue(n),
          body: () => `<div class="code-box">${valueHtml(n)}</div>`,
        },
        {
          key: "snapshots",
          title: "Snapshots & files",
          count: shots.length,
          empty: !shots.length,
          body: () => `<div class="dshots">${shots.map((g) => shotHtml(g, n)).join("")}</div>`,
        },
        {
          key: "events",
          title: "Events",
          count: evs.length,
          empty: !evs.length,
          body: () => `<ul class="ev-list">${evs.map((i) => evLi(i, n)).join("")}</ul>`,
        },
        {
          key: "links",
          title: "Links",
          count: lks.length,
          empty: !lks.length,
          body: () => linksHtml(n, lks),
        },
        {
          key: "logs",
          title: "Logs",
          count: logs.length,
          empty: !logs.length,
          body: () =>
            `${logLink}<pre class="code">${logs.map((i) => `<span class="muted">${esc(fmtRel(i.t - n.start).padEnd(8))}</span>${esc(i.e.message)}`).join("\n")}</pre>`,
        },
        {
          key: "assertions",
          title: "Assertions",
          count: asserts.length,
          empty: !asserts.length,
          body: () => `<ul class="ev-list">${asserts.map((i) => evLi(i, n)).join("")}</ul>`,
        },
      ];
    }

    /**
     * The details panel's links: what `n` did to other actions and what they did to it. Ref
     * calls fold into one row per (other action, method), with a count and their total time.
     */
    function linksHtml(n, lks) {
      const rows = [];
      const refs = new Map();
      for (const l of lks) {
        if (l.op === "ref") {
          const k = `${l.from.id}\0${l.to.id}\0${l.key}`;
          if (!refs.has(k)) {
            refs.set(k, { l, n: 0, ms: 0 });
            rows.push(refs.get(k));
          }
          const r = refs.get(k);
          r.n++;
          r.ms += l.ms || 0;
        } else rows.push({ l, n: 1, ms: l.ms || 0 });
      }
      const name = (x) => `<b>${esc(displayName(x))}</b>`;
      return `<ul class="ev-list">${rows
        .map(({ l, n: count, ms }) => {
          const out = l.from === n;
          const text =
            l.op === "once"
              ? out
                ? `waited for ${esc(l.key)} on ${name(l.to)} · ${esc(l.outcome)} after ${fmtDur(ms)}`
                : `${name(l.from)} waited for ${esc(l.key)} · ${esc(l.outcome)} after ${fmtDur(ms)}`
              : l.op === "cancel"
                ? out
                  ? `cancelled ${name(l.to)}`
                  : `cancelled by ${name(l.from)}`
                : out
                  ? `${name(l.to)}.${esc(l.key)}() ×${count} · ${fmtDur(ms)}`
                  : `${name(l.from)} called ${esc(l.key)}() ×${count} · ${fmtDur(ms)}`;
          const color = l.op === "cancel" ? css("--cancel") : colorOf(out ? l.to : l.from);
          return `<li data-link="${model.links.indexOf(l)}" style="cursor:pointer">
            <span class="t">${fmtRel(l.t - n.start)}</span>
            <span class="ev-ico" style="background:${alpha(color, 0.2)};color:${color}">${svgIcon(l.op === "cancel" ? "stop" : l.op === "once" ? "pulse" : "code")}</span>
            <span class="m">${out ? "→ " : "← "}${text}</span></li>`;
        })
        .join("")}</ul>`;
    }

    /** A snapshot or file in the details panel: a small thumb with its name and when it landed. */
    function shotHtml(g, n) {
      const i = model.gallery.indexOf(g);
      return `<div class="dshot" data-gallery="${i}" title="${esc(g.name)}">
          ${thumbHtml(g)}
          <span class="nm">${esc(g.name)}</span>
          ${g.t != null ? `<span class="t">${fmtRel(g.t - n.start)}</span>` : ""}
        </div>`;
    }

    function evLi(i, n) {
      const mk = MARK[i.kind] || MARK.event;
      const color = css(mk.color);
      const text = i.kind === "lifecycle" ? i.e.message : i.label;
      return `<li data-item="${i.idx}" style="cursor:pointer">
        <span class="t">${fmtRel(i.t - (n ? n.start : 0))}</span>
        <span class="ev-ico" style="background:${alpha(color, 0.2)};color:${color}">${svgIcon(mk.icon)}</span>
        <span class="m" title="${esc(i.e.message)}">${esc(truncate(text, 140))}</span></li>`;
    }

    function thumbHtml(g) {
      const i = model.gallery.indexOf(g);
      if (g.image)
        return `<div class="thumb" data-gallery="${i}" title="${esc(g.name)}"><img alt="${esc(g.name)}" data-asset="${esc(g.f.asset)}"></div>`;
      const label = g.type === "snapshot" ? "{ }" : g.f.mime.split("/")[1] || "file";
      return `<div class="thumb" data-gallery="${i}" title="${esc(g.name)}"><span class="json-ico">${esc(label)}</span></div>`;
    }

    function wireItems(root) {
      root.querySelectorAll("img[data-asset]").forEach((img) => {
        if (!img.src) img.src = model.asset(img.dataset.asset);
      });
      root
        .querySelectorAll("[data-gallery]")
        .forEach((t) =>
          t.addEventListener("click", () => openGallery(model.gallery[+t.dataset.gallery]))
        );
      root
        .querySelectorAll("[data-link]")
        .forEach((t) => t.addEventListener("click", () => setPin(model.links[+t.dataset.link].t)));
      root
        .querySelectorAll("[data-item]")
        .forEach((t) => t.addEventListener("click", () => openItem(model.items[+t.dataset.item])));
    }

    function openItem(item) {
      if (!item) return;
      setPin(item.t);
      if (item.kind === "link") select(item.node.id, "links");
      else if (item.node && item.node.id !== state.selected) select(item.node.id, "events");
      if (item.gallery) openGallery(item.gallery);
    }
    function setPin(t) {
      state.pin = t;
      redrawX();
    }

    // ── errors: the tab, and highlighting them in the graphs ──
    const ERR_TYPES = [
      ["failure", "Failures", "x"],
      ["assert", "Failed assertions", "alert"],
      ["output", "Error output", "terminal"],
    ];
    /** Failures and failed assertions — what makes a run wrong. Error output alone may be noise. */
    function seriousCount() {
      return model.errors.filter((e) => e.type !== "output").length;
    }
    function errorsShown() {
      return model.errors.filter(
        (e) =>
          (state.errFilter === "all" || e.type === state.errFilter) &&
          matches(e.text, e.node && e.node.v.path, e.source)
      );
    }
    function errorsHtml() {
      if (!model.errors.length)
        return '<div class="muted">No errors: nothing failed, no assertion failed, and nothing wrote error output.</div>';
      const count = (t) => model.errors.filter((e) => t === "all" || e.type === t).length;
      const seg = [["all", "All"], ...ERR_TYPES.map(([k, l]) => [k, l])]
        .filter(([k]) => k === "all" || count(k))
        .map(
          ([k, l]) =>
            `<button class="seg ${state.errFilter === k ? "active" : ""}" data-err-filter="${k}">${l} <span class="muted">${count(k)}</span></button>`
        )
        .join("");
      const shown = errorsShown();
      const sections = ERR_TYPES.map(([type, label, icon]) => {
        const list = shown.filter((e) => e.type === type);
        if (!list.length) return "";
        return `<div class="err-sec"><div class="err-sec-h">${svgIcon(icon)}${label} <span class="muted">${list.length}</span></div>${list.map(errEntryHtml).join("")}</div>`;
      }).join("");
      return `<div class="err-bar"><div class="segs">${seg}</div>
          <button class="btn solo small ${state.errHl ? "active" : ""}" data-err-hl>${svgIcon("locate")}Highlight in graphs</button></div>
        ${sections || '<div class="muted">Nothing matches.</div>'}`;
    }
    function errEntryHtml(e) {
      const open = state.errOpen.has(e.idx);
      const who = e.node ? displayName(e.node) : "run";
      const extra =
        e.type === "output" && e.lines.length > 1
          ? `<span class="err-n">${e.lines.length} lines</span>`
          : "";
      const src =
        e.type === "output" && e.source
          ? `<span class="err-src">${esc(truncate(e.source, 40))}</span>`
          : "";
      return `<div class="err-entry ${e.type}${open ? " open" : ""}" data-err="${e.idx}">
        <div class="err-row">
          <span class="twist ${open ? "open" : ""}">${svgIcon("chevron")}</span>
          <span class="t">${fmtTick(e.t)}</span>
          <span class="who" title="${esc(e.node ? e.node.v.path : "run")}">${esc(truncate(who, 40))}</span>
          ${src}
          <span class="msg" title="${esc(e.title)}">${esc(e.title)}</span>
          ${extra}
          <button class="icon-btn" data-err-locate="${e.idx}" aria-label="Show in graph">${svgIcon("locate")}</button>
          <button class="icon-btn" data-err-copy="${e.idx}" aria-label="Copy">${svgIcon("copy")}</button>
        </div>
        ${open ? `<pre class="code err-text">${esc(e.text)}</pre>` : ""}
      </div>`;
    }
    function wireErrors(body) {
      body.querySelectorAll("[data-err-filter]").forEach((b) =>
        b.addEventListener("click", () => {
          state.errFilter = b.dataset.errFilter;
          refreshErrors();
        })
      );
      const hl = body.querySelector("[data-err-hl]");
      if (hl) hl.addEventListener("click", () => setErrHl(!state.errHl));
      body.querySelectorAll(".err-entry").forEach((row) => {
        const e = model.errors[+row.dataset.err];
        row.querySelector(".err-row").addEventListener("click", (ev) => {
          if (ev.target.closest("button")) return;
          if (state.errOpen.has(e.idx)) state.errOpen.delete(e.idx);
          else state.errOpen.add(e.idx);
          refreshErrors();
        });
        row.querySelector(".err-row").addEventListener("dblclick", () => locateError(e));
        // hovering an entry previews just its action in the graphs
        row.addEventListener("mouseenter", () => e.node && applyHl(new Set([e.node.id])));
        row.addEventListener("mouseleave", () => applyHl());
      });
      body.querySelectorAll("[data-err-locate]").forEach((b) => {
        b.addEventListener("click", () => locateError(model.errors[+b.dataset.errLocate]));
        b.addEventListener("mouseenter", (ev) => showTip(ev, "Show in graph"));
        b.addEventListener("mouseleave", hideTip);
      });
      body
        .querySelectorAll("[data-err-copy]")
        .forEach((b) =>
          b.addEventListener("click", () =>
            copy(model.errors[+b.dataset.errCopy].text, "Copied the error")
          )
        );
    }
    function refreshErrors() {
      if (state.lowerTab !== "errors") return;
      const body = el.lower.querySelector(".body");
      const top = body.scrollTop;
      body.innerHTML = errorsHtml();
      wireLower();
      body.scrollTop = top;
    }
    function setErrHl(on) {
      state.errHl = on;
      refreshErrors();
      applyHl();
    }
    function openErrors(highlight) {
      state.lowerTab = "errors";
      renderLower();
      if (highlight) setErrHl(true);
    }
    function locateError(e) {
      if (!e) return;
      const items = new Set(e.items);
      locateAt(e.node, e.t, (m) => items.has(m), "errors");
      if (e.node) applyHl(new Set([e.node.id]), 1600);
    }
    /**
     * Mark error nodes in every graph: red on the nodes that errored, a lighter mark on their
     * ancestors (the path to them), everything else dimmed. With no `only`, the highlight
     * follows the toggle; `only` previews a set (an entry being hovered), and `ms` makes that
     * preview lapse back to the toggle's state.
     */
    let hlTimer = 0;
    function applyHl(only, ms) {
      clearTimeout(hlTimer);
      const set = only || (state.errHl ? model.errNodes : null);
      const path = only ? pathOf(only) : model.errPath;
      app.classList.toggle("hl-on", !!set);
      const mark = (sel, idOf) =>
        sel
          .classed("err", (d) => !!set && set.has(idOf(d)))
          .classed("err-path", (d) => !!set && path.has(idOf(d)));
      if (chartSvg) mark(chartSvg.selectAll("g.r"), (n) => n.id);
      mark(d3.select(el.flow).selectAll("g.flow-card"), (n) => n.id);
      el.tree.querySelectorAll(".row").forEach((r) => {
        r.classList.toggle("err", !!set && set.has(r.dataset.id));
        r.classList.toggle("err-path", !!set && path.has(r.dataset.id));
      });
      if (ms) hlTimer = setTimeout(() => applyHl(), ms);
    }
    function pathOf(ids) {
      const out = new Set();
      for (const id of ids) for (let p = model.byId.get(id)?.parent; p; p = p.parent) out.add(p.id);
      return out;
    }

    // ── lower panel ──
    function renderLower() {
      const tabs = [
        ["snapshots", `Snapshots (${model.gallery.length})`],
        [
          "errors",
          `Errors <span class="tab-count${seriousCount() ? " bad" : model.errors.length ? " warn" : ""}">${model.errors.length}</span>`,
        ],
        ["logs", "Logs"],
        ["asserts", `Assertions (${model.asserts.length})`],
        ["events", "Timeline events"],
      ];
      el.lower.innerHTML = `<div class="tabs">${tabs
        .map(
          ([k, l]) =>
            `<button class="tab ${state.lowerTab === k ? "active" : ""}" data-tab="${k}">${l}</button>`
        )
        .join(
          ""
        )}<span class="spacer"></span><input class="filter" placeholder="Filter…" value="${esc(state.filter)}"></div>
        <div class="body">${lowerBodyHtml()}</div>`;
      el.lower.querySelectorAll(".tab").forEach((b) =>
        b.addEventListener("click", () => {
          state.lowerTab = b.dataset.tab;
          renderLower();
        })
      );
      const input = el.lower.querySelector(".filter");
      input.addEventListener("input", () => {
        state.filter = input.value;
        el.lower.querySelector(".body").innerHTML = lowerBodyHtml();
        wireLower();
      });
      wireLower();
    }
    function wireLower() {
      const body = el.lower.querySelector(".body");
      if (state.lowerTab === "errors") wireErrors(body);
      wireItems(body);
      body
        .querySelectorAll("tr[data-row]")
        .forEach((tr) =>
          tr.addEventListener("click", () => openItem(model.items[+tr.dataset.row]))
        );
      body.querySelectorAll("[data-locate]").forEach((b) => {
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          locate(model.gallery[+b.dataset.locate]);
        });
        b.addEventListener("mouseenter", (ev) =>
          showTip(ev, `Show in the ${state.view === "flow" ? "flow" : "graph"}`)
        );
        b.addEventListener("mouseleave", hideTip);
      });
    }
    function matches(...parts) {
      const q = state.filter.trim().toLowerCase();
      return (
        !q ||
        parts.some((p) =>
          String(p || "")
            .toLowerCase()
            .includes(q)
        )
      );
    }
    function lowerBodyHtml() {
      const tab = state.lowerTab;
      if (tab === "errors") return errorsHtml();
      if (tab === "snapshots") {
        const g = model.gallery.filter((x) => matches(x.name, x.node && x.node.v.path));
        if (!g.length)
          return '<div class="muted">No snapshots, artifacts, or images in this run.</div>';
        return `<div class="gallery">${g
          .map((x) => {
            const sub =
              x.type === "snapshot"
                ? `snapshot · ${x.node ? esc(displayName(x.node)) : ""}`
                : `${esc(x.f.mime)} · ${fmtSize(x.f.size)}${x.f.omitted ? " · not embedded" : ""}`;
            const at =
              x.t != null || x.node
                ? `<button class="icon-btn locate" data-locate="${model.gallery.indexOf(x)}" aria-label="Show in graph">${svgIcon("locate")}</button>`
                : "";
            return `<div class="gal-item">${thumbHtml(x)}<div class="cap"><span class="t">${x.t == null ? "–" : fmtTick(x.t)}</span><span class="n" title="${esc(x.name)}">${esc(x.name)}</span>${at}</div><div class="sz">${sub}</div></div>`;
          })
          .join("")}</div>`;
      }
      const pick =
        tab === "logs"
          ? (i) => i.kind === "info" || i.kind === "error"
          : tab === "asserts"
            ? (i) => i.kind === "pass" || i.kind === "fail"
            : (i) => i.kind !== "info" && !(i.kind === "link" && i.e.link && i.e.link.op === "ref");
      const rows = [];
      for (let idx = 0; idx < model.items.length; idx++) {
        const i = model.items[idx];
        if (!pick(i)) continue;
        if (!matches(i.e.message, i.e.path, i.e.source)) continue;
        rows.push({ i, idx });
        if (rows.length >= 3000) break;
      }
      if (!rows.length)
        return `<div class="muted">${tab === "asserts" ? "No assertions in this run." : "Nothing matches."}</div>`;
      return `<table class="list"><tbody>${rows
        .map(({ i, idx }) => {
          const mk = MARK[i.kind];
          const ico = mk
            ? `<span class="ev-ico" style="background:${alpha(css(mk.color), 0.2)};color:${css(mk.color)}">${svgIcon(mk.icon)}</span>`
            : "";
          return `<tr data-row="${idx}" class="${i.kind === "error" || i.kind === "fail" ? "err" : ""}"><td class="t">${fmtTick(i.t)}</td><td>${ico}</td><td class="p" title="${esc(i.e.path)}">${esc(i.node ? displayName(i.node) : i.e.path)}</td><td class="m">${esc(i.e.message)}</td></tr>`;
        })
        .join(
          ""
        )}</tbody></table>${rows.length >= 3000 ? '<div class="muted">First 3000 rows — narrow with the filter.</div>' : ""}`;
    }

    // ── modal ──
    function openGallery(g) {
      if (!g) return;
      if (g.t != null) setPin(g.t);
      let body;
      let actions = "";
      const pathOf = g.type === "file" ? g.f.file : g.s.file;
      if (g.type === "file" && g.image) {
        const src = model.asset(g.f.asset);
        body = `<img alt="${esc(g.name)}" src="${src}">`;
        actions = `<a class="btn solo" download="${esc(basename(g.f.file))}" href="${src}">${svgIcon("download")}Download</a>`;
      } else if (g.type === "file") {
        body =
          g.f.text != null
            ? `<pre class="code">${esc(g.f.text)}</pre>`
            : `<div class="muted">Not embedded (${esc(g.f.omitted || "binary")}). Open it from the run folder.</div>`;
      } else {
        body = `<pre class="code">${esc(g.s.value !== undefined ? json(g.s.value) : g.s.text)}</pre>${g.s.truncated ? '<div class="muted">Truncated — the snapshot file holds the rest.</div>' : ""}`;
      }
      const sub = [
        g.t != null ? fmtRel(g.t) : null,
        g.node ? g.node.v.path : null,
        g.type === "file" ? fmtSize(g.f.size) : "snapshot",
      ]
        .filter(Boolean)
        .join(" · ");
      const m = document.createElement("div");
      m.className = "modal";
      m.innerHTML = `<div class="box"><div class="mh"><span class="nm">${esc(g.name)} <span class="muted" style="font-weight:400">${esc(sub)}</span></span>
        ${actions}
        <a class="btn solo" href="${esc(fileUrl(pathOf))}">${svgIcon("file")}Open</a>
        <button class="btn solo" data-copy>${svgIcon("copy")}Copy path</button>
        <button class="btn solo" data-close title="Close">${svgIcon("close")}</button></div>
        <div class="mb">${body}</div></div>`;
      const close = () => {
        m.remove();
        document.removeEventListener("keydown", onKey);
      };
      const onKey = (e) => e.key === "Escape" && close();
      m.addEventListener("click", (e) => e.target === m && close());
      m.querySelector("[data-close]").addEventListener("click", close);
      m.querySelector("[data-copy]").addEventListener("click", () => copy(pathOf));
      document.addEventListener("keydown", onKey);
      document.body.appendChild(m);
      if (g.node && g.node.id !== state.selected) select(g.node.id);
    }

    function openMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const m = document.createElement("div");
      m.className = "menu";
      m.style.top = `${r.bottom + 6}px`;
      m.style.right = `${window.innerWidth - r.right}px`;
      m.innerHTML = `<button data-a="theme">${svgIcon("sun", ' width="14" height="14"')} Toggle light / dark</button>
        <button data-a="data">${svgIcon("download", ' width="14" height="14"')} Download run data (JSON)</button>
        <button data-a="folder">${svgIcon("copy", ' width="14" height="14"')} Copy run folder path</button>
        <button data-a="expand">Expand all</button>
        <button data-a="collapse">Collapse all</button>`;
      const close = () => {
        m.remove();
        document.removeEventListener("mousedown", away, true);
      };
      const away = (e) => !m.contains(e.target) && close();
      m.addEventListener("click", (e) => {
        const a = e.target.closest("button")?.dataset.a;
        close();
        if (a === "theme") {
          toggleTheme();
          renderAll();
          renderDetails();
          renderLower();
        }
        if (a === "data")
          download(
            `${model.data.name}-run.json`,
            JSON.stringify(model.data, null, 2),
            "application/json"
          );
        if (a === "folder") copy(model.data.folder);
        if (a === "expand") {
          state.collapsed.clear();
          renderAll();
        }
        if (a === "collapse") {
          for (const n of model.nodes)
            if (n.depth >= 1 && n.children.length) state.collapsed.add(n.id);
          renderAll();
        }
      });
      document.addEventListener("mousedown", away, true);
      document.body.appendChild(m);
    }

    // ── tooltips ──
    /** Click selects, double-click focuses, hover explains — the same on every node mark. */
    function bindNode(sel) {
      sel
        .on("click", (ev, n) => {
          ev.stopPropagation();
          select(n.id);
        })
        .on("dblclick", (ev, n) => {
          ev.stopPropagation();
          focusNode(n);
        })
        .on("mouseenter", (ev, n) => showTip(ev, nodeTip(n), true))
        .on("mousemove", (ev) => moveTip(ev))
        .on("mouseleave", hideTip);
    }
    function nodeTip(n) {
      hovered = n; // the node `C` copies while its tooltip is up
      const v = n.v;
      const shown = n.depth === 0 ? model.data.name : displayName(n);
      const call = callOf(n);
      const meta = [
        `<span class="dot ${n.status}"></span>${esc(n.status)}`,
        esc(fmtDur(n.duration)),
        n.depth === 0 ? "om" : v.kind === "step" ? "step" : "",
        v.mcp ? `<span class="mcp">MCP · ${esc(v.mcp.mode)}</span>` : "",
      ].filter(Boolean);
      const fails = model.run.failures.filter(
        (f) => f.action === n.id || f.action === n.name || f.action === v.path
      );
      return `<div class="tt">${esc(shown)}</div>
        ${call ? `<div class="tcall">${callHtml(n, call)}</div>` : ""}
        <div class="tmeta">${meta.join('<span class="sep">·</span>')}</div>
        ${v.description ? `<div class="summary">${esc(truncate(v.description.summary, 240))}</div>` : ""}
        ${chipsHtml(v.tags, TIP_TAGS, 28)}
        ${fails.length ? `<div class="tfail">${esc(truncate(String(fails[0].error).split(String.fromCharCode(10))[0], 160))}</div>` : ""}`;
    }
    function galleryTip(x) {
      const img = x.image ? `<img src="${model.asset(x.f.asset)}" alt="">` : "";
      const body =
        x.type === "snapshot"
          ? `<div class="mono small">${esc(truncate(x.s.value !== undefined ? oneLine(x.s.value) : x.s.text || "", 200))}</div>`
          : `<div class="ts">${esc(x.f.mime)} · ${fmtSize(x.f.size)}</div>`;
      return `<div class="tt">${esc(x.name)}${x.t != null ? ` · ${fmtRel(x.t)}` : ""}</div>${img}${body}`;
    }
    /** The om itself: its node tooltip, plus where the run's record lives. */
    function omTip() {
      return `${nodeTip(model.root)}<div class="sec">Run folder</div><div class="mono small">${esc(model.data.folder)}</div>`;
    }
    function markTip(d) {
      const m = d.m;
      if (m.kind === "link") {
        return (
          linkTip(m.link) +
          (d.more.length
            ? `<div class="ts" style="margin-top:4px">+${d.more.length} more within a few ms</div>`
            : "")
        );
      }
      const mk = MARK[m.kind] || MARK.event;
      const img =
        m.gallery && m.gallery.image ? `<img src="${model.asset(m.gallery.f.asset)}" alt="">` : "";
      const more = d.more.length
        ? `<div class="ts">+${d.more.length} more within a few ms</div>`
        : "";
      const extra =
        m.gallery && m.gallery.image
          ? `<div class="ts">${esc(m.gallery.f.rel)} · ${fmtSize(m.gallery.f.size)}</div>`
          : "";
      return `<div class="tt">${esc(mk.label)} · ${fmtRel(m.t)}</div>${img}<div>${esc(truncate(m.kind === "snapshot" || m.kind === "artifact" ? m.label : m.e.message, 260))}</div>${extra}${more}`;
    }
    // ── source popover (the <> buttons) — click-toggled, like the tskb explorer's ──
    const codeEl = document.createElement("div");
    codeEl.className = "code-pop";
    codeEl.hidden = true;
    document.body.appendChild(codeEl);
    let codeFor = null;
    let codeTab = null;
    let codeAway = null;
    /** A site inside omkit or an installed package — library source, not the user's. */
    function isLib(site) {
      return !!(site && model.data.library && model.data.library.includes(site));
    }
    /**
     * The site worth showing for `n`: where it is defined, unless that is library source (a
     * battery, a prompt), in which case the user's call that launched it.
     */
    function userSite(n) {
      const { definedAt, calledAt } = n.v;
      if (definedAt && !isLib(definedAt)) return definedAt;
      if (calledAt && !isLib(calledAt)) return calledAt;
      return definedAt || calledAt;
    }
    function siteLabel(n) {
      return userSite(n) === n.v.definedAt ? "Defined at" : "Called at";
    }
    function codeOf(site) {
      return site && model.data.code ? model.data.code[site] : undefined;
    }
    /**
     * How the user's code launched `n`, read off the source at its call site: the variable it
     * was bound to and the callee — `page = chromePage(…)`. Sites carry a line but no column,
     * so this takes the first call on that line; null when the site is library source.
     */
    function callExpr(n) {
      const site = n.v.calledAt;
      const c = site && !isLib(site) && codeOf(site);
      if (!c) return null;
      const at = Number((/:(\d+)$/.exec(site) || [])[1]);
      const lines = c.text.split("\n");
      const line = lines[at - c.start];
      if (line == null) return null;
      let call = null;
      for (const m of line.matchAll(
        /(?:^|[^\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g
      )) {
        if (!/^(if|for|while|switch|return|catch|function|await|typeof|new|async)$/.test(m[1])) {
          call = { callee: m[1], index: m.index };
          break;
        }
      }
      if (!call) return null;
      const DECL = /\b(?:const|let|var)\s+([\w$]+|\{[^}]*\}|\[[^\]]*\])/;
      const prefix = line.slice(0, call.index);
      const prev = lines[at - c.start - 1] || "";
      const m =
        DECL.exec(prefix) ||
        /^\s*([\w$.]+)\s*=(?!=)/.exec(prefix) ||
        (/^\s*(?:await\s+)?$/.test(prefix) && /=\s*(?:await\s*)?$/.test(prev)
          ? DECL.exec(prev)
          : null);
      return { callee: call.callee, bind: m ? m[1].replace(/\s+/g, " ") : "" };
    }
    /** The popover's tabs for `n`: what it is (prompt, source), then what went in and came out. */
    function codeTabs(n) {
      const tabs = [];
      if (promptOf(n)) tabs.push({ key: "prompt", label: "Prompt" });
      const mine = userSite(n);
      if (codeOf(mine))
        tabs.push({
          key: "user",
          label: siteLabel(n) === "Called at" ? "Call site" : "Source",
          site: mine,
        });
      const def = n.v.definedAt;
      if (def && def !== mine && codeOf(def))
        tabs.push({
          key: "def",
          label: isLib(def) ? "Definition (omkit)" : "Definition",
          site: def,
        });
      if (hasArgs(n)) tabs.push({ key: "args", label: "Args" });
      if (hasValue(n)) tabs.push({ key: "value", label: "Returned" });
      return tabs;
    }
    function hasCode(n) {
      return codeTabs(n).some((t) => t.key !== "value" && t.key !== "args");
    }
    const callMemo = new Map();
    /** {@link callExpr}, once per node — bar labels ask on every redraw. */
    function callOf(n) {
      if (!callMemo.has(n.id)) callMemo.set(n.id, n.depth === 0 ? null : callExpr(n));
      return callMemo.get(n.id);
    }
    /**
     * An action box's label: the call that launched it, as the tooltip shows it —
     * `watchBuildDirectory = watchDir(…)` — then omkit's name when the callee does not already
     * say it (`command(…) · npm run dev`). Just the name when the call is unknown.
     */
    function boxLabel(n) {
      const c = callOf(n);
      if (!c) return displayName(n);
      const call = `${c.bind ? `${c.bind} = ` : ""}${c.callee}(${hasArgs(n) ? "…" : ""})`;
      return c.callee === displayName(n) ? call : `${call} · ${displayName(n)}`;
    }
    function labelHtml(n) {
      const c = callOf(n);
      if (!c) return esc(displayName(n));
      const name =
        c.callee === displayName(n) ? "" : `<span class="sep"> · </span>${esc(displayName(n))}`;
      return `<span class="tcall">${callHtml(n, c)}</span>${name}`;
    }
    /** `page = chromePage(…)`, from {@link callExpr}. */
    function callHtml(n, call) {
      return `${call.bind ? `<span class="b">${esc(call.bind)}</span> = ` : ""}<span class="f">${esc(call.callee)}</span>(${hasArgs(n) ? "…" : ""})`;
    }
    function hasPopup(n) {
      return codeTabs(n).length > 0;
    }
    function popupTip(n) {
      return codeTabs(n)
        .map((t) => esc(t.label))
        .join(" · ");
    }
    function hasArgs(n) {
      return !!(n.v.args && n.v.args.length);
    }
    function argsOf(n) {
      return n.v.args.length === 1 ? n.v.args[0] : n.v.args;
    }
    function relOf(site) {
      return (
        (model.data.sources && model.data.sources[site]) || String(site).replace(/:\d+(:\d+)?$/, "")
      );
    }
    function hasValue(n) {
      return n.v.value !== undefined || !!n.v.valueNote;
    }
    /** A value in the code view: pretty JSON, highlighted, numbered, copyable. */
    function jsonHtml(value, what) {
      const text = json(value);
      const lines = highlight(text);
      const kind = Array.isArray(value)
        ? `array · ${value.length} items`
        : value === null
          ? "null"
          : typeof value === "object"
            ? `object · ${Object.keys(value).length} keys`
            : typeof value;
      return `<div class="cp-tools"><span class="muted">${esc(kind)} · ${lines.length} line${lines.length > 1 ? "s" : ""} · ${fmtSize(text.length)}</span>
          <button class="btn solo small" data-a="copy-json" data-what="${what}">${svgIcon("copy")}Copy JSON</button></div>
        <div class="cp-code">${lines
          .map(
            (html, i) =>
              `<div class="cl"><span class="ln">${i + 1}</span><span class="lc">${html || " "}</span></div>`
          )
          .join("")}</div>`;
    }
    function valueHtml(n) {
      if (n.v.value === undefined) {
        return `<div class="pp"><div class="muted">${esc(n.v.valueNote || "Returned nothing.")}</div></div>`;
      }
      return jsonHtml(n.v.value, "value");
    }
    function argsHtml(n) {
      return hasArgs(n)
        ? jsonHtml(argsOf(n), "args")
        : '<div class="pp"><div class="muted">No arguments.</div></div>';
    }
    function wireValue(root, n) {
      root
        .querySelectorAll('[data-a="copy-json"]')
        .forEach((b) =>
          b.addEventListener("click", () =>
            b.dataset.what === "args"
              ? copy(json(argsOf(n)), "Copied the args")
              : copy(json(n.v.value), "Copied the returned value")
          )
        );
    }
    function codeHtml(site) {
      const c = codeOf(site);
      const line = Number((/:(\d+)(?::\d+)?$/.exec(site) || [])[1]);
      const lines = highlight(c.text).map(
        (html, i) =>
          `<div class="cl${c.start + i === line ? " at" : ""}"><span class="ln">${c.start + i}</span><span class="lc">${html || " "}</span></div>`
      );
      return `<div class="cp-code">${lines.join("")}</div>${c.truncated ? '<div class="muted cp-more">Cut short — open the file for the rest.</div>' : ""}`;
    }
    function promptHtml(p) {
      const choices =
        p.choices && p.choices.length
          ? `<div class="pp-k">Choices</div><div class="pp-v"><ol class="pp-choices">${p.choices
              .map((c) => {
                const value = typeof c === "string" ? c : c.value;
                const label = typeof c === "string" ? c : c.label;
                const picked = p.answer && p.answer.value === value;
                return `<li class="${picked ? "picked" : ""}">${esc(label)}${label !== value ? ` <span class="muted">(${esc(value)})</span>` : ""}</li>`;
              })
              .join("")}</ol></div>`
          : "";
      const answer = p.answer
        ? `<div class="pp-answer"><span class="pp-k">Answer</span><pre class="code">${esc(typeof p.answer.value === "string" ? p.answer.value : json(p.answer.value))}</pre>${
            p.answer.via ? `<span class="badge-inline">via ${esc(p.answer.via)}</span>` : ""
          }</div>`
        : '<div class="muted">No answer recorded.</div>';
      return `<div class="pp">
        <div class="pp-q">${esc(p.message || "(no message)")}</div>
        ${p.hint ? `<div class="mono small">${esc(p.hint)}</div>` : ""}
        <div class="pp-grid">
          <div class="pp-k">Kind</div><div class="pp-v">${esc(p.kind)}</div>
          ${p.def !== undefined ? `<div class="pp-k">Default</div><div class="pp-v mono">${esc(oneLine(p.def))}</div>` : ""}
          ${p.timeoutMs !== undefined ? `<div class="pp-k">Timeout</div><div class="pp-v">${p.timeoutMs > 0 && isFinite(p.timeoutMs) ? fmtDur(p.timeoutMs) : "none"}</div>` : ""}
          ${choices}
        </div>
        ${answer}
      </div>`;
    }
    function toggleCode(n, ev, want, toggle) {
      // the <> closes whatever is open on its node; the return button closes only its own tab
      if (codeFor === n.id && (!want || (toggle && codeTab === want))) return closeCode();
      const tabs = codeTabs(n);
      if (!tabs.length) return;
      const tab =
        tabs.find((t) => t.key === want) ||
        tabs.find((t) => t.key !== "value" && t.key !== "args") ||
        tabs[0];
      codeTab = tab.key;
      hideTip();
      const reopen = codeFor !== n.id;
      codeFor = n.id;
      const site = tab.site || userSite(n);
      const rel = site ? relOf(site) : "";
      const line = site ? (/:(\d+)(?::\d+)?$/.exec(site) || [])[1] : "";
      codeEl.innerHTML = `<div class="cp-head">
          ${
            site
              ? `<span class="cp-path" title="${esc(site)}">${esc(rel)}<span class="muted">${line ? ":" + line : ""}</span></span>
          <button class="icon-btn" data-a="copy" aria-label="Copy path">${svgIcon("copy")}</button>
          <a class="icon-btn" href="${esc(editorUrl(site))}" aria-label="Open in VS Code">${svgIcon("external")}</a>`
              : ""
          }
          <span class="cp-name">${esc(displayName(n))}</span>
          <button class="icon-btn" data-a="close" aria-label="Close">${svgIcon("close")}</button>
        </div>
        ${tabs.length > 1 ? `<div class="cp-tabs">${tabs.map((t) => `<button class="tab ${t === tab ? "active" : ""}" data-tab="${t.key}">${esc(t.label)}</button>`).join("")}</div>` : ""}
        <div class="cp-body">${
          tab.key === "prompt"
            ? promptHtml(promptOf(n))
            : tab.key === "value"
              ? valueHtml(n)
              : tab.key === "args"
                ? argsHtml(n)
                : codeHtml(site)
        }</div>`;
      wireValue(codeEl, n);
      const cp = codeEl.querySelector('[data-a="copy"]');
      if (cp) cp.addEventListener("click", () => copy(rel, `Copied ${rel}`));
      codeEl.querySelector('[data-a="close"]').addEventListener("click", closeCode);
      codeEl
        .querySelectorAll(".cp-tabs .tab")
        .forEach((b) => b.addEventListener("click", () => toggleCode(n, null, b.dataset.tab)));
      codeEl.hidden = false;
      if (reopen) {
        const x = ev && ev.clientX != null ? ev.clientX : window.innerWidth / 2;
        const y = ev && ev.clientY != null ? ev.clientY : window.innerHeight / 3;
        const w = codeEl.offsetWidth;
        const h = Math.min(codeEl.offsetHeight, window.innerHeight * 0.7);
        const left = x + 14 + w > window.innerWidth - 8 ? x - w - 14 : x + 14;
        const top = y + 14 + h > window.innerHeight - 8 ? y - h - 14 : y + 14;
        codeEl.style.left = `${Math.max(8, left)}px`;
        codeEl.style.top = `${Math.max(8, top)}px`;
      }
      const at = codeEl.querySelector(".cl.at");
      if (at) at.scrollIntoView({ block: "center" });
      if (codeAway) document.removeEventListener("mousedown", codeAway, true);
      codeAway = (e) => {
        if (!codeEl.contains(e.target) && !e.target.closest(".code-btn, [data-show-code]"))
          closeCode();
      };
      setTimeout(() => codeAway && document.addEventListener("mousedown", codeAway, true), 0);
    }
    function closeCode() {
      codeFor = null;
      codeEl.hidden = true;
      if (codeAway) document.removeEventListener("mousedown", codeAway, true);
      codeAway = null;
    }
    let tipTimer = 0;
    let hovered = null;
    /** The file worth opening for `n` (see {@link userSite}), relative to the project root — no line. */
    function sourceOf(n) {
      const site = userSite(n);
      return site ? relOf(site) : "";
    }
    function copySource(n) {
      const src = n && sourceOf(n);
      if (src) copy(src, `Copied ${src}`);
    }
    let lastEv = null;
    function showTip(ev, html, wide, delay) {
      clearTimeout(tipTimer);
      lastEv = ev;
      const open = () => {
        tip.innerHTML = html;
        tip.classList.toggle("wide", !!wide);
        tip.hidden = false;
        moveTip(lastEv);
      };
      if (delay && tip.hidden) tipTimer = setTimeout(open, delay);
      else open();
    }
    function moveTip(ev) {
      lastEv = ev;
      if (tip.hidden) return;
      const pad = 14;
      const r = tip.getBoundingClientRect();
      let x = ev.clientX + pad;
      let y = ev.clientY + pad;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    }
    function hideTip() {
      hovered = null;
      clearTimeout(tipTimer);
      tip.hidden = true;
    }

    // ── render orchestration ──
    function renderAll() {
      measure();
      if (state.view === "timeline") renderTimeline();
      if (state.view === "flow") renderFlow();
      renderOverview();
    }
    function relayout() {
      const keep = state.zoom;
      measure();
      state.zoom = keep;
      renderAll();
    }
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(relayout, 120);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && codeFor) return closeCode();
      if (e.target.closest && e.target.closest("input")) return;
      if (e.key === "+" || e.key === "=") zoomBy(1.6);
      else if (e.key === "-") zoomBy(1 / 1.6);
      else if (e.key === "0") fit();
      else if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        copySource(hovered || model.byId.get(state.selected));
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const rows = visible();
        const i = rows.findIndex((n) => n.id === state.selected);
        const next =
          rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next) {
          e.preventDefault();
          select(next.id);
          revealRow(next);
        }
      }
    });

    setView("timeline");
    renderDetails();
    renderLower();
  }

  // ── shell markup ─────────────────────────────────────────
  function shellHtml(model) {
    const run = model.run;
    const ok = run.ok;
    const a = run.assertions;
    const total = a.passed + a.failed;
    const assertText = total ? `${a.passed} / ${total} assertions passed` : "no assertions";
    const serious = model.errors.filter((e) => e.type !== "output").length;
    const output = model.errors.length - serious;
    const parts = [
      serious ? `${serious} error${serious > 1 ? "s" : ""}` : "",
      output ? `${output} error output` : "",
    ].filter(Boolean);
    const fails = parts.length
      ? `<span class="sep">•</span><button class="linkish ${serious ? "bad" : "warn"}" id="go-errors" title="Open the Errors tab and highlight them in the graphs">${parts.join(" · ")}</button>`
      : "";
    const windows = [0, 100, 500, 1000, 5000, 10000, 30000, 60000, 300000].filter(
      (w) => w === 0 || w < model.span
    );
    return `
      <header class="top">
        <div class="titles">
          <div class="title-row">
            <h1 title="${esc(model.data.folder)}">Run: ${esc(model.data.name)}</h1>
            <button class="info-btn" id="om-info" aria-label="About this om">${svgIcon("info")}</button>
          </div>
          <div class="meta"><span class="dot ${ok ? "ok" : "failed"}"></span><span>${ok ? "passed" : "failed"}</span>
            <span class="sep">•</span><span>${fmtDate(run.startedAt)}</span>
            <span class="sep">•</span><span title="body ${fmtDur(run.duration)} · record ${fmtDur(model.span)}">${fmtDur(run.duration)}</span>
            <span class="sep">•</span><span>${model.nodes.length} action${model.nodes.length > 1 ? "s" : ""}</span>
            <span class="sep">•</span><span>${assertText}</span>${fails}
          </div>
        </div>
        <div class="btn-group">
          <button class="btn active" data-view="timeline">${svgIcon("timeline")}Timeline + Graph</button>
          <button class="btn" data-view="flow">${svgIcon("flow")}Flow</button>
        </div>
        <div class="btn-group">
          <button class="btn" id="zout" title="Zoom out (-)">${svgIcon("zoomOut")}</button>
          <button class="btn" id="zin" title="Zoom in (+)">${svgIcon("zoomIn")}</button>
          <button class="btn" id="fit" title="Fit (0)">Fit</button>
        </div>
        <select id="window" class="btn solo" title="Visible window">
          ${windows.map((w) => `<option value="${w}">${w ? fmtTick(w) : "window"}</option>`).join("")}
        </select>
        <button class="btn solo" id="more" title="More">${svgIcon("more")}</button>
      </header>
      <div class="main">
        <section class="card timeline" style="--tree-w:360px;--row-h:${ROW_H}px;position:relative">
          <div class="tl-head">
            <div class="cols"><div>Action / Event</div></div>
            <svg></svg>
          </div>
          <div class="tl-body"><div class="tree"></div><div class="chart"></div></div>
          <div class="flow-view" hidden></div>
          <button class="info-btn legend-btn" id="legend-btn" aria-label="Legend" aria-expanded="false" title="Legend">${svgIcon("info")}</button>
          <div class="legend legend-pop" id="legend" hidden>
          <h3>Legend</h3>
          <div class="grid2">
            ${legendItem("--c1", "Action run", "bar")}
            ${legendItem("--c2", "Snapshot", "dot")}
            ${legendItem("--c3", "Process event", "dot")}
            ${legendItem("--c6", "Artifact", "dot")}
            ${legendItem("--ok", "Assert passed", "dot")}
            ${legendItem("--fail", "Failure / error", "dot")}
            ${legendItem("--cancel", "Cancelled", "dash")}
            ${legendItem("--accent", "Pinned time", "line")}
            ${legendItem("--text-2", "Wait · cancel · ref call", "ring")}
          </div>
          <div class="muted" style="margin-top:12px;font-size:11px">Ctrl + wheel to zoom · drag to pan · double-click a bar to focus · ↑/↓ to step</div>
          </div>
        </section>
        <aside class="card details"></aside>
      </div>
      <div class="bottom">
        <section class="card lower"></section>
        <section class="card overview"><h3>Overview</h3><div class="range"></div><svg></svg></section>
      </div>`;
  }
  function legendItem(color, label, shape) {
    const c = `var(${color})`;
    const sw =
      shape === "bar"
        ? `<span style="width:16px;height:9px;border-radius:3px;background:${c}"></span>`
        : shape === "ring"
          ? `<span class="dot" style="width:11px;height:11px;background:var(--panel);box-shadow:inset 0 0 0 2px ${c}"></span>`
          : shape === "dash"
            ? `<span style="width:16px;height:0;border-top:2px dashed ${c}"></span>`
            : shape === "line"
              ? `<span style="width:2px;height:14px;background:${c};margin:0 7px"></span>`
              : `<span class="dot" style="background:${c};width:11px;height:11px"></span>`;
    return `<div class="li">${sw}${esc(label)}</div>`;
  }

  // ── helpers ──────────────────────────────────────────────
  function colorOf(n) {
    return n.branch < 0 ? css("--c1") : css(PALETTE[n.branch]);
  }
  function statusVar(s) {
    return s === "ok"
      ? "--ok"
      : s === "failed"
        ? "--fail"
        : s === "cancelled"
          ? "--cancel"
          : "--running";
  }
  function alpha(color, a) {
    const c = d3.color(color);
    if (!c) return color;
    c.opacity = a;
    return c.formatRgb();
  }
  const KEYWORDS = new Set(
    "abstract as async await break case catch class const continue default delete do else enum export extends false finally for from function get if implements import in instanceof interface keyof let new null of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined var void while yield".split(
      " "
    )
  );
  const TOKEN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b)|([A-Za-z_$][\w$]*)/g;
  /** Highlighted HTML per source line. Tokens that span lines are closed and reopened at each break. */
  function highlight(text) {
    const parts = [];
    let last = 0;
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) {
      if (m.index > last) parts.push([null, text.slice(last, m.index)]);
      let cls = null;
      if (m[1]) cls = "tk-c";
      else if (m[2])
        cls = /^\s*:/.test(text.slice(TOKEN.lastIndex, TOKEN.lastIndex + 8)) ? "tk-p" : "tk-s";
      else if (m[3]) cls = "tk-n";
      else if (m[4]) {
        if (KEYWORDS.has(m[4])) cls = "tk-k";
        else if (/^\s*\(/.test(text.slice(TOKEN.lastIndex, TOKEN.lastIndex + 40))) cls = "tk-f";
        else if (/^[A-Z]/.test(m[4])) cls = "tk-t";
      }
      parts.push([cls, m[0]]);
      last = TOKEN.lastIndex;
    }
    if (last < text.length) parts.push([null, text.slice(last)]);
    const lines = [""];
    for (const [cls, chunk] of parts) {
      chunk.split("\n").forEach((piece, i) => {
        if (i > 0) lines.push("");
        if (piece)
          lines[lines.length - 1] += cls ? `<span class="${cls}">${esc(piece)}</span>` : esc(piece);
      });
    }
    return lines;
  }
  function oneLine(v) {
    try {
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  /** Top-level fields of a JSON Schema object: name, type, required, default, description. */
  function schemaFields(schema) {
    if (!schema || typeof schema !== "object" || !schema.properties) return [];
    const req = new Set(schema.required || []);
    return Object.entries(schema.properties).map(([name, p]) => ({
      name,
      type: typeOf(p),
      required: req.has(name) && !(p && "default" in p),
      def: p && "default" in p ? oneLine(p.default) : undefined,
      desc: p && p.description,
    }));
  }
  function typeOf(p) {
    if (!p || typeof p !== "object") return "any";
    if (p.enum) return p.enum.map((e) => JSON.stringify(e)).join(" | ");
    if (p.const !== undefined) return JSON.stringify(p.const);
    if (Array.isArray(p.type)) return p.type.join(" | ");
    if (p.type === "array") return `${typeOf(p.items)}[]`;
    if (p.type) return p.type;
    if (p.anyOf || p.oneOf) return (p.anyOf || p.oneOf).map(typeOf).join(" | ");
    return "any";
  }
  function paramHtml(f) {
    return `<div class="param"><span class="pn">${esc(f.name)}${f.required ? "" : "?"}</span><span class="pt">${esc(truncate(f.type, 40))}</span>${
      f.def !== undefined ? `<span class="pd">= ${esc(truncate(f.def, 24))}</span>` : ""
    }${f.desc ? `<div class="pdesc">${esc(f.desc)}</div>` : ""}</div>`;
  }
  /**
   * What a `prompt` battery node asked and got back: its options (the node's one argument) plus
   * the `prompt` / `answer` events it emitted. `null` for anything that is not a prompt.
   */
  function promptOf(n) {
    if (n._prompt !== undefined) return n._prompt;
    n._prompt = null;
    if (n.name !== "prompt" || n.depth === 0) return null;
    const opts =
      (n.v.args && n.v.args[0] && typeof n.v.args[0] === "object" ? n.v.args[0] : {}) || {};
    let message = opts.message;
    let answer = null;
    for (const it of n.entries) {
      if (it.e.level !== "event") continue;
      if (it.e.message.startsWith("prompt · ")) message = it.e.message.slice("prompt · ".length);
      else if (it.e.message.startsWith("answer · ")) {
        try {
          answer = JSON.parse(it.e.message.slice("answer · ".length));
        } catch {
          answer = { value: it.e.message.slice("answer · ".length) };
        }
      }
    }
    if (message === undefined && !answer) return null;
    n._prompt = {
      message,
      kind: opts.kind || "input",
      hint: opts.hint,
      choices: opts.choices,
      def: opts.default,
      timeoutMs: opts.timeoutMs,
      answer,
    };
    return n._prompt;
  }
  /** What a node is, for a card's subtitle: the om, an inline step, a prompt, or an action. */
  function nodeKind(n) {
    if (n.depth === 0) return "om";
    if (promptOf(n)) return "prompt";
    return n.v.kind === "step" ? "step" : "action";
  }
  /** A name broken into at most two lines of `max` characters, at word boundaries when it can. */
  function wrapName(name, max) {
    if (name.length <= max) return [name];
    let cut = name.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    const first = name.slice(0, cut).trimEnd();
    return [first, truncate(name.slice(cut).trimStart(), max)];
  }
  function truncate(s, n) {
    n = Math.max(1, Math.floor(n));
    return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
  }
  /** A tag's colour: hashed from its text, so a tag reads the same in every view. */
  function tagColor(t) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return css(PALETTE[Math.abs(h) % PALETTE.length]);
  }
  /** One tag as a chip — the tree, tooltips and details share it; the flow draws the same in SVG. */
  function chipHtml(t, max) {
    const c = tagColor(t);
    return `<span class="chip" style="background:${alpha(c, 0.14)};border-color:${alpha(c, 0.45)}" title="${esc(t)}">${esc(truncate(t, max))}</span>`;
  }
  /** Up to `limit` tag chips, then a "+N" chip holding the rest. */
  function chipsHtml(tags, limit, max) {
    if (!tags || !tags.length) return "";
    const more =
      tags.length > limit
        ? `<span class="chip more" title="${esc(tags.slice(limit).join(", "))}">+${tags.length - limit}</span>`
        : "";
    return `<span class="chips">${tags
      .slice(0, limit)
      .map((t) => chipHtml(t, max))
      .join("")}${more}</span>`;
  }
  function displayName(n) {
    if (n.depth === 0) return "main";
    const p = promptOf(n);
    if (p && p.message) return `prompt: ${truncate(p.message, 48)}`;
    const tag = n.v.tags && n.v.tags[0];
    // Battery steps are named after their kind (`command`, `chromePage`); their first tag
    // is what the om called them, which is the more useful label.
    return tag && tag !== n.name && n.name.length > 28 ? tag : n.name;
  }
  function iconOf(n) {
    if (n.depth === 0) return "root";
    const s = `${n.name} ${(n.v.tags || []).join(" ")}`.toLowerCase();
    if (/^(npm|npx|node|pnpm|yarn|tsc|git|bun)\b/.test(n.name) || /command|shell|exec/.test(s))
      return "terminal";
    if (/chromepage|page:|tab/.test(s)) return "window";
    if (/browser|chrome/.test(s)) return "globe";
    if (/health|ready|gate|wait|port/.test(s)) return "pulse";
    if (/drive|inspect|click/.test(s)) return "cursor";
    if (/test|assert|validate/.test(s)) return "flask";
    if (/snapshot|screenshot/.test(s)) return "camera";
    if (/prompt|ask/.test(s)) return "chat";
    if (/build|compile|bundle/.test(s)) return "box";
    return "play";
  }
  function copy(text, message) {
    const done = () => toast(message || "Copied");
    if (navigator.clipboard && window.isSecureContext)
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, message));
    else fallbackCopy(text, message);
  }
  function fallbackCopy(text, message) {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    try {
      document.execCommand("copy");
      toast(message || "Copied");
    } catch {
      toast(text);
    }
    t.remove();
  }
  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }
  function download(name, text, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : !matchMedia("(prefers-color-scheme: light)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("omkit-report-theme", root.dataset.theme);
    } catch {
      /* storage may be unavailable on file:// */
    }
  }

  // ── boot ─────────────────────────────────────────────────
  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const step = (t) => {
    const s = document.getElementById("loader-step");
    if (s) s.textContent = t;
  };
  async function boot() {
    try {
      const saved = localStorage.getItem("omkit-report-theme");
      if (saved) document.documentElement.dataset.theme = saved;
    } catch {
      /* ignore */
    }
    await frame();
    step("Parsing the run record…");
    await frame();
    const data = JSON.parse(document.getElementById("omkit-data").textContent);
    step(`Building ${data.run ? "the timeline" : "the view"}…`);
    await frame();
    const model = buildModel(data);
    const app = document.getElementById("app");
    app.hidden = false;
    App(model);
    await frame();
    const loader = document.getElementById("loader");
    loader.style.transition = "opacity 0.2s";
    loader.style.opacity = "0";
    setTimeout(() => loader.remove(), 220);
  }
  boot().catch((err) => {
    step(`Could not render this run: ${err && err.message ? err.message : err}`);
    console.error(err);
  });
})();
