/**
 * The JavaScript a vector part carries, as text. It is the evaluator of `model/evaluate.ts` and an applier that sets the elements' attributes,
 * written once and used in three places: the part's fragment, the animated SVG and the canvas of the editor (which runs it on the live DOM,
 * so what the canvas shows is what the fragment draws). `runtime.spec.ts` runs it against `stateAt` at twenty times.
 *
 * It draws from `t` only: no timers, no clock, no randomness, nothing from outside the page.
 *
 *   VectorRuntime.create(model, root, params, host) → { seek(t, beat), setModel(model), states(t, beat) }
 *
 * `root` is the element that holds the drawing (the nodes are found in it by id). `params` are applied before the first seek: a text
 * parameter sets the element's text, a paint parameter sets the node's fill or stroke when the value is `#rgb` or `#rrggbb`, and a number
 * parameter sets a shape's width or height or a text's size (kept inside the parameter's `min` and `max`).
 *
 * A drawn node (rectangle, ellipse, line, text, image) is a `<g id>` around one element marked `data-vector-shape`: the runtime sets that
 * element's size, radius, text and style from the model at every seek.
 *
 * A node's `beat` links ride on what the tracks give: `seek(t, beat)` takes the page's beat (`{ number, position }`, number -1 before the first
 * beat) and does nothing with them when it is absent, so the same part works outside a piece. The loudness comes from `host.loudnessAt` (the
 * editor's canvas) or, in a piece, from `window.__motionSong` (`loudness[floor(t / loudness_hop)]`, the slice's offset already applied by the server).
 */
