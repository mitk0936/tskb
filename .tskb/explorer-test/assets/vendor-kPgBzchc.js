var Jn = { value: () => {} };
function Qt() {
  for (var t = 0, n = arguments.length, e = {}, r; t < n; ++t) {
    if (!(r = arguments[t] + "") || r in e || /[\s.]/.test(r))
      throw new Error("illegal type: " + r);
    e[r] = [];
  }
  return new vt(e);
}
function vt(t) {
  this._ = t;
}
function jn(t, n) {
  return t
    .trim()
    .split(/^|\s+/)
    .map(function (e) {
      var r = "",
        i = e.indexOf(".");
      if ((i >= 0 && ((r = e.slice(i + 1)), (e = e.slice(0, i))), e && !n.hasOwnProperty(e)))
        throw new Error("unknown type: " + e);
      return { type: e, name: r };
    });
}
vt.prototype = Qt.prototype = {
  constructor: vt,
  on: function (t, n) {
    var e = this._,
      r = jn(t + "", e),
      i,
      o = -1,
      s = r.length;
    if (arguments.length < 2) {
      for (; ++o < s; ) if ((i = (t = r[o]).type) && (i = te(e[i], t.name))) return i;
      return;
    }
    if (n != null && typeof n != "function") throw new Error("invalid callback: " + n);
    for (; ++o < s; )
      if ((i = (t = r[o]).type)) e[i] = rn(e[i], t.name, n);
      else if (n == null) for (i in e) e[i] = rn(e[i], t.name, null);
    return this;
  },
  copy: function () {
    var t = {},
      n = this._;
    for (var e in n) t[e] = n[e].slice();
    return new vt(t);
  },
  call: function (t, n) {
    if ((i = arguments.length - 2) > 0)
      for (var e = new Array(i), r = 0, i, o; r < i; ++r) e[r] = arguments[r + 2];
    if (!this._.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    for (o = this._[t], r = 0, i = o.length; r < i; ++r) o[r].value.apply(n, e);
  },
  apply: function (t, n, e) {
    if (!this._.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    for (var r = this._[t], i = 0, o = r.length; i < o; ++i) r[i].value.apply(n, e);
  },
};
function te(t, n) {
  for (var e = 0, r = t.length, i; e < r; ++e) if ((i = t[e]).name === n) return i.value;
}
function rn(t, n, e) {
  for (var r = 0, i = t.length; r < i; ++r)
    if (t[r].name === n) {
      ((t[r] = Jn), (t = t.slice(0, r).concat(t.slice(r + 1))));
      break;
    }
  return (e != null && t.push({ name: n, value: e }), t);
}
var Pt = "http://www.w3.org/1999/xhtml";
const on = {
  svg: "http://www.w3.org/2000/svg",
  xhtml: Pt,
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/",
};
function Ct(t) {
  var n = (t += ""),
    e = n.indexOf(":");
  return (
    e >= 0 && (n = t.slice(0, e)) !== "xmlns" && (t = t.slice(e + 1)),
    on.hasOwnProperty(n) ? { space: on[n], local: t } : t
  );
}
function ne(t) {
  return function () {
    var n = this.ownerDocument,
      e = this.namespaceURI;
    return e === Pt && n.documentElement.namespaceURI === Pt
      ? n.createElement(t)
      : n.createElementNS(e, t);
  };
}
function ee(t) {
  return function () {
    return this.ownerDocument.createElementNS(t.space, t.local);
  };
}
function bn(t) {
  var n = Ct(t);
  return (n.local ? ee : ne)(n);
}
function re() {}
function Zt(t) {
  return t == null
    ? re
    : function () {
        return this.querySelector(t);
      };
}
function ie(t) {
  typeof t != "function" && (t = Zt(t));
  for (var n = this._groups, e = n.length, r = new Array(e), i = 0; i < e; ++i)
    for (var o = n[i], s = o.length, a = (r[i] = new Array(s)), c, u, l = 0; l < s; ++l)
      (c = o[l]) &&
        (u = t.call(c, c.__data__, l, o)) &&
        ("__data__" in c && (u.__data__ = c.__data__), (a[l] = u));
  return new C(r, this._parents);
}
function oe(t) {
  return t == null ? [] : Array.isArray(t) ? t : Array.from(t);
}
function se() {
  return [];
}
function An(t) {
  return t == null
    ? se
    : function () {
        return this.querySelectorAll(t);
      };
}
function ue(t) {
  return function () {
    return oe(t.apply(this, arguments));
  };
}
function ae(t) {
  typeof t == "function" ? (t = ue(t)) : (t = An(t));
  for (var n = this._groups, e = n.length, r = [], i = [], o = 0; o < e; ++o)
    for (var s = n[o], a = s.length, c, u = 0; u < a; ++u)
      (c = s[u]) && (r.push(t.call(c, c.__data__, u, s)), i.push(c));
  return new C(r, i);
}
function Nn(t) {
  return function () {
    return this.matches(t);
  };
}
function zn(t) {
  return function (n) {
    return n.matches(t);
  };
}
var ce = Array.prototype.find;
function le(t) {
  return function () {
    return ce.call(this.children, t);
  };
}
function fe() {
  return this.firstElementChild;
}
function he(t) {
  return this.select(t == null ? fe : le(typeof t == "function" ? t : zn(t)));
}
var pe = Array.prototype.filter;
function de() {
  return Array.from(this.children);
}
function ge(t) {
  return function () {
    return pe.call(this.children, t);
  };
}
function _e(t) {
  return this.selectAll(t == null ? de : ge(typeof t == "function" ? t : zn(t)));
}
function me(t) {
  typeof t != "function" && (t = Nn(t));
  for (var n = this._groups, e = n.length, r = new Array(e), i = 0; i < e; ++i)
    for (var o = n[i], s = o.length, a = (r[i] = []), c, u = 0; u < s; ++u)
      (c = o[u]) && t.call(c, c.__data__, u, o) && a.push(c);
  return new C(r, this._parents);
}
function kn(t) {
  return new Array(t.length);
}
function ye() {
  return new C(this._enter || this._groups.map(kn), this._parents);
}
function kt(t, n) {
  ((this.ownerDocument = t.ownerDocument),
    (this.namespaceURI = t.namespaceURI),
    (this._next = null),
    (this._parent = t),
    (this.__data__ = n));
}
kt.prototype = {
  constructor: kt,
  appendChild: function (t) {
    return this._parent.insertBefore(t, this._next);
  },
  insertBefore: function (t, n) {
    return this._parent.insertBefore(t, n);
  },
  querySelector: function (t) {
    return this._parent.querySelector(t);
  },
  querySelectorAll: function (t) {
    return this._parent.querySelectorAll(t);
  },
};
function we(t) {
  return function () {
    return t;
  };
}
function xe(t, n, e, r, i, o) {
  for (var s = 0, a, c = n.length, u = o.length; s < u; ++s)
    (a = n[s]) ? ((a.__data__ = o[s]), (r[s] = a)) : (e[s] = new kt(t, o[s]));
  for (; s < c; ++s) (a = n[s]) && (i[s] = a);
}
function ve(t, n, e, r, i, o, s) {
  var a,
    c,
    u = new Map(),
    l = n.length,
    d = o.length,
    h = new Array(l),
    g;
  for (a = 0; a < l; ++a)
    (c = n[a]) &&
      ((h[a] = g = s.call(c, c.__data__, a, n) + ""), u.has(g) ? (i[a] = c) : u.set(g, c));
  for (a = 0; a < d; ++a)
    ((g = s.call(t, o[a], a, o) + ""),
      (c = u.get(g)) ? ((r[a] = c), (c.__data__ = o[a]), u.delete(g)) : (e[a] = new kt(t, o[a])));
  for (a = 0; a < l; ++a) (c = n[a]) && u.get(h[a]) === c && (i[a] = c);
}
function be(t) {
  return t.__data__;
}
function Ae(t, n) {
  if (!arguments.length) return Array.from(this, be);
  var e = n ? ve : xe,
    r = this._parents,
    i = this._groups;
  typeof t != "function" && (t = we(t));
  for (var o = i.length, s = new Array(o), a = new Array(o), c = new Array(o), u = 0; u < o; ++u) {
    var l = r[u],
      d = i[u],
      h = d.length,
      g = Ne(t.call(l, l && l.__data__, u, r)),
      w = g.length,
      b = (a[u] = new Array(w)),
      k = (s[u] = new Array(w)),
      y = (c[u] = new Array(h));
    e(l, d, b, k, y, g, n);
    for (var N = 0, S = 0, $, R; N < w; ++N)
      if (($ = b[N])) {
        for (N >= S && (S = N + 1); !(R = k[S]) && ++S < w; );
        $._next = R || null;
      }
  }
  return ((s = new C(s, r)), (s._enter = a), (s._exit = c), s);
}
function Ne(t) {
  return typeof t == "object" && "length" in t ? t : Array.from(t);
}
function ze() {
  return new C(this._exit || this._groups.map(kn), this._parents);
}
function ke(t, n, e) {
  var r = this.enter(),
    i = this,
    o = this.exit();
  return (
    typeof t == "function" ? ((r = t(r)), r && (r = r.selection())) : (r = r.append(t + "")),
    n != null && ((i = n(i)), i && (i = i.selection())),
    e == null ? o.remove() : e(o),
    r && i ? r.merge(i).order() : i
  );
}
function Ee(t) {
  for (
    var n = t.selection ? t.selection() : t,
      e = this._groups,
      r = n._groups,
      i = e.length,
      o = r.length,
      s = Math.min(i, o),
      a = new Array(i),
      c = 0;
    c < s;
    ++c
  )
    for (var u = e[c], l = r[c], d = u.length, h = (a[c] = new Array(d)), g, w = 0; w < d; ++w)
      (g = u[w] || l[w]) && (h[w] = g);
  for (; c < i; ++c) a[c] = e[c];
  return new C(a, this._parents);
}
function Se() {
  for (var t = this._groups, n = -1, e = t.length; ++n < e; )
    for (var r = t[n], i = r.length - 1, o = r[i], s; --i >= 0; )
      (s = r[i]) &&
        (o && s.compareDocumentPosition(o) ^ 4 && o.parentNode.insertBefore(s, o), (o = s));
  return this;
}
function Me(t) {
  t || (t = $e);
  function n(d, h) {
    return d && h ? t(d.__data__, h.__data__) : !d - !h;
  }
  for (var e = this._groups, r = e.length, i = new Array(r), o = 0; o < r; ++o) {
    for (var s = e[o], a = s.length, c = (i[o] = new Array(a)), u, l = 0; l < a; ++l)
      (u = s[l]) && (c[l] = u);
    c.sort(n);
  }
  return new C(i, this._parents).order();
}
function $e(t, n) {
  return t < n ? -1 : t > n ? 1 : t >= n ? 0 : NaN;
}
function Te() {
  var t = arguments[0];
  return ((arguments[0] = this), t.apply(null, arguments), this);
}
function Ce() {
  return Array.from(this);
}
function Re() {
  for (var t = this._groups, n = 0, e = t.length; n < e; ++n)
    for (var r = t[n], i = 0, o = r.length; i < o; ++i) {
      var s = r[i];
      if (s) return s;
    }
  return null;
}
function Ie() {
  let t = 0;
  for (const n of this) ++t;
  return t;
}
function De() {
  return !this.node();
}
function Xe(t) {
  for (var n = this._groups, e = 0, r = n.length; e < r; ++e)
    for (var i = n[e], o = 0, s = i.length, a; o < s; ++o)
      (a = i[o]) && t.call(a, a.__data__, o, i);
  return this;
}
function qe(t) {
  return function () {
    this.removeAttribute(t);
  };
}
function Fe(t) {
  return function () {
    this.removeAttributeNS(t.space, t.local);
  };
}
function Be(t, n) {
  return function () {
    this.setAttribute(t, n);
  };
}
function He(t, n) {
  return function () {
    this.setAttributeNS(t.space, t.local, n);
  };
}
function Pe(t, n) {
  return function () {
    var e = n.apply(this, arguments);
    e == null ? this.removeAttribute(t) : this.setAttribute(t, e);
  };
}
function Ve(t, n) {
  return function () {
    var e = n.apply(this, arguments);
    e == null ? this.removeAttributeNS(t.space, t.local) : this.setAttributeNS(t.space, t.local, e);
  };
}
function Ye(t, n) {
  var e = Ct(t);
  if (arguments.length < 2) {
    var r = this.node();
    return e.local ? r.getAttributeNS(e.space, e.local) : r.getAttribute(e);
  }
  return this.each(
    (n == null
      ? e.local
        ? Fe
        : qe
      : typeof n == "function"
        ? e.local
          ? Ve
          : Pe
        : e.local
          ? He
          : Be)(e, n)
  );
}
function En(t) {
  return (t.ownerDocument && t.ownerDocument.defaultView) || (t.document && t) || t.defaultView;
}
function Oe(t) {
  return function () {
    this.style.removeProperty(t);
  };
}
function Le(t, n, e) {
  return function () {
    this.style.setProperty(t, n, e);
  };
}
function Ue(t, n, e) {
  return function () {
    var r = n.apply(this, arguments);
    r == null ? this.style.removeProperty(t) : this.style.setProperty(t, r, e);
  };
}
function Ge(t, n, e) {
  return arguments.length > 1
    ? this.each((n == null ? Oe : typeof n == "function" ? Ue : Le)(t, n, e ?? ""))
    : nt(this.node(), t);
}
function nt(t, n) {
  return t.style.getPropertyValue(n) || En(t).getComputedStyle(t, null).getPropertyValue(n);
}
function Ke(t) {
  return function () {
    delete this[t];
  };
}
function We(t, n) {
  return function () {
    this[t] = n;
  };
}
function Qe(t, n) {
  return function () {
    var e = n.apply(this, arguments);
    e == null ? delete this[t] : (this[t] = e);
  };
}
function Ze(t, n) {
  return arguments.length > 1
    ? this.each((n == null ? Ke : typeof n == "function" ? Qe : We)(t, n))
    : this.node()[t];
}
function Sn(t) {
  return t.trim().split(/^|\s+/);
}
function Jt(t) {
  return t.classList || new Mn(t);
}
function Mn(t) {
  ((this._node = t), (this._names = Sn(t.getAttribute("class") || "")));
}
Mn.prototype = {
  add: function (t) {
    var n = this._names.indexOf(t);
    n < 0 && (this._names.push(t), this._node.setAttribute("class", this._names.join(" ")));
  },
  remove: function (t) {
    var n = this._names.indexOf(t);
    n >= 0 && (this._names.splice(n, 1), this._node.setAttribute("class", this._names.join(" ")));
  },
  contains: function (t) {
    return this._names.indexOf(t) >= 0;
  },
};
function $n(t, n) {
  for (var e = Jt(t), r = -1, i = n.length; ++r < i; ) e.add(n[r]);
}
function Tn(t, n) {
  for (var e = Jt(t), r = -1, i = n.length; ++r < i; ) e.remove(n[r]);
}
function Je(t) {
  return function () {
    $n(this, t);
  };
}
function je(t) {
  return function () {
    Tn(this, t);
  };
}
function tr(t, n) {
  return function () {
    (n.apply(this, arguments) ? $n : Tn)(this, t);
  };
}
function nr(t, n) {
  var e = Sn(t + "");
  if (arguments.length < 2) {
    for (var r = Jt(this.node()), i = -1, o = e.length; ++i < o; ) if (!r.contains(e[i])) return !1;
    return !0;
  }
  return this.each((typeof n == "function" ? tr : n ? Je : je)(e, n));
}
function er() {
  this.textContent = "";
}
function rr(t) {
  return function () {
    this.textContent = t;
  };
}
function ir(t) {
  return function () {
    var n = t.apply(this, arguments);
    this.textContent = n ?? "";
  };
}
function or(t) {
  return arguments.length
    ? this.each(t == null ? er : (typeof t == "function" ? ir : rr)(t))
    : this.node().textContent;
}
function sr() {
  this.innerHTML = "";
}
function ur(t) {
  return function () {
    this.innerHTML = t;
  };
}
function ar(t) {
  return function () {
    var n = t.apply(this, arguments);
    this.innerHTML = n ?? "";
  };
}
function cr(t) {
  return arguments.length
    ? this.each(t == null ? sr : (typeof t == "function" ? ar : ur)(t))
    : this.node().innerHTML;
}
function lr() {
  this.nextSibling && this.parentNode.appendChild(this);
}
function fr() {
  return this.each(lr);
}
function hr() {
  this.previousSibling && this.parentNode.insertBefore(this, this.parentNode.firstChild);
}
function pr() {
  return this.each(hr);
}
function dr(t) {
  var n = typeof t == "function" ? t : bn(t);
  return this.select(function () {
    return this.appendChild(n.apply(this, arguments));
  });
}
function gr() {
  return null;
}
function _r(t, n) {
  var e = typeof t == "function" ? t : bn(t),
    r = n == null ? gr : typeof n == "function" ? n : Zt(n);
  return this.select(function () {
    return this.insertBefore(e.apply(this, arguments), r.apply(this, arguments) || null);
  });
}
function mr() {
  var t = this.parentNode;
  t && t.removeChild(this);
}
function yr() {
  return this.each(mr);
}
function wr() {
  var t = this.cloneNode(!1),
    n = this.parentNode;
  return n ? n.insertBefore(t, this.nextSibling) : t;
}
function xr() {
  var t = this.cloneNode(!0),
    n = this.parentNode;
  return n ? n.insertBefore(t, this.nextSibling) : t;
}
function vr(t) {
  return this.select(t ? xr : wr);
}
function br(t) {
  return arguments.length ? this.property("__data__", t) : this.node().__data__;
}
function Ar(t) {
  return function (n) {
    t.call(this, n, this.__data__);
  };
}
function Nr(t) {
  return t
    .trim()
    .split(/^|\s+/)
    .map(function (n) {
      var e = "",
        r = n.indexOf(".");
      return (r >= 0 && ((e = n.slice(r + 1)), (n = n.slice(0, r))), { type: n, name: e });
    });
}
function zr(t) {
  return function () {
    var n = this.__on;
    if (n) {
      for (var e = 0, r = -1, i = n.length, o; e < i; ++e)
        ((o = n[e]),
          (!t.type || o.type === t.type) && o.name === t.name
            ? this.removeEventListener(o.type, o.listener, o.options)
            : (n[++r] = o));
      ++r ? (n.length = r) : delete this.__on;
    }
  };
}
function kr(t, n, e) {
  return function () {
    var r = this.__on,
      i,
      o = Ar(n);
    if (r) {
      for (var s = 0, a = r.length; s < a; ++s)
        if ((i = r[s]).type === t.type && i.name === t.name) {
          (this.removeEventListener(i.type, i.listener, i.options),
            this.addEventListener(i.type, (i.listener = o), (i.options = e)),
            (i.value = n));
          return;
        }
    }
    (this.addEventListener(t.type, o, e),
      (i = { type: t.type, name: t.name, value: n, listener: o, options: e }),
      r ? r.push(i) : (this.__on = [i]));
  };
}
function Er(t, n, e) {
  var r = Nr(t + ""),
    i,
    o = r.length,
    s;
  if (arguments.length < 2) {
    var a = this.node().__on;
    if (a) {
      for (var c = 0, u = a.length, l; c < u; ++c)
        for (i = 0, l = a[c]; i < o; ++i)
          if ((s = r[i]).type === l.type && s.name === l.name) return l.value;
    }
    return;
  }
  for (a = n ? kr : zr, i = 0; i < o; ++i) this.each(a(r[i], n, e));
  return this;
}
function Cn(t, n, e) {
  var r = En(t),
    i = r.CustomEvent;
  (typeof i == "function"
    ? (i = new i(n, e))
    : ((i = r.document.createEvent("Event")),
      e
        ? (i.initEvent(n, e.bubbles, e.cancelable), (i.detail = e.detail))
        : i.initEvent(n, !1, !1)),
    t.dispatchEvent(i));
}
function Sr(t, n) {
  return function () {
    return Cn(this, t, n);
  };
}
function Mr(t, n) {
  return function () {
    return Cn(this, t, n.apply(this, arguments));
  };
}
function $r(t, n) {
  return this.each((typeof n == "function" ? Mr : Sr)(t, n));
}
function* Tr() {
  for (var t = this._groups, n = 0, e = t.length; n < e; ++n)
    for (var r = t[n], i = 0, o = r.length, s; i < o; ++i) (s = r[i]) && (yield s);
}
var Rn = [null];
function C(t, n) {
  ((this._groups = t), (this._parents = n));
}
function ht() {
  return new C([[document.documentElement]], Rn);
}
function Cr() {
  return this;
}
C.prototype = ht.prototype = {
  constructor: C,
  select: ie,
  selectAll: ae,
  selectChild: he,
  selectChildren: _e,
  filter: me,
  data: Ae,
  enter: ye,
  exit: ze,
  join: ke,
  merge: Ee,
  selection: Cr,
  order: Se,
  sort: Me,
  call: Te,
  nodes: Ce,
  node: Re,
  size: Ie,
  empty: De,
  each: Xe,
  attr: Ye,
  style: Ge,
  property: Ze,
  classed: nr,
  text: or,
  html: cr,
  raise: fr,
  lower: pr,
  append: dr,
  insert: _r,
  remove: yr,
  clone: vr,
  datum: br,
  on: Er,
  dispatch: $r,
  [Symbol.iterator]: Tr,
};
function Q(t) {
  return typeof t == "string"
    ? new C([[document.querySelector(t)]], [document.documentElement])
    : new C([[t]], Rn);
}
function Rr(t) {
  let n;
  for (; (n = t.sourceEvent); ) t = n;
  return t;
}
function W(t, n) {
  if (((t = Rr(t)), n === void 0 && (n = t.currentTarget), n)) {
    var e = n.ownerSVGElement || n;
    if (e.createSVGPoint) {
      var r = e.createSVGPoint();
      return (
        (r.x = t.clientX),
        (r.y = t.clientY),
        (r = r.matrixTransform(n.getScreenCTM().inverse())),
        [r.x, r.y]
      );
    }
    if (n.getBoundingClientRect) {
      var i = n.getBoundingClientRect();
      return [t.clientX - i.left - n.clientLeft, t.clientY - i.top - n.clientTop];
    }
  }
  return [t.pageX, t.pageY];
}
const Vt = { capture: !0, passive: !1 };
function Yt(t) {
  (t.preventDefault(), t.stopImmediatePropagation());
}
function Ir(t) {
  var n = t.document.documentElement,
    e = Q(t).on("dragstart.drag", Yt, Vt);
  "onselectstart" in n
    ? e.on("selectstart.drag", Yt, Vt)
    : ((n.__noselect = n.style.MozUserSelect), (n.style.MozUserSelect = "none"));
}
function Dr(t, n) {
  var e = t.document.documentElement,
    r = Q(t).on("dragstart.drag", null);
  (n &&
    (r.on("click.drag", Yt, Vt),
    setTimeout(function () {
      r.on("click.drag", null);
    }, 0)),
    "onselectstart" in e
      ? r.on("selectstart.drag", null)
      : ((e.style.MozUserSelect = e.__noselect), delete e.__noselect));
}
function jt(t, n, e) {
  ((t.prototype = n.prototype = e), (e.constructor = t));
}
function In(t, n) {
  var e = Object.create(t.prototype);
  for (var r in n) e[r] = n[r];
  return e;
}
function pt() {}
var ut = 0.7,
  Et = 1 / ut,
  tt = "\\s*([+-]?\\d+)\\s*",
  at = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*",
  H = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
  Xr = /^#([0-9a-f]{3,8})$/,
  qr = new RegExp(`^rgb\\(${tt},${tt},${tt}\\)$`),
  Fr = new RegExp(`^rgb\\(${H},${H},${H}\\)$`),
  Br = new RegExp(`^rgba\\(${tt},${tt},${tt},${at}\\)$`),
  Hr = new RegExp(`^rgba\\(${H},${H},${H},${at}\\)$`),
  Pr = new RegExp(`^hsl\\(${at},${H},${H}\\)$`),
  Vr = new RegExp(`^hsla\\(${at},${H},${H},${at}\\)$`),
  sn = {
    aliceblue: 15792383,
    antiquewhite: 16444375,
    aqua: 65535,
    aquamarine: 8388564,
    azure: 15794175,
    beige: 16119260,
    bisque: 16770244,
    black: 0,
    blanchedalmond: 16772045,
    blue: 255,
    blueviolet: 9055202,
    brown: 10824234,
    burlywood: 14596231,
    cadetblue: 6266528,
    chartreuse: 8388352,
    chocolate: 13789470,
    coral: 16744272,
    cornflowerblue: 6591981,
    cornsilk: 16775388,
    crimson: 14423100,
    cyan: 65535,
    darkblue: 139,
    darkcyan: 35723,
    darkgoldenrod: 12092939,
    darkgray: 11119017,
    darkgreen: 25600,
    darkgrey: 11119017,
    darkkhaki: 12433259,
    darkmagenta: 9109643,
    darkolivegreen: 5597999,
    darkorange: 16747520,
    darkorchid: 10040012,
    darkred: 9109504,
    darksalmon: 15308410,
    darkseagreen: 9419919,
    darkslateblue: 4734347,
    darkslategray: 3100495,
    darkslategrey: 3100495,
    darkturquoise: 52945,
    darkviolet: 9699539,
    deeppink: 16716947,
    deepskyblue: 49151,
    dimgray: 6908265,
    dimgrey: 6908265,
    dodgerblue: 2003199,
    firebrick: 11674146,
    floralwhite: 16775920,
    forestgreen: 2263842,
    fuchsia: 16711935,
    gainsboro: 14474460,
    ghostwhite: 16316671,
    gold: 16766720,
    goldenrod: 14329120,
    gray: 8421504,
    green: 32768,
    greenyellow: 11403055,
    grey: 8421504,
    honeydew: 15794160,
    hotpink: 16738740,
    indianred: 13458524,
    indigo: 4915330,
    ivory: 16777200,
    khaki: 15787660,
    lavender: 15132410,
    lavenderblush: 16773365,
    lawngreen: 8190976,
    lemonchiffon: 16775885,
    lightblue: 11393254,
    lightcoral: 15761536,
    lightcyan: 14745599,
    lightgoldenrodyellow: 16448210,
    lightgray: 13882323,
    lightgreen: 9498256,
    lightgrey: 13882323,
    lightpink: 16758465,
    lightsalmon: 16752762,
    lightseagreen: 2142890,
    lightskyblue: 8900346,
    lightslategray: 7833753,
    lightslategrey: 7833753,
    lightsteelblue: 11584734,
    lightyellow: 16777184,
    lime: 65280,
    limegreen: 3329330,
    linen: 16445670,
    magenta: 16711935,
    maroon: 8388608,
    mediumaquamarine: 6737322,
    mediumblue: 205,
    mediumorchid: 12211667,
    mediumpurple: 9662683,
    mediumseagreen: 3978097,
    mediumslateblue: 8087790,
    mediumspringgreen: 64154,
    mediumturquoise: 4772300,
    mediumvioletred: 13047173,
    midnightblue: 1644912,
    mintcream: 16121850,
    mistyrose: 16770273,
    moccasin: 16770229,
    navajowhite: 16768685,
    navy: 128,
    oldlace: 16643558,
    olive: 8421376,
    olivedrab: 7048739,
    orange: 16753920,
    orangered: 16729344,
    orchid: 14315734,
    palegoldenrod: 15657130,
    palegreen: 10025880,
    paleturquoise: 11529966,
    palevioletred: 14381203,
    papayawhip: 16773077,
    peachpuff: 16767673,
    peru: 13468991,
    pink: 16761035,
    plum: 14524637,
    powderblue: 11591910,
    purple: 8388736,
    rebeccapurple: 6697881,
    red: 16711680,
    rosybrown: 12357519,
    royalblue: 4286945,
    saddlebrown: 9127187,
    salmon: 16416882,
    sandybrown: 16032864,
    seagreen: 3050327,
    seashell: 16774638,
    sienna: 10506797,
    silver: 12632256,
    skyblue: 8900331,
    slateblue: 6970061,
    slategray: 7372944,
    slategrey: 7372944,
    snow: 16775930,
    springgreen: 65407,
    steelblue: 4620980,
    tan: 13808780,
    teal: 32896,
    thistle: 14204888,
    tomato: 16737095,
    turquoise: 4251856,
    violet: 15631086,
    wheat: 16113331,
    white: 16777215,
    whitesmoke: 16119285,
    yellow: 16776960,
    yellowgreen: 10145074,
  };
jt(pt, ct, {
  copy(t) {
    return Object.assign(new this.constructor(), this, t);
  },
  displayable() {
    return this.rgb().displayable();
  },
  hex: un,
  formatHex: un,
  formatHex8: Yr,
  formatHsl: Or,
  formatRgb: an,
  toString: an,
});
function un() {
  return this.rgb().formatHex();
}
function Yr() {
  return this.rgb().formatHex8();
}
function Or() {
  return Dn(this).formatHsl();
}
function an() {
  return this.rgb().formatRgb();
}
function ct(t) {
  var n, e;
  return (
    (t = (t + "").trim().toLowerCase()),
    (n = Xr.exec(t))
      ? ((e = n[1].length),
        (n = parseInt(n[1], 16)),
        e === 6
          ? cn(n)
          : e === 3
            ? new T(
                ((n >> 8) & 15) | ((n >> 4) & 240),
                ((n >> 4) & 15) | (n & 240),
                ((n & 15) << 4) | (n & 15),
                1
              )
            : e === 8
              ? mt((n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, (n & 255) / 255)
              : e === 4
                ? mt(
                    ((n >> 12) & 15) | ((n >> 8) & 240),
                    ((n >> 8) & 15) | ((n >> 4) & 240),
                    ((n >> 4) & 15) | (n & 240),
                    (((n & 15) << 4) | (n & 15)) / 255
                  )
                : null)
      : (n = qr.exec(t))
        ? new T(n[1], n[2], n[3], 1)
        : (n = Fr.exec(t))
          ? new T((n[1] * 255) / 100, (n[2] * 255) / 100, (n[3] * 255) / 100, 1)
          : (n = Br.exec(t))
            ? mt(n[1], n[2], n[3], n[4])
            : (n = Hr.exec(t))
              ? mt((n[1] * 255) / 100, (n[2] * 255) / 100, (n[3] * 255) / 100, n[4])
              : (n = Pr.exec(t))
                ? hn(n[1], n[2] / 100, n[3] / 100, 1)
                : (n = Vr.exec(t))
                  ? hn(n[1], n[2] / 100, n[3] / 100, n[4])
                  : sn.hasOwnProperty(t)
                    ? cn(sn[t])
                    : t === "transparent"
                      ? new T(NaN, NaN, NaN, 0)
                      : null
  );
}
function cn(t) {
  return new T((t >> 16) & 255, (t >> 8) & 255, t & 255, 1);
}
function mt(t, n, e, r) {
  return (r <= 0 && (t = n = e = NaN), new T(t, n, e, r));
}
function Lr(t) {
  return (
    t instanceof pt || (t = ct(t)),
    t ? ((t = t.rgb()), new T(t.r, t.g, t.b, t.opacity)) : new T()
  );
}
function Ot(t, n, e, r) {
  return arguments.length === 1 ? Lr(t) : new T(t, n, e, r ?? 1);
}
function T(t, n, e, r) {
  ((this.r = +t), (this.g = +n), (this.b = +e), (this.opacity = +r));
}
jt(
  T,
  Ot,
  In(pt, {
    brighter(t) {
      return (
        (t = t == null ? Et : Math.pow(Et, t)),
        new T(this.r * t, this.g * t, this.b * t, this.opacity)
      );
    },
    darker(t) {
      return (
        (t = t == null ? ut : Math.pow(ut, t)),
        new T(this.r * t, this.g * t, this.b * t, this.opacity)
      );
    },
    rgb() {
      return this;
    },
    clamp() {
      return new T(J(this.r), J(this.g), J(this.b), St(this.opacity));
    },
    displayable() {
      return (
        -0.5 <= this.r &&
        this.r < 255.5 &&
        -0.5 <= this.g &&
        this.g < 255.5 &&
        -0.5 <= this.b &&
        this.b < 255.5 &&
        0 <= this.opacity &&
        this.opacity <= 1
      );
    },
    hex: ln,
    formatHex: ln,
    formatHex8: Ur,
    formatRgb: fn,
    toString: fn,
  })
);
function ln() {
  return `#${Z(this.r)}${Z(this.g)}${Z(this.b)}`;
}
function Ur() {
  return `#${Z(this.r)}${Z(this.g)}${Z(this.b)}${Z((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
}
function fn() {
  const t = St(this.opacity);
  return `${t === 1 ? "rgb(" : "rgba("}${J(this.r)}, ${J(this.g)}, ${J(this.b)}${t === 1 ? ")" : `, ${t})`}`;
}
function St(t) {
  return isNaN(t) ? 1 : Math.max(0, Math.min(1, t));
}
function J(t) {
  return Math.max(0, Math.min(255, Math.round(t) || 0));
}
function Z(t) {
  return ((t = J(t)), (t < 16 ? "0" : "") + t.toString(16));
}
function hn(t, n, e, r) {
  return (
    r <= 0 ? (t = n = e = NaN) : e <= 0 || e >= 1 ? (t = n = NaN) : n <= 0 && (t = NaN),
    new q(t, n, e, r)
  );
}
function Dn(t) {
  if (t instanceof q) return new q(t.h, t.s, t.l, t.opacity);
  if ((t instanceof pt || (t = ct(t)), !t)) return new q();
  if (t instanceof q) return t;
  t = t.rgb();
  var n = t.r / 255,
    e = t.g / 255,
    r = t.b / 255,
    i = Math.min(n, e, r),
    o = Math.max(n, e, r),
    s = NaN,
    a = o - i,
    c = (o + i) / 2;
  return (
    a
      ? (n === o
          ? (s = (e - r) / a + (e < r) * 6)
          : e === o
            ? (s = (r - n) / a + 2)
            : (s = (n - e) / a + 4),
        (a /= c < 0.5 ? o + i : 2 - o - i),
        (s *= 60))
      : (a = c > 0 && c < 1 ? 0 : s),
    new q(s, a, c, t.opacity)
  );
}
function Gr(t, n, e, r) {
  return arguments.length === 1 ? Dn(t) : new q(t, n, e, r ?? 1);
}
function q(t, n, e, r) {
  ((this.h = +t), (this.s = +n), (this.l = +e), (this.opacity = +r));
}
jt(
  q,
  Gr,
  In(pt, {
    brighter(t) {
      return (
        (t = t == null ? Et : Math.pow(Et, t)),
        new q(this.h, this.s, this.l * t, this.opacity)
      );
    },
    darker(t) {
      return (
        (t = t == null ? ut : Math.pow(ut, t)),
        new q(this.h, this.s, this.l * t, this.opacity)
      );
    },
    rgb() {
      var t = (this.h % 360) + (this.h < 0) * 360,
        n = isNaN(t) || isNaN(this.s) ? 0 : this.s,
        e = this.l,
        r = e + (e < 0.5 ? e : 1 - e) * n,
        i = 2 * e - r;
      return new T(
        Xt(t >= 240 ? t - 240 : t + 120, i, r),
        Xt(t, i, r),
        Xt(t < 120 ? t + 240 : t - 120, i, r),
        this.opacity
      );
    },
    clamp() {
      return new q(pn(this.h), yt(this.s), yt(this.l), St(this.opacity));
    },
    displayable() {
      return (
        ((0 <= this.s && this.s <= 1) || isNaN(this.s)) &&
        0 <= this.l &&
        this.l <= 1 &&
        0 <= this.opacity &&
        this.opacity <= 1
      );
    },
    formatHsl() {
      const t = St(this.opacity);
      return `${t === 1 ? "hsl(" : "hsla("}${pn(this.h)}, ${yt(this.s) * 100}%, ${yt(this.l) * 100}%${t === 1 ? ")" : `, ${t})`}`;
    },
  })
);
function pn(t) {
  return ((t = (t || 0) % 360), t < 0 ? t + 360 : t);
}
function yt(t) {
  return Math.max(0, Math.min(1, t || 0));
}
function Xt(t, n, e) {
  return (
    (t < 60 ? n + ((e - n) * t) / 60 : t < 180 ? e : t < 240 ? n + ((e - n) * (240 - t)) / 60 : n) *
    255
  );
}
const Xn = (t) => () => t;
function Kr(t, n) {
  return function (e) {
    return t + e * n;
  };
}
function Wr(t, n, e) {
  return (
    (t = Math.pow(t, e)),
    (n = Math.pow(n, e) - t),
    (e = 1 / e),
    function (r) {
      return Math.pow(t + r * n, e);
    }
  );
}
function Qr(t) {
  return (t = +t) == 1
    ? qn
    : function (n, e) {
        return e - n ? Wr(n, e, t) : Xn(isNaN(n) ? e : n);
      };
}
function qn(t, n) {
  var e = n - t;
  return e ? Kr(t, e) : Xn(isNaN(t) ? n : t);
}
const dn = (function t(n) {
  var e = Qr(n);
  function r(i, o) {
    var s = e((i = Ot(i)).r, (o = Ot(o)).r),
      a = e(i.g, o.g),
      c = e(i.b, o.b),
      u = qn(i.opacity, o.opacity);
    return function (l) {
      return ((i.r = s(l)), (i.g = a(l)), (i.b = c(l)), (i.opacity = u(l)), i + "");
    };
  }
  return ((r.gamma = t), r);
})(1);
function K(t, n) {
  return (
    (t = +t),
    (n = +n),
    function (e) {
      return t * (1 - e) + n * e;
    }
  );
}
var Lt = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
  qt = new RegExp(Lt.source, "g");
function Zr(t) {
  return function () {
    return t;
  };
}
function Jr(t) {
  return function (n) {
    return t(n) + "";
  };
}
function jr(t, n) {
  var e = (Lt.lastIndex = qt.lastIndex = 0),
    r,
    i,
    o,
    s = -1,
    a = [],
    c = [];
  for (t = t + "", n = n + ""; (r = Lt.exec(t)) && (i = qt.exec(n)); )
    ((o = i.index) > e && ((o = n.slice(e, o)), a[s] ? (a[s] += o) : (a[++s] = o)),
      (r = r[0]) === (i = i[0])
        ? a[s]
          ? (a[s] += i)
          : (a[++s] = i)
        : ((a[++s] = null), c.push({ i: s, x: K(r, i) })),
      (e = qt.lastIndex));
  return (
    e < n.length && ((o = n.slice(e)), a[s] ? (a[s] += o) : (a[++s] = o)),
    a.length < 2
      ? c[0]
        ? Jr(c[0].x)
        : Zr(n)
      : ((n = c.length),
        function (u) {
          for (var l = 0, d; l < n; ++l) a[(d = c[l]).i] = d.x(u);
          return a.join("");
        })
  );
}
var gn = 180 / Math.PI,
  Ut = { translateX: 0, translateY: 0, rotate: 0, skewX: 0, scaleX: 1, scaleY: 1 };
function Fn(t, n, e, r, i, o) {
  var s, a, c;
  return (
    (s = Math.sqrt(t * t + n * n)) && ((t /= s), (n /= s)),
    (c = t * e + n * r) && ((e -= t * c), (r -= n * c)),
    (a = Math.sqrt(e * e + r * r)) && ((e /= a), (r /= a), (c /= a)),
    t * r < n * e && ((t = -t), (n = -n), (c = -c), (s = -s)),
    {
      translateX: i,
      translateY: o,
      rotate: Math.atan2(n, t) * gn,
      skewX: Math.atan(c) * gn,
      scaleX: s,
      scaleY: a,
    }
  );
}
var wt;
function ti(t) {
  const n = new (typeof DOMMatrix == "function" ? DOMMatrix : WebKitCSSMatrix)(t + "");
  return n.isIdentity ? Ut : Fn(n.a, n.b, n.c, n.d, n.e, n.f);
}
function ni(t) {
  return t == null ||
    (wt || (wt = document.createElementNS("http://www.w3.org/2000/svg", "g")),
    wt.setAttribute("transform", t),
    !(t = wt.transform.baseVal.consolidate()))
    ? Ut
    : ((t = t.matrix), Fn(t.a, t.b, t.c, t.d, t.e, t.f));
}
function Bn(t, n, e, r) {
  function i(u) {
    return u.length ? u.pop() + " " : "";
  }
  function o(u, l, d, h, g, w) {
    if (u !== d || l !== h) {
      var b = g.push("translate(", null, n, null, e);
      w.push({ i: b - 4, x: K(u, d) }, { i: b - 2, x: K(l, h) });
    } else (d || h) && g.push("translate(" + d + n + h + e);
  }
  function s(u, l, d, h) {
    u !== l
      ? (u - l > 180 ? (l += 360) : l - u > 180 && (u += 360),
        h.push({ i: d.push(i(d) + "rotate(", null, r) - 2, x: K(u, l) }))
      : l && d.push(i(d) + "rotate(" + l + r);
  }
  function a(u, l, d, h) {
    u !== l
      ? h.push({ i: d.push(i(d) + "skewX(", null, r) - 2, x: K(u, l) })
      : l && d.push(i(d) + "skewX(" + l + r);
  }
  function c(u, l, d, h, g, w) {
    if (u !== d || l !== h) {
      var b = g.push(i(g) + "scale(", null, ",", null, ")");
      w.push({ i: b - 4, x: K(u, d) }, { i: b - 2, x: K(l, h) });
    } else (d !== 1 || h !== 1) && g.push(i(g) + "scale(" + d + "," + h + ")");
  }
  return function (u, l) {
    var d = [],
      h = [];
    return (
      (u = t(u)),
      (l = t(l)),
      o(u.translateX, u.translateY, l.translateX, l.translateY, d, h),
      s(u.rotate, l.rotate, d, h),
      a(u.skewX, l.skewX, d, h),
      c(u.scaleX, u.scaleY, l.scaleX, l.scaleY, d, h),
      (u = l = null),
      function (g) {
        for (var w = -1, b = h.length, k; ++w < b; ) d[(k = h[w]).i] = k.x(g);
        return d.join("");
      }
    );
  };
}
var ei = Bn(ti, "px, ", "px)", "deg)"),
  ri = Bn(ni, ", ", ")", ")"),
  ii = 1e-12;
function _n(t) {
  return ((t = Math.exp(t)) + 1 / t) / 2;
}
function oi(t) {
  return ((t = Math.exp(t)) - 1 / t) / 2;
}
function si(t) {
  return ((t = Math.exp(2 * t)) - 1) / (t + 1);
}
const ui = (function t(n, e, r) {
  function i(o, s) {
    var a = o[0],
      c = o[1],
      u = o[2],
      l = s[0],
      d = s[1],
      h = s[2],
      g = l - a,
      w = d - c,
      b = g * g + w * w,
      k,
      y;
    if (b < ii)
      ((y = Math.log(h / u) / n),
        (k = function (G) {
          return [a + G * g, c + G * w, u * Math.exp(n * G * y)];
        }));
    else {
      var N = Math.sqrt(b),
        S = (h * h - u * u + r * b) / (2 * u * e * N),
        $ = (h * h - u * u - r * b) / (2 * h * e * N),
        R = Math.log(Math.sqrt(S * S + 1) - S),
        I = Math.log(Math.sqrt($ * $ + 1) - $);
      ((y = (I - R) / n),
        (k = function (G) {
          var dt = G * y,
            gt = _n(R),
            _t = (u / (e * N)) * (gt * si(n * dt + R) - oi(R));
          return [a + _t * g, c + _t * w, (u * gt) / _n(n * dt + R)];
        }));
    }
    return ((k.duration = (y * 1e3 * n) / Math.SQRT2), k);
  }
  return (
    (i.rho = function (o) {
      var s = Math.max(0.001, +o),
        a = s * s,
        c = a * a;
      return t(s, a, c);
    }),
    i
  );
})(Math.SQRT2, 2, 4);
var et = 0,
  ot = 0,
  rt = 0,
  Hn = 1e3,
  Mt,
  st,
  $t = 0,
  j = 0,
  Rt = 0,
  lt = typeof performance == "object" && performance.now ? performance : Date,
  Pn =
    typeof window == "object" && window.requestAnimationFrame
      ? window.requestAnimationFrame.bind(window)
      : function (t) {
          setTimeout(t, 17);
        };
function tn() {
  return j || (Pn(ai), (j = lt.now() + Rt));
}
function ai() {
  j = 0;
}
function Tt() {
  this._call = this._time = this._next = null;
}
Tt.prototype = Vn.prototype = {
  constructor: Tt,
  restart: function (t, n, e) {
    if (typeof t != "function") throw new TypeError("callback is not a function");
    ((e = (e == null ? tn() : +e) + (n == null ? 0 : +n)),
      !this._next && st !== this && (st ? (st._next = this) : (Mt = this), (st = this)),
      (this._call = t),
      (this._time = e),
      Gt());
  },
  stop: function () {
    this._call && ((this._call = null), (this._time = 1 / 0), Gt());
  },
};
function Vn(t, n, e) {
  var r = new Tt();
  return (r.restart(t, n, e), r);
}
function ci() {
  (tn(), ++et);
  for (var t = Mt, n; t; ) ((n = j - t._time) >= 0 && t._call.call(void 0, n), (t = t._next));
  --et;
}
function mn() {
  ((j = ($t = lt.now()) + Rt), (et = ot = 0));
  try {
    ci();
  } finally {
    ((et = 0), fi(), (j = 0));
  }
}
function li() {
  var t = lt.now(),
    n = t - $t;
  n > Hn && ((Rt -= n), ($t = t));
}
function fi() {
  for (var t, n = Mt, e, r = 1 / 0; n; )
    n._call
      ? (r > n._time && (r = n._time), (t = n), (n = n._next))
      : ((e = n._next), (n._next = null), (n = t ? (t._next = e) : (Mt = e)));
  ((st = t), Gt(r));
}
function Gt(t) {
  if (!et) {
    ot && (ot = clearTimeout(ot));
    var n = t - j;
    n > 24
      ? (t < 1 / 0 && (ot = setTimeout(mn, t - lt.now() - Rt)), rt && (rt = clearInterval(rt)))
      : (rt || (($t = lt.now()), (rt = setInterval(li, Hn))), (et = 1), Pn(mn));
  }
}
function yn(t, n, e) {
  var r = new Tt();
  return (
    (n = n == null ? 0 : +n),
    r.restart(
      (i) => {
        (r.stop(), t(i + n));
      },
      n,
      e
    ),
    r
  );
}
var hi = Qt("start", "end", "cancel", "interrupt"),
  pi = [],
  Yn = 0,
  wn = 1,
  Kt = 2,
  bt = 3,
  xn = 4,
  Wt = 5,
  At = 6;
function It(t, n, e, r, i, o) {
  var s = t.__transition;
  if (!s) t.__transition = {};
  else if (e in s) return;
  di(t, e, {
    name: n,
    index: r,
    group: i,
    on: hi,
    tween: pi,
    time: o.time,
    delay: o.delay,
    duration: o.duration,
    ease: o.ease,
    timer: null,
    state: Yn,
  });
}
function nn(t, n) {
  var e = F(t, n);
  if (e.state > Yn) throw new Error("too late; already scheduled");
  return e;
}
function P(t, n) {
  var e = F(t, n);
  if (e.state > bt) throw new Error("too late; already running");
  return e;
}
function F(t, n) {
  var e = t.__transition;
  if (!e || !(e = e[n])) throw new Error("transition not found");
  return e;
}
function di(t, n, e) {
  var r = t.__transition,
    i;
  ((r[n] = e), (e.timer = Vn(o, 0, e.time)));
  function o(u) {
    ((e.state = wn), e.timer.restart(s, e.delay, e.time), e.delay <= u && s(u - e.delay));
  }
  function s(u) {
    var l, d, h, g;
    if (e.state !== wn) return c();
    for (l in r)
      if (((g = r[l]), g.name === e.name)) {
        if (g.state === bt) return yn(s);
        g.state === xn
          ? ((g.state = At),
            g.timer.stop(),
            g.on.call("interrupt", t, t.__data__, g.index, g.group),
            delete r[l])
          : +l < n &&
            ((g.state = At),
            g.timer.stop(),
            g.on.call("cancel", t, t.__data__, g.index, g.group),
            delete r[l]);
      }
    if (
      (yn(function () {
        e.state === bt && ((e.state = xn), e.timer.restart(a, e.delay, e.time), a(u));
      }),
      (e.state = Kt),
      e.on.call("start", t, t.__data__, e.index, e.group),
      e.state === Kt)
    ) {
      for (e.state = bt, i = new Array((h = e.tween.length)), l = 0, d = -1; l < h; ++l)
        (g = e.tween[l].value.call(t, t.__data__, e.index, e.group)) && (i[++d] = g);
      i.length = d + 1;
    }
  }
  function a(u) {
    for (
      var l =
          u < e.duration
            ? e.ease.call(null, u / e.duration)
            : (e.timer.restart(c), (e.state = Wt), 1),
        d = -1,
        h = i.length;
      ++d < h;
    )
      i[d].call(t, l);
    e.state === Wt && (e.on.call("end", t, t.__data__, e.index, e.group), c());
  }
  function c() {
    ((e.state = At), e.timer.stop(), delete r[n]);
    for (var u in r) return;
    delete t.__transition;
  }
}
function Nt(t, n) {
  var e = t.__transition,
    r,
    i,
    o = !0,
    s;
  if (e) {
    n = n == null ? null : n + "";
    for (s in e) {
      if ((r = e[s]).name !== n) {
        o = !1;
        continue;
      }
      ((i = r.state > Kt && r.state < Wt),
        (r.state = At),
        r.timer.stop(),
        r.on.call(i ? "interrupt" : "cancel", t, t.__data__, r.index, r.group),
        delete e[s]);
    }
    o && delete t.__transition;
  }
}
function gi(t) {
  return this.each(function () {
    Nt(this, t);
  });
}
function _i(t, n) {
  var e, r;
  return function () {
    var i = P(this, t),
      o = i.tween;
    if (o !== e) {
      r = e = o;
      for (var s = 0, a = r.length; s < a; ++s)
        if (r[s].name === n) {
          ((r = r.slice()), r.splice(s, 1));
          break;
        }
    }
    i.tween = r;
  };
}
function mi(t, n, e) {
  var r, i;
  if (typeof e != "function") throw new Error();
  return function () {
    var o = P(this, t),
      s = o.tween;
    if (s !== r) {
      i = (r = s).slice();
      for (var a = { name: n, value: e }, c = 0, u = i.length; c < u; ++c)
        if (i[c].name === n) {
          i[c] = a;
          break;
        }
      c === u && i.push(a);
    }
    o.tween = i;
  };
}
function yi(t, n) {
  var e = this._id;
  if (((t += ""), arguments.length < 2)) {
    for (var r = F(this.node(), e).tween, i = 0, o = r.length, s; i < o; ++i)
      if ((s = r[i]).name === t) return s.value;
    return null;
  }
  return this.each((n == null ? _i : mi)(e, t, n));
}
function en(t, n, e) {
  var r = t._id;
  return (
    t.each(function () {
      var i = P(this, r);
      (i.value || (i.value = {}))[n] = e.apply(this, arguments);
    }),
    function (i) {
      return F(i, r).value[n];
    }
  );
}
function On(t, n) {
  var e;
  return (typeof n == "number" ? K : n instanceof ct ? dn : (e = ct(n)) ? ((n = e), dn) : jr)(t, n);
}
function wi(t) {
  return function () {
    this.removeAttribute(t);
  };
}
function xi(t) {
  return function () {
    this.removeAttributeNS(t.space, t.local);
  };
}
function vi(t, n, e) {
  var r,
    i = e + "",
    o;
  return function () {
    var s = this.getAttribute(t);
    return s === i ? null : s === r ? o : (o = n((r = s), e));
  };
}
function bi(t, n, e) {
  var r,
    i = e + "",
    o;
  return function () {
    var s = this.getAttributeNS(t.space, t.local);
    return s === i ? null : s === r ? o : (o = n((r = s), e));
  };
}
function Ai(t, n, e) {
  var r, i, o;
  return function () {
    var s,
      a = e(this),
      c;
    return a == null
      ? void this.removeAttribute(t)
      : ((s = this.getAttribute(t)),
        (c = a + ""),
        s === c ? null : s === r && c === i ? o : ((i = c), (o = n((r = s), a))));
  };
}
function Ni(t, n, e) {
  var r, i, o;
  return function () {
    var s,
      a = e(this),
      c;
    return a == null
      ? void this.removeAttributeNS(t.space, t.local)
      : ((s = this.getAttributeNS(t.space, t.local)),
        (c = a + ""),
        s === c ? null : s === r && c === i ? o : ((i = c), (o = n((r = s), a))));
  };
}
function zi(t, n) {
  var e = Ct(t),
    r = e === "transform" ? ri : On;
  return this.attrTween(
    t,
    typeof n == "function"
      ? (e.local ? Ni : Ai)(e, r, en(this, "attr." + t, n))
      : n == null
        ? (e.local ? xi : wi)(e)
        : (e.local ? bi : vi)(e, r, n)
  );
}
function ki(t, n) {
  return function (e) {
    this.setAttribute(t, n.call(this, e));
  };
}
function Ei(t, n) {
  return function (e) {
    this.setAttributeNS(t.space, t.local, n.call(this, e));
  };
}
function Si(t, n) {
  var e, r;
  function i() {
    var o = n.apply(this, arguments);
    return (o !== r && (e = (r = o) && Ei(t, o)), e);
  }
  return ((i._value = n), i);
}
function Mi(t, n) {
  var e, r;
  function i() {
    var o = n.apply(this, arguments);
    return (o !== r && (e = (r = o) && ki(t, o)), e);
  }
  return ((i._value = n), i);
}
function $i(t, n) {
  var e = "attr." + t;
  if (arguments.length < 2) return (e = this.tween(e)) && e._value;
  if (n == null) return this.tween(e, null);
  if (typeof n != "function") throw new Error();
  var r = Ct(t);
  return this.tween(e, (r.local ? Si : Mi)(r, n));
}
function Ti(t, n) {
  return function () {
    nn(this, t).delay = +n.apply(this, arguments);
  };
}
function Ci(t, n) {
  return (
    (n = +n),
    function () {
      nn(this, t).delay = n;
    }
  );
}
function Ri(t) {
  var n = this._id;
  return arguments.length
    ? this.each((typeof t == "function" ? Ti : Ci)(n, t))
    : F(this.node(), n).delay;
}
function Ii(t, n) {
  return function () {
    P(this, t).duration = +n.apply(this, arguments);
  };
}
function Di(t, n) {
  return (
    (n = +n),
    function () {
      P(this, t).duration = n;
    }
  );
}
function Xi(t) {
  var n = this._id;
  return arguments.length
    ? this.each((typeof t == "function" ? Ii : Di)(n, t))
    : F(this.node(), n).duration;
}
function qi(t, n) {
  if (typeof n != "function") throw new Error();
  return function () {
    P(this, t).ease = n;
  };
}
function Fi(t) {
  var n = this._id;
  return arguments.length ? this.each(qi(n, t)) : F(this.node(), n).ease;
}
function Bi(t, n) {
  return function () {
    var e = n.apply(this, arguments);
    if (typeof e != "function") throw new Error();
    P(this, t).ease = e;
  };
}
function Hi(t) {
  if (typeof t != "function") throw new Error();
  return this.each(Bi(this._id, t));
}
function Pi(t) {
  typeof t != "function" && (t = Nn(t));
  for (var n = this._groups, e = n.length, r = new Array(e), i = 0; i < e; ++i)
    for (var o = n[i], s = o.length, a = (r[i] = []), c, u = 0; u < s; ++u)
      (c = o[u]) && t.call(c, c.__data__, u, o) && a.push(c);
  return new U(r, this._parents, this._name, this._id);
}
function Vi(t) {
  if (t._id !== this._id) throw new Error();
  for (
    var n = this._groups,
      e = t._groups,
      r = n.length,
      i = e.length,
      o = Math.min(r, i),
      s = new Array(r),
      a = 0;
    a < o;
    ++a
  )
    for (var c = n[a], u = e[a], l = c.length, d = (s[a] = new Array(l)), h, g = 0; g < l; ++g)
      (h = c[g] || u[g]) && (d[g] = h);
  for (; a < r; ++a) s[a] = n[a];
  return new U(s, this._parents, this._name, this._id);
}
function Yi(t) {
  return (t + "")
    .trim()
    .split(/^|\s+/)
    .every(function (n) {
      var e = n.indexOf(".");
      return (e >= 0 && (n = n.slice(0, e)), !n || n === "start");
    });
}
function Oi(t, n, e) {
  var r,
    i,
    o = Yi(n) ? nn : P;
  return function () {
    var s = o(this, t),
      a = s.on;
    (a !== r && (i = (r = a).copy()).on(n, e), (s.on = i));
  };
}
function Li(t, n) {
  var e = this._id;
  return arguments.length < 2 ? F(this.node(), e).on.on(t) : this.each(Oi(e, t, n));
}
function Ui(t) {
  return function () {
    var n = this.parentNode;
    for (var e in this.__transition) if (+e !== t) return;
    n && n.removeChild(this);
  };
}
function Gi() {
  return this.on("end.remove", Ui(this._id));
}
function Ki(t) {
  var n = this._name,
    e = this._id;
  typeof t != "function" && (t = Zt(t));
  for (var r = this._groups, i = r.length, o = new Array(i), s = 0; s < i; ++s)
    for (var a = r[s], c = a.length, u = (o[s] = new Array(c)), l, d, h = 0; h < c; ++h)
      (l = a[h]) &&
        (d = t.call(l, l.__data__, h, a)) &&
        ("__data__" in l && (d.__data__ = l.__data__), (u[h] = d), It(u[h], n, e, h, u, F(l, e)));
  return new U(o, this._parents, n, e);
}
function Wi(t) {
  var n = this._name,
    e = this._id;
  typeof t != "function" && (t = An(t));
  for (var r = this._groups, i = r.length, o = [], s = [], a = 0; a < i; ++a)
    for (var c = r[a], u = c.length, l, d = 0; d < u; ++d)
      if ((l = c[d])) {
        for (var h = t.call(l, l.__data__, d, c), g, w = F(l, e), b = 0, k = h.length; b < k; ++b)
          (g = h[b]) && It(g, n, e, b, h, w);
        (o.push(h), s.push(l));
      }
  return new U(o, s, n, e);
}
var Qi = ht.prototype.constructor;
function Zi() {
  return new Qi(this._groups, this._parents);
}
function Ji(t, n) {
  var e, r, i;
  return function () {
    var o = nt(this, t),
      s = (this.style.removeProperty(t), nt(this, t));
    return o === s ? null : o === e && s === r ? i : (i = n((e = o), (r = s)));
  };
}
function Ln(t) {
  return function () {
    this.style.removeProperty(t);
  };
}
function ji(t, n, e) {
  var r,
    i = e + "",
    o;
  return function () {
    var s = nt(this, t);
    return s === i ? null : s === r ? o : (o = n((r = s), e));
  };
}
function to(t, n, e) {
  var r, i, o;
  return function () {
    var s = nt(this, t),
      a = e(this),
      c = a + "";
    return (
      a == null && (c = a = (this.style.removeProperty(t), nt(this, t))),
      s === c ? null : s === r && c === i ? o : ((i = c), (o = n((r = s), a)))
    );
  };
}
function no(t, n) {
  var e,
    r,
    i,
    o = "style." + n,
    s = "end." + o,
    a;
  return function () {
    var c = P(this, t),
      u = c.on,
      l = c.value[o] == null ? a || (a = Ln(n)) : void 0;
    ((u !== e || i !== l) && (r = (e = u).copy()).on(s, (i = l)), (c.on = r));
  };
}
function eo(t, n, e) {
  var r = (t += "") == "transform" ? ei : On;
  return n == null
    ? this.styleTween(t, Ji(t, r)).on("end.style." + t, Ln(t))
    : typeof n == "function"
      ? this.styleTween(t, to(t, r, en(this, "style." + t, n))).each(no(this._id, t))
      : this.styleTween(t, ji(t, r, n), e).on("end.style." + t, null);
}
function ro(t, n, e) {
  return function (r) {
    this.style.setProperty(t, n.call(this, r), e);
  };
}
function io(t, n, e) {
  var r, i;
  function o() {
    var s = n.apply(this, arguments);
    return (s !== i && (r = (i = s) && ro(t, s, e)), r);
  }
  return ((o._value = n), o);
}
function oo(t, n, e) {
  var r = "style." + (t += "");
  if (arguments.length < 2) return (r = this.tween(r)) && r._value;
  if (n == null) return this.tween(r, null);
  if (typeof n != "function") throw new Error();
  return this.tween(r, io(t, n, e ?? ""));
}
function so(t) {
  return function () {
    this.textContent = t;
  };
}
function uo(t) {
  return function () {
    var n = t(this);
    this.textContent = n ?? "";
  };
}
function ao(t) {
  return this.tween(
    "text",
    typeof t == "function" ? uo(en(this, "text", t)) : so(t == null ? "" : t + "")
  );
}
function co(t) {
  return function (n) {
    this.textContent = t.call(this, n);
  };
}
function lo(t) {
  var n, e;
  function r() {
    var i = t.apply(this, arguments);
    return (i !== e && (n = (e = i) && co(i)), n);
  }
  return ((r._value = t), r);
}
function fo(t) {
  var n = "text";
  if (arguments.length < 1) return (n = this.tween(n)) && n._value;
  if (t == null) return this.tween(n, null);
  if (typeof t != "function") throw new Error();
  return this.tween(n, lo(t));
}
function ho() {
  for (
    var t = this._name, n = this._id, e = Un(), r = this._groups, i = r.length, o = 0;
    o < i;
    ++o
  )
    for (var s = r[o], a = s.length, c, u = 0; u < a; ++u)
      if ((c = s[u])) {
        var l = F(c, n);
        It(c, t, e, u, s, {
          time: l.time + l.delay + l.duration,
          delay: 0,
          duration: l.duration,
          ease: l.ease,
        });
      }
  return new U(r, this._parents, t, e);
}
function po() {
  var t,
    n,
    e = this,
    r = e._id,
    i = e.size();
  return new Promise(function (o, s) {
    var a = { value: s },
      c = {
        value: function () {
          --i === 0 && o();
        },
      };
    (e.each(function () {
      var u = P(this, r),
        l = u.on;
      (l !== t &&
        ((n = (t = l).copy()), n._.cancel.push(a), n._.interrupt.push(a), n._.end.push(c)),
        (u.on = n));
    }),
      i === 0 && o());
  });
}
var go = 0;
function U(t, n, e, r) {
  ((this._groups = t), (this._parents = n), (this._name = e), (this._id = r));
}
function Un() {
  return ++go;
}
var O = ht.prototype;
U.prototype = {
  constructor: U,
  select: Ki,
  selectAll: Wi,
  selectChild: O.selectChild,
  selectChildren: O.selectChildren,
  filter: Pi,
  merge: Vi,
  selection: Zi,
  transition: ho,
  call: O.call,
  nodes: O.nodes,
  node: O.node,
  size: O.size,
  empty: O.empty,
  each: O.each,
  on: Li,
  attr: zi,
  attrTween: $i,
  style: eo,
  styleTween: oo,
  text: ao,
  textTween: fo,
  remove: Gi,
  tween: yi,
  delay: Ri,
  duration: Xi,
  ease: Fi,
  easeVarying: Hi,
  end: po,
  [Symbol.iterator]: O[Symbol.iterator],
};
function _o(t) {
  return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
}
var mo = { time: null, delay: 0, duration: 250, ease: _o };
function yo(t, n) {
  for (var e; !(e = t.__transition) || !(e = e[n]); )
    if (!(t = t.parentNode)) throw new Error(`transition ${n} not found`);
  return e;
}
function wo(t) {
  var n, e;
  t instanceof U
    ? ((n = t._id), (t = t._name))
    : ((n = Un()), ((e = mo).time = tn()), (t = t == null ? null : t + ""));
  for (var r = this._groups, i = r.length, o = 0; o < i; ++o)
    for (var s = r[o], a = s.length, c, u = 0; u < a; ++u)
      (c = s[u]) && It(c, t, n, u, s, e || yo(c, n));
  return new U(r, this._parents, t, n);
}
ht.prototype.interrupt = gi;
ht.prototype.transition = wo;
function xo(t) {
  var n = 0,
    e = t.children,
    r = e && e.length;
  if (!r) n = 1;
  else for (; --r >= 0; ) n += e[r].value;
  t.value = n;
}
function vo() {
  return this.eachAfter(xo);
}
function bo(t, n) {
  let e = -1;
  for (const r of this) t.call(n, r, ++e, this);
  return this;
}
function Ao(t, n) {
  for (var e = this, r = [e], i, o, s = -1; (e = r.pop()); )
    if ((t.call(n, e, ++s, this), (i = e.children)))
      for (o = i.length - 1; o >= 0; --o) r.push(i[o]);
  return this;
}
function No(t, n) {
  for (var e = this, r = [e], i = [], o, s, a, c = -1; (e = r.pop()); )
    if ((i.push(e), (o = e.children))) for (s = 0, a = o.length; s < a; ++s) r.push(o[s]);
  for (; (e = i.pop()); ) t.call(n, e, ++c, this);
  return this;
}
function zo(t, n) {
  let e = -1;
  for (const r of this) if (t.call(n, r, ++e, this)) return r;
}
function ko(t) {
  return this.eachAfter(function (n) {
    for (var e = +t(n.data) || 0, r = n.children, i = r && r.length; --i >= 0; ) e += r[i].value;
    n.value = e;
  });
}
function Eo(t) {
  return this.eachBefore(function (n) {
    n.children && n.children.sort(t);
  });
}
function So(t) {
  for (var n = this, e = Mo(n, t), r = [n]; n !== e; ) ((n = n.parent), r.push(n));
  for (var i = r.length; t !== e; ) (r.splice(i, 0, t), (t = t.parent));
  return r;
}
function Mo(t, n) {
  if (t === n) return t;
  var e = t.ancestors(),
    r = n.ancestors(),
    i = null;
  for (t = e.pop(), n = r.pop(); t === n; ) ((i = t), (t = e.pop()), (n = r.pop()));
  return i;
}
function $o() {
  for (var t = this, n = [t]; (t = t.parent); ) n.push(t);
  return n;
}
function To() {
  return Array.from(this);
}
function Co() {
  var t = [];
  return (
    this.eachBefore(function (n) {
      n.children || t.push(n);
    }),
    t
  );
}
function Ro() {
  var t = this,
    n = [];
  return (
    t.each(function (e) {
      e !== t && n.push({ source: e.parent, target: e });
    }),
    n
  );
}
function* Io() {
  var t = this,
    n,
    e = [t],
    r,
    i,
    o;
  do
    for (n = e.reverse(), e = []; (t = n.pop()); )
      if ((yield t, (r = t.children))) for (i = 0, o = r.length; i < o; ++i) e.push(r[i]);
  while (e.length);
}
function Gn(t, n) {
  t instanceof Map ? ((t = [void 0, t]), n === void 0 && (n = qo)) : n === void 0 && (n = Xo);
  for (var e = new ft(t), r, i = [e], o, s, a, c; (r = i.pop()); )
    if ((s = n(r.data)) && (c = (s = Array.from(s)).length))
      for (r.children = s, a = c - 1; a >= 0; --a)
        (i.push((o = s[a] = new ft(s[a]))), (o.parent = r), (o.depth = r.depth + 1));
  return e.eachBefore(Bo);
}
function Do() {
  return Gn(this).eachBefore(Fo);
}
function Xo(t) {
  return t.children;
}
function qo(t) {
  return Array.isArray(t) ? t[1] : null;
}
function Fo(t) {
  (t.data.value !== void 0 && (t.value = t.data.value), (t.data = t.data.data));
}
function Bo(t) {
  var n = 0;
  do t.height = n;
  while ((t = t.parent) && t.height < ++n);
}
function ft(t) {
  ((this.data = t), (this.depth = this.height = 0), (this.parent = null));
}
ft.prototype = Gn.prototype = {
  constructor: ft,
  count: vo,
  each: bo,
  eachAfter: No,
  eachBefore: Ao,
  find: zo,
  sum: ko,
  sort: Eo,
  path: So,
  ancestors: $o,
  descendants: To,
  leaves: Co,
  links: Ro,
  copy: Do,
  [Symbol.iterator]: Io,
};
function Ho(t, n) {
  return t.parent === n.parent ? 1 : 2;
}
function Ft(t) {
  var n = t.children;
  return n ? n[0] : t.t;
}
function Bt(t) {
  var n = t.children;
  return n ? n[n.length - 1] : t.t;
}
function Po(t, n, e) {
  var r = e / (n.i - t.i);
  ((n.c -= r), (n.s += e), (t.c += r), (n.z += e), (n.m += e));
}
function Vo(t) {
  for (var n = 0, e = 0, r = t.children, i = r.length, o; --i >= 0; )
    ((o = r[i]), (o.z += n), (o.m += n), (n += o.s + (e += o.c)));
}
function Yo(t, n, e) {
  return t.a.parent === n.parent ? t.a : e;
}
function zt(t, n) {
  ((this._ = t),
    (this.parent = null),
    (this.children = null),
    (this.A = null),
    (this.a = this),
    (this.z = 0),
    (this.m = 0),
    (this.c = 0),
    (this.s = 0),
    (this.t = null),
    (this.i = n));
}
zt.prototype = Object.create(ft.prototype);
function Oo(t) {
  for (var n = new zt(t, 0), e, r = [n], i, o, s, a; (e = r.pop()); )
    if ((o = e._.children))
      for (e.children = new Array((a = o.length)), s = a - 1; s >= 0; --s)
        (r.push((i = e.children[s] = new zt(o[s], s))), (i.parent = e));
  return (((n.parent = new zt(null, 0)).children = [n]), n);
}
function Zo() {
  var t = Ho,
    n = 1,
    e = 1,
    r = null;
  function i(u) {
    var l = Oo(u);
    if ((l.eachAfter(o), (l.parent.m = -l.z), l.eachBefore(s), r)) u.eachBefore(c);
    else {
      var d = u,
        h = u,
        g = u;
      u.eachBefore(function (N) {
        (N.x < d.x && (d = N), N.x > h.x && (h = N), N.depth > g.depth && (g = N));
      });
      var w = d === h ? 1 : t(d, h) / 2,
        b = w - d.x,
        k = n / (h.x + w + b),
        y = e / (g.depth || 1);
      u.eachBefore(function (N) {
        ((N.x = (N.x + b) * k), (N.y = N.depth * y));
      });
    }
    return u;
  }
  function o(u) {
    var l = u.children,
      d = u.parent.children,
      h = u.i ? d[u.i - 1] : null;
    if (l) {
      Vo(u);
      var g = (l[0].z + l[l.length - 1].z) / 2;
      h ? ((u.z = h.z + t(u._, h._)), (u.m = u.z - g)) : (u.z = g);
    } else h && (u.z = h.z + t(u._, h._));
    u.parent.A = a(u, h, u.parent.A || d[0]);
  }
  function s(u) {
    ((u._.x = u.z + u.parent.m), (u.m += u.parent.m));
  }
  function a(u, l, d) {
    if (l) {
      for (
        var h = u, g = u, w = l, b = h.parent.children[0], k = h.m, y = g.m, N = w.m, S = b.m, $;
        (w = Bt(w)), (h = Ft(h)), w && h;
      )
        ((b = Ft(b)),
          (g = Bt(g)),
          (g.a = u),
          ($ = w.z + N - h.z - k + t(w._, h._)),
          $ > 0 && (Po(Yo(w, u, d), u, $), (k += $), (y += $)),
          (N += w.m),
          (k += h.m),
          (S += b.m),
          (y += g.m));
      (w && !Bt(g) && ((g.t = w), (g.m += N - y)),
        h && !Ft(b) && ((b.t = h), (b.m += k - S), (d = u)));
    }
    return d;
  }
  function c(u) {
    ((u.x *= n), (u.y = u.depth * e));
  }
  return (
    (i.separation = function (u) {
      return arguments.length ? ((t = u), i) : t;
    }),
    (i.size = function (u) {
      return arguments.length ? ((r = !1), (n = +u[0]), (e = +u[1]), i) : r ? null : [n, e];
    }),
    (i.nodeSize = function (u) {
      return arguments.length ? ((r = !0), (n = +u[0]), (e = +u[1]), i) : r ? [n, e] : null;
    }),
    i
  );
}
const xt = (t) => () => t;
function Lo(t, { sourceEvent: n, target: e, transform: r, dispatch: i }) {
  Object.defineProperties(this, {
    type: { value: t, enumerable: !0, configurable: !0 },
    sourceEvent: { value: n, enumerable: !0, configurable: !0 },
    target: { value: e, enumerable: !0, configurable: !0 },
    transform: { value: r, enumerable: !0, configurable: !0 },
    _: { value: i },
  });
}
function L(t, n, e) {
  ((this.k = t), (this.x = n), (this.y = e));
}
L.prototype = {
  constructor: L,
  scale: function (t) {
    return t === 1 ? this : new L(this.k * t, this.x, this.y);
  },
  translate: function (t, n) {
    return (t === 0) & (n === 0) ? this : new L(this.k, this.x + this.k * t, this.y + this.k * n);
  },
  apply: function (t) {
    return [t[0] * this.k + this.x, t[1] * this.k + this.y];
  },
  applyX: function (t) {
    return t * this.k + this.x;
  },
  applyY: function (t) {
    return t * this.k + this.y;
  },
  invert: function (t) {
    return [(t[0] - this.x) / this.k, (t[1] - this.y) / this.k];
  },
  invertX: function (t) {
    return (t - this.x) / this.k;
  },
  invertY: function (t) {
    return (t - this.y) / this.k;
  },
  rescaleX: function (t) {
    return t.copy().domain(t.range().map(this.invertX, this).map(t.invert, t));
  },
  rescaleY: function (t) {
    return t.copy().domain(t.range().map(this.invertY, this).map(t.invert, t));
  },
  toString: function () {
    return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
  },
};
var Kn = new L(1, 0, 0);
L.prototype;
function Ht(t) {
  t.stopImmediatePropagation();
}
function it(t) {
  (t.preventDefault(), t.stopImmediatePropagation());
}
function Uo(t) {
  return (!t.ctrlKey || t.type === "wheel") && !t.button;
}
function Go() {
  var t = this;
  return t instanceof SVGElement
    ? ((t = t.ownerSVGElement || t),
      t.hasAttribute("viewBox")
        ? ((t = t.viewBox.baseVal),
          [
            [t.x, t.y],
            [t.x + t.width, t.y + t.height],
          ])
        : [
            [0, 0],
            [t.width.baseVal.value, t.height.baseVal.value],
          ])
    : [
        [0, 0],
        [t.clientWidth, t.clientHeight],
      ];
}
function vn() {
  return this.__zoom || Kn;
}
function Ko(t) {
  return -t.deltaY * (t.deltaMode === 1 ? 0.05 : t.deltaMode ? 1 : 0.002) * (t.ctrlKey ? 10 : 1);
}
function Wo() {
  return navigator.maxTouchPoints || "ontouchstart" in this;
}
function Qo(t, n, e) {
  var r = t.invertX(n[0][0]) - e[0][0],
    i = t.invertX(n[1][0]) - e[1][0],
    o = t.invertY(n[0][1]) - e[0][1],
    s = t.invertY(n[1][1]) - e[1][1];
  return t.translate(
    i > r ? (r + i) / 2 : Math.min(0, r) || Math.max(0, i),
    s > o ? (o + s) / 2 : Math.min(0, o) || Math.max(0, s)
  );
}
function Jo() {
  var t = Uo,
    n = Go,
    e = Qo,
    r = Ko,
    i = Wo,
    o = [0, 1 / 0],
    s = [
      [-1 / 0, -1 / 0],
      [1 / 0, 1 / 0],
    ],
    a = 250,
    c = ui,
    u = Qt("start", "zoom", "end"),
    l,
    d,
    h,
    g = 500,
    w = 150,
    b = 0,
    k = 10;
  function y(f) {
    f.property("__zoom", vn)
      .on("wheel.zoom", dt, { passive: !1 })
      .on("mousedown.zoom", gt)
      .on("dblclick.zoom", _t)
      .filter(i)
      .on("touchstart.zoom", Wn)
      .on("touchmove.zoom", Qn)
      .on("touchend.zoom touchcancel.zoom", Zn)
      .style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
  }
  ((y.transform = function (f, _, p, m) {
    var x = f.selection ? f.selection() : f;
    (x.property("__zoom", vn),
      f !== x
        ? R(f, _, p, m)
        : x.interrupt().each(function () {
            I(this, arguments)
              .event(m)
              .start()
              .zoom(null, typeof _ == "function" ? _.apply(this, arguments) : _)
              .end();
          }));
  }),
    (y.scaleBy = function (f, _, p, m) {
      y.scaleTo(
        f,
        function () {
          var x = this.__zoom.k,
            v = typeof _ == "function" ? _.apply(this, arguments) : _;
          return x * v;
        },
        p,
        m
      );
    }),
    (y.scaleTo = function (f, _, p, m) {
      y.transform(
        f,
        function () {
          var x = n.apply(this, arguments),
            v = this.__zoom,
            A = p == null ? $(x) : typeof p == "function" ? p.apply(this, arguments) : p,
            z = v.invert(A),
            E = typeof _ == "function" ? _.apply(this, arguments) : _;
          return e(S(N(v, E), A, z), x, s);
        },
        p,
        m
      );
    }),
    (y.translateBy = function (f, _, p, m) {
      y.transform(
        f,
        function () {
          return e(
            this.__zoom.translate(
              typeof _ == "function" ? _.apply(this, arguments) : _,
              typeof p == "function" ? p.apply(this, arguments) : p
            ),
            n.apply(this, arguments),
            s
          );
        },
        null,
        m
      );
    }),
    (y.translateTo = function (f, _, p, m, x) {
      y.transform(
        f,
        function () {
          var v = n.apply(this, arguments),
            A = this.__zoom,
            z = m == null ? $(v) : typeof m == "function" ? m.apply(this, arguments) : m;
          return e(
            Kn.translate(z[0], z[1])
              .scale(A.k)
              .translate(
                typeof _ == "function" ? -_.apply(this, arguments) : -_,
                typeof p == "function" ? -p.apply(this, arguments) : -p
              ),
            v,
            s
          );
        },
        m,
        x
      );
    }));
  function N(f, _) {
    return ((_ = Math.max(o[0], Math.min(o[1], _))), _ === f.k ? f : new L(_, f.x, f.y));
  }
  function S(f, _, p) {
    var m = _[0] - p[0] * f.k,
      x = _[1] - p[1] * f.k;
    return m === f.x && x === f.y ? f : new L(f.k, m, x);
  }
  function $(f) {
    return [(+f[0][0] + +f[1][0]) / 2, (+f[0][1] + +f[1][1]) / 2];
  }
  function R(f, _, p, m) {
    f.on("start.zoom", function () {
      I(this, arguments).event(m).start();
    })
      .on("interrupt.zoom end.zoom", function () {
        I(this, arguments).event(m).end();
      })
      .tween("zoom", function () {
        var x = this,
          v = arguments,
          A = I(x, v).event(m),
          z = n.apply(x, v),
          E = p == null ? $(z) : typeof p == "function" ? p.apply(x, v) : p,
          B = Math.max(z[1][0] - z[0][0], z[1][1] - z[0][1]),
          M = x.__zoom,
          D = typeof _ == "function" ? _.apply(x, v) : _,
          V = c(M.invert(E).concat(B / M.k), D.invert(E).concat(B / D.k));
        return function (X) {
          if (X === 1) X = D;
          else {
            var Y = V(X),
              Dt = B / Y[2];
            X = new L(Dt, E[0] - Y[0] * Dt, E[1] - Y[1] * Dt);
          }
          A.zoom(null, X);
        };
      });
  }
  function I(f, _, p) {
    return (!p && f.__zooming) || new G(f, _);
  }
  function G(f, _) {
    ((this.that = f),
      (this.args = _),
      (this.active = 0),
      (this.sourceEvent = null),
      (this.extent = n.apply(f, _)),
      (this.taps = 0));
  }
  G.prototype = {
    event: function (f) {
      return (f && (this.sourceEvent = f), this);
    },
    start: function () {
      return (++this.active === 1 && ((this.that.__zooming = this), this.emit("start")), this);
    },
    zoom: function (f, _) {
      return (
        this.mouse && f !== "mouse" && (this.mouse[1] = _.invert(this.mouse[0])),
        this.touch0 && f !== "touch" && (this.touch0[1] = _.invert(this.touch0[0])),
        this.touch1 && f !== "touch" && (this.touch1[1] = _.invert(this.touch1[0])),
        (this.that.__zoom = _),
        this.emit("zoom"),
        this
      );
    },
    end: function () {
      return (--this.active === 0 && (delete this.that.__zooming, this.emit("end")), this);
    },
    emit: function (f) {
      var _ = Q(this.that).datum();
      u.call(
        f,
        this.that,
        new Lo(f, {
          sourceEvent: this.sourceEvent,
          target: y,
          transform: this.that.__zoom,
          dispatch: u,
        }),
        _
      );
    },
  };
  function dt(f, ..._) {
    if (!t.apply(this, arguments)) return;
    var p = I(this, _).event(f),
      m = this.__zoom,
      x = Math.max(o[0], Math.min(o[1], m.k * Math.pow(2, r.apply(this, arguments)))),
      v = W(f);
    if (p.wheel)
      ((p.mouse[0][0] !== v[0] || p.mouse[0][1] !== v[1]) &&
        (p.mouse[1] = m.invert((p.mouse[0] = v))),
        clearTimeout(p.wheel));
    else {
      if (m.k === x) return;
      ((p.mouse = [v, m.invert(v)]), Nt(this), p.start());
    }
    (it(f),
      (p.wheel = setTimeout(A, w)),
      p.zoom("mouse", e(S(N(m, x), p.mouse[0], p.mouse[1]), p.extent, s)));
    function A() {
      ((p.wheel = null), p.end());
    }
  }
  function gt(f, ..._) {
    if (h || !t.apply(this, arguments)) return;
    var p = f.currentTarget,
      m = I(this, _, !0).event(f),
      x = Q(f.view).on("mousemove.zoom", E, !0).on("mouseup.zoom", B, !0),
      v = W(f, p),
      A = f.clientX,
      z = f.clientY;
    (Ir(f.view), Ht(f), (m.mouse = [v, this.__zoom.invert(v)]), Nt(this), m.start());
    function E(M) {
      if ((it(M), !m.moved)) {
        var D = M.clientX - A,
          V = M.clientY - z;
        m.moved = D * D + V * V > b;
      }
      m.event(M).zoom(
        "mouse",
        e(S(m.that.__zoom, (m.mouse[0] = W(M, p)), m.mouse[1]), m.extent, s)
      );
    }
    function B(M) {
      (x.on("mousemove.zoom mouseup.zoom", null), Dr(M.view, m.moved), it(M), m.event(M).end());
    }
  }
  function _t(f, ..._) {
    if (t.apply(this, arguments)) {
      var p = this.__zoom,
        m = W(f.changedTouches ? f.changedTouches[0] : f, this),
        x = p.invert(m),
        v = p.k * (f.shiftKey ? 0.5 : 2),
        A = e(S(N(p, v), m, x), n.apply(this, _), s);
      (it(f),
        a > 0
          ? Q(this).transition().duration(a).call(R, A, m, f)
          : Q(this).call(y.transform, A, m, f));
    }
  }
  function Wn(f, ..._) {
    if (t.apply(this, arguments)) {
      var p = f.touches,
        m = p.length,
        x = I(this, _, f.changedTouches.length === m).event(f),
        v,
        A,
        z,
        E;
      for (Ht(f), A = 0; A < m; ++A)
        ((z = p[A]),
          (E = W(z, this)),
          (E = [E, this.__zoom.invert(E), z.identifier]),
          x.touch0
            ? !x.touch1 && x.touch0[2] !== E[2] && ((x.touch1 = E), (x.taps = 0))
            : ((x.touch0 = E), (v = !0), (x.taps = 1 + !!l)));
      (l && (l = clearTimeout(l)),
        v &&
          (x.taps < 2 &&
            ((d = E[0]),
            (l = setTimeout(function () {
              l = null;
            }, g))),
          Nt(this),
          x.start()));
    }
  }
  function Qn(f, ..._) {
    if (this.__zooming) {
      var p = I(this, _).event(f),
        m = f.changedTouches,
        x = m.length,
        v,
        A,
        z,
        E;
      for (it(f), v = 0; v < x; ++v)
        ((A = m[v]),
          (z = W(A, this)),
          p.touch0 && p.touch0[2] === A.identifier
            ? (p.touch0[0] = z)
            : p.touch1 && p.touch1[2] === A.identifier && (p.touch1[0] = z));
      if (((A = p.that.__zoom), p.touch1)) {
        var B = p.touch0[0],
          M = p.touch0[1],
          D = p.touch1[0],
          V = p.touch1[1],
          X = (X = D[0] - B[0]) * X + (X = D[1] - B[1]) * X,
          Y = (Y = V[0] - M[0]) * Y + (Y = V[1] - M[1]) * Y;
        ((A = N(A, Math.sqrt(X / Y))),
          (z = [(B[0] + D[0]) / 2, (B[1] + D[1]) / 2]),
          (E = [(M[0] + V[0]) / 2, (M[1] + V[1]) / 2]));
      } else if (p.touch0) ((z = p.touch0[0]), (E = p.touch0[1]));
      else return;
      p.zoom("touch", e(S(A, z, E), p.extent, s));
    }
  }
  function Zn(f, ..._) {
    if (this.__zooming) {
      var p = I(this, _).event(f),
        m = f.changedTouches,
        x = m.length,
        v,
        A;
      for (
        Ht(f),
          h && clearTimeout(h),
          h = setTimeout(function () {
            h = null;
          }, g),
          v = 0;
        v < x;
        ++v
      )
        ((A = m[v]),
          p.touch0 && p.touch0[2] === A.identifier
            ? delete p.touch0
            : p.touch1 && p.touch1[2] === A.identifier && delete p.touch1);
      if ((p.touch1 && !p.touch0 && ((p.touch0 = p.touch1), delete p.touch1), p.touch0))
        p.touch0[1] = this.__zoom.invert(p.touch0[0]);
      else if (
        (p.end(), p.taps === 2 && ((A = W(A, this)), Math.hypot(d[0] - A[0], d[1] - A[1]) < k))
      ) {
        var z = Q(this).on("dblclick.zoom");
        z && z.apply(this, arguments);
      }
    }
  }
  return (
    (y.wheelDelta = function (f) {
      return arguments.length ? ((r = typeof f == "function" ? f : xt(+f)), y) : r;
    }),
    (y.filter = function (f) {
      return arguments.length ? ((t = typeof f == "function" ? f : xt(!!f)), y) : t;
    }),
    (y.touchable = function (f) {
      return arguments.length ? ((i = typeof f == "function" ? f : xt(!!f)), y) : i;
    }),
    (y.extent = function (f) {
      return arguments.length
        ? ((n =
            typeof f == "function"
              ? f
              : xt([
                  [+f[0][0], +f[0][1]],
                  [+f[1][0], +f[1][1]],
                ])),
          y)
        : n;
    }),
    (y.scaleExtent = function (f) {
      return arguments.length ? ((o[0] = +f[0]), (o[1] = +f[1]), y) : [o[0], o[1]];
    }),
    (y.translateExtent = function (f) {
      return arguments.length
        ? ((s[0][0] = +f[0][0]),
          (s[1][0] = +f[1][0]),
          (s[0][1] = +f[0][1]),
          (s[1][1] = +f[1][1]),
          y)
        : [
            [s[0][0], s[0][1]],
            [s[1][0], s[1][1]],
          ];
    }),
    (y.constrain = function (f) {
      return arguments.length ? ((e = f), y) : e;
    }),
    (y.duration = function (f) {
      return arguments.length ? ((a = +f), y) : a;
    }),
    (y.interpolate = function (f) {
      return arguments.length ? ((c = f), y) : c;
    }),
    (y.on = function () {
      var f = u.on.apply(u, arguments);
      return f === u ? y : f;
    }),
    (y.clickDistance = function (f) {
      return arguments.length ? ((b = (f = +f) * f), y) : Math.sqrt(b);
    }),
    (y.tapDistance = function (f) {
      return arguments.length ? ((k = +f), y) : k;
    }),
    y
  );
}
export { Gn as h, Q as s, Zo as t, Jo as z };