export const RUNTIME_SOURCE = `(function (global) {
  var HEX6 = /^#([0-9a-fA-F]{6})$/;
  var HEX3 = /^#([0-9a-fA-F]{3})$/;
  var VARS = { accent: 'var(--accent, #ffd166)', fg: 'var(--fg, #ffffff)', bg: 'var(--bg, #000000)', dark: '#0b0b0f', light: '#f5f5f7' };

  function easeShare(ease, p) {
    switch (ease) {
      case 'in': return p * p * p;
      case 'out': return 1 - Math.pow(1 - p, 3);
      case 'in-out': return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      default: return p;
    }
  }

  function mix(a, b, share) {
    var x = HEX6.exec(a)[1], y = HEX6.exec(b)[1], out = '#';
    for (var i = 0; i < 6; i += 2) {
      var from = parseInt(x.slice(i, i + 2), 16), to = parseInt(y.slice(i, i + 2), 16);
      var c = Math.round(from + (to - from) * share).toString(16);
      out += c.length < 2 ? '0' + c : c;
    }
    return out;
  }

  function valueAt(track, t) {
    var n = track ? track.length : 0;
    if (n === 0) return undefined;
    if (t <= track[0].t) return track[0].value;
    if (t >= track[n - 1].t) return track[n - 1].value;
    var i = 0;
    while (i < n - 1 && t >= track[i + 1].t) i++;
    var a = track[i], b = track[i + 1];
    if (a.ease === 'step') return a.value;
    var share = easeShare(a.ease, (t - a.t) / (b.t - a.t));
    if (typeof a.value === 'number' && typeof b.value === 'number') return a.value + (b.value - a.value) * share;
    if (typeof a.value === 'string' && typeof b.value === 'string' && HEX6.test(a.value) && HEX6.test(b.value)) return mix(a.value, b.value, share);
    return a.value;
  }

  function num(track, t, fallback) {
    var v = valueAt(track, t);
    return typeof v === 'number' ? v : fallback;
  }

  function paintAt(track, t, fallback) {
    var v = valueAt(track, t);
    if (typeof v === 'string') return v === 'none' ? { kind: 'none' } : { kind: 'color', value: v };
    return fallback || { kind: 'keep' };
  }

  function songLoudness(t) {
    var song = global.__motionSong;
    if (!song || !song.loudness || !song.loudness.length) return undefined;
    var hop = song.loudness_hop > 0 ? song.loudness_hop : 1;
    var i = Math.min(song.loudness.length - 1, Math.max(0, Math.floor(t / hop)));
    return song.loudness[i];
  }

  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  /** What a link does to a number: see linkedNumber in model/evaluate.ts, which the specs hold this equal to. */
  function linkedNumber(value, link, t, beat, loud) {
    if (!link) return value;
    if (link.kind === 'loudness') {
      var l = loud ? loud(t) : undefined;
      return typeof l === 'number' && isFinite(l) ? value + link.amount * clamp01(l) : value;
    }
    if (!beat || !(beat.number >= 0)) return value;
    if (link.kind === 'alternate') {
      var v = link.values[beat.number % 2];
      return typeof v === 'number' ? v : value;
    }
    var decay = Math.min(8, Math.max(1, link.decay || 3));
    return value + link.amount * Math.pow(1 - clamp01(beat.position), decay);
  }

  function linkedPaint(paint, link, beat) {
    if (!link || link.kind !== 'alternate' || !beat || !(beat.number >= 0)) return paint;
    var v = link.values[beat.number % 2];
    return typeof v === 'string' ? (v === 'none' ? { kind: 'none' } : { kind: 'color', value: v }) : paint;
  }

  function nodeState(node, t, beat, loud) {
    var state = plainState(node, t);
    var links = node.beat;
    if (!links) return state;
    var at = function (name, value) { return linkedNumber(value, links[name], t, beat, loud); };
    var tr = state.transform;
    state.transform = { x: at('x', tr.x), y: at('y', tr.y), scaleX: at('scaleX', tr.scaleX), scaleY: at('scaleY', tr.scaleY), rotate: at('rotate', tr.rotate), anchorX: tr.anchorX, anchorY: tr.anchorY };
    state.opacity = clamp01(at('opacity', state.opacity));
    state.fill = linkedPaint(state.fill, links.fill, beat);
    state.stroke = linkedPaint(state.stroke, links.stroke, beat);
    if (state.strokeWidth !== undefined || links.strokeWidth) state.strokeWidth = at('strokeWidth', state.strokeWidth === undefined ? 0 : state.strokeWidth);
    for (var key in state.shape) state.shape[key] = at(key, state.shape[key]);
    return state;
  }

  function plainState(node, t) {
    var tr = node.transform, k = node.tracks;
    var sw = valueAt(k.strokeWidth, t);
    return {
      transform: {
        x: num(k.x, t, tr.x), y: num(k.y, t, tr.y), scaleX: num(k.scaleX, t, tr.scaleX), scaleY: num(k.scaleY, t, tr.scaleY),
        rotate: num(k.rotate, t, tr.rotate), anchorX: tr.anchorX, anchorY: tr.anchorY
      },
      opacity: Math.min(1, Math.max(0, num(k.opacity, t, node.opacity))),
      visible: node.visible,
      fill: paintAt(k.fill, t, node.fill),
      stroke: paintAt(k.stroke, t, node.stroke),
      strokeWidth: sw === undefined ? node.strokeWidth : typeof sw === 'number' ? sw : 0,
      shape: shapeAt(node, t)
    };
  }

  var SHAPE_KEYS = ['width', 'height', 'rx', 'fontSize'];

  function shapeAt(node, t) {
    var out = {};
    for (var i = 0; i < SHAPE_KEYS.length; i++) {
      var key = SHAPE_KEYS[i];
      if (typeof node[key] === 'number') out[key] = num(node.tracks[key], t, node[key]);
    }
    return out;
  }

  function stateAt(nodes, t, out, opacity, shown, beat, loud) {
    out = out || {};
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], own = nodeState(node, t, beat, loud);
      own.effectiveOpacity = (opacity === undefined ? 1 : opacity) * own.opacity;
      own.shown = (shown === undefined ? true : shown) && own.visible;
      out[node.id] = own;
      stateAt(node.children || [], t, out, own.effectiveOpacity, own.shown, beat, loud);
    }
    return out;
  }

  function round(n) { return Math.round(n * 1e6) / 1e6; }

  /** The node's own transform on top of the element's original one. */
  function transformAttr(original, tr) {
    if (tr.x === 0 && tr.y === 0 && tr.scaleX === 1 && tr.scaleY === 1 && tr.rotate === 0) return original;
    var own = 'translate(' + round(tr.x) + ' ' + round(tr.y) + ') translate(' + round(tr.anchorX) + ' ' + round(tr.anchorY) + ') rotate(' + round(tr.rotate) +
      ') scale(' + round(tr.scaleX) + ' ' + round(tr.scaleY) + ') translate(' + round(-tr.anchorX) + ' ' + round(-tr.anchorY) + ')';
    return original ? original + ' ' + own : own;
  }

  function cssPaint(paint) {
    return paint.kind === 'none' ? 'none' : paint.kind === 'color' ? paint.value : paint.kind === 'var' ? VARS[paint.name] : null;
  }

  function setAttr(el, name, value) {
    if (value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  function find(root, id) {
    var all = root.querySelectorAll('[id]');
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute('id') === id) return all[i];
    return null;
  }

  function walk(nodes, fn) {
    for (var i = 0; i < nodes.length; i++) { fn(nodes[i]); walk(nodes[i].children || [], fn); }
  }

  /** The element a drawn node is, inside its \`<g>\`. */
  function shapeOf(el) {
    return el.querySelector ? el.querySelector('[data-vector-shape]') : null;
  }

  var PRESERVE = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', stretch: 'none' };

  /** What a drawn node's element looks like from the model and its state at this time. */
  function shapeAttrs(node, shape, state) {
    var set = function (name, value) { if (value === undefined || value === null) shape.removeAttribute(name); else shape.setAttribute(name, String(round(value))); };
    switch (node.kind) {
      case 'rect':
        set('width', state.shape.width); set('height', state.shape.height); set('rx', state.shape.rx);
        break;
      case 'ellipse':
        set('rx', state.shape.width / 2); set('ry', state.shape.height / 2);
        break;
      case 'line':
        set('x2', node.x2); set('y2', node.y2);
        break;
      case 'text':
        set('font-size', state.shape.fontSize);
        shape.setAttribute('font-weight', String(node.fontWeight));
        shape.setAttribute('text-anchor', node.align);
        if (shape.textContent !== node.content) shape.textContent = node.content;
        break;
      case 'image':
        set('width', state.shape.width); set('height', state.shape.height);
        shape.setAttribute('preserveAspectRatio', PRESERVE[node.preserve] || PRESERVE.contain);
        break;
    }
  }

  function applyParams(model, root, params, byId) {
    var list = model.params || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i], value = params && params[p.name] !== undefined ? params[p.name] : p.default;
      var node = null;
      walk(model.nodes, function (n) { if (n.id === p.target.nodeId) node = n; });
      if (!node) continue;
      if (p.target.what === 'text') {
        var el = byId[node.id];
        if (el) (shapeOf(el) || el).textContent = String(value);
        if (node.kind === 'text') node.content = String(value);
      } else if (p.target.what === 'width' || p.target.what === 'height' || p.target.what === 'fontSize') {
        var n = Number(value);
        if (!isFinite(n)) continue;
        if (typeof p.min === 'number') n = Math.max(p.min, n);
        if (typeof p.max === 'number') n = Math.min(p.max, n);
        node[p.target.what] = n;
      } else if (HEX6.test(String(value)) || HEX3.test(String(value))) {
        node[p.target.what] = { kind: 'color', value: String(value) };
      }
    }
  }

  function create(first, root, params, host) {
    var byId = {}, original = {}, model = first, drawn = {};
    // The element's own attributes are kept in data-vo the first time it is touched, so that a drawing that was already moved (the part's
    // SVG is drawn at 0 s) or a second runtime over the same elements still knows what the SVG itself said.
    var KEYS = { transform: 't', opacity: 'o', display: 'd', fill: 'f', stroke: 's', 'stroke-width': 'w' };
    walk(first.nodes, function (n) {
      var el = find(root, n.id);
      if (!el) return;
      byId[n.id] = el;
      var saved = el.getAttribute('data-vo'), kept = {};
      if (saved === null) {
        for (var name in KEYS) { var v = el.getAttribute(name); if (v !== null) kept[KEYS[name]] = v; }
        el.setAttribute('data-vo', JSON.stringify(kept));
      } else kept = JSON.parse(saved);
      var read = function (name) { return kept[KEYS[name]] === undefined ? null : kept[KEYS[name]]; };
      original[n.id] = { transform: read('transform'), opacity: read('opacity'), display: read('display'), fill: read('fill'), stroke: read('stroke'), strokeWidth: read('stroke-width') };
    });

    /** Takes a model (a copy: the parameters are applied to it, not to the caller's) and the text parameters into the drawing. */
    function adopt(next) {
      model = JSON.parse(JSON.stringify(next));
      applyParams(model, root, params, byId);
      drawn = {};
      walk(model.nodes, function (n) { if (n.kind !== 'group' && n.kind !== 'import') drawn[n.id] = n; });
    }
    adopt(first);

    function paint(el, name, state, was) {
      if (state.kind === 'var') {
        el.style.setProperty(name, cssPaint(state));
        el.removeAttribute(name);
      } else {
        el.style.removeProperty(name);
        setAttr(el, name, state.kind === 'keep' ? was : cssPaint(state));
      }
    }

    function loudnessOf(t) { return host && host.loudnessAt ? host.loudnessAt(t) : songLoudness(t); }

    function seek(t, beat) {
      var states = stateAt(model.nodes, t, undefined, undefined, undefined, beat, loudnessOf);

      for (var id in byId) {
        var el = byId[id], s = states[id], was = original[id];
        setAttr(el, 'transform', transformAttr(was.transform, s.transform));
        if (s.opacity === 1) setAttr(el, 'opacity', was.opacity);
        else setAttr(el, 'opacity', String(round(s.opacity * (was.opacity === null ? 1 : parseFloat(was.opacity)))));
        setAttr(el, 'display', s.visible ? was.display : 'none');
        paint(el, 'fill', s.fill, was.fill);
        paint(el, 'stroke', s.stroke, was.stroke);
        setAttr(el, 'stroke-width', s.strokeWidth === undefined ? was.strokeWidth : String(round(s.strokeWidth)));
        if (drawn[id]) {
          var shape = shapeOf(el);
          if (shape) shapeAttrs(drawn[id], shape, s);
        }
      }
    }
    return { seek: seek, setModel: adopt, states: function (t, beat) { return stateAt(model.nodes, t, undefined, undefined, undefined, beat, loudnessOf); } };
  }

  global.VectorRuntime = { create: create, valueAt: valueAt, stateAt: function (model, t, beat, loud) { return stateAt(model.nodes, t, undefined, undefined, undefined, beat, loud); }, transformAttr: transformAttr, cssPaint: cssPaint };
})(typeof window !== 'undefined' ? window : this);
`;

/** The names a runtime must never use: the page it runs in is drawn frame by frame from `t`. */
export const FORBIDDEN_IN_RUNTIME = ['setTimeout', 'setInterval', 'requestAnimationFrame', 'Date.now', 'performance.now', 'Math.random', 'fetch', 'XMLHttpRequest'];

/** Loads the runtime in the page the editor runs in (once) and returns it; the canvas uses it on the live DOM. */
export interface VectorRuntimeApi {
  create(
    model: unknown,
    root: Element,
    params?: Record<string, unknown>,
    host?: { loudnessAt?: (t: number) => number },
  ): { seek(t: number, beat?: { number: number; position: number } | null): void; setModel(model: unknown): void; states(t: number, beat?: { number: number; position: number } | null): Record<string, unknown> };
  valueAt(track: unknown, t: number): number | string | undefined;
  stateAt(model: unknown, t: number, beat?: { number: number; position: number } | null, loudnessAt?: (t: number) => number): Record<string, unknown>;
  transformAttr(original: string | null, transform: unknown): string | null;
  cssPaint(paint: unknown): string | null;
}

export function loadRuntime(): VectorRuntimeApi {
  const holder = globalThis as unknown as { VectorRuntime?: VectorRuntimeApi };
  if (!holder.VectorRuntime) new Function(RUNTIME_SOURCE)();
  return holder.VectorRuntime!;
}
