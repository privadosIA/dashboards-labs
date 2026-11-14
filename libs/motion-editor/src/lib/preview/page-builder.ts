import { ANIMATION_SCRIPT, animateData } from './animate-script';
import { LAYER_SEEK, SEEK_LOOP, layerRegistration, layerWrapper } from './layer-script';
import { fontCss } from './fonts';
import { placeholderFragment } from './placeholder-fragment';
import type { SceneActor, SceneInput, ScenePart } from './scene-model';

/** Why a page could not be built, in the words of the server's own refusal. */
export class PageBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageBuildError';
  }
}

const SLOT = /\{\{\s*(json:)?([a-z][a-z0-9_]*)\s*\}\}/g;

const htmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');

/** Keeps JSON from closing the script it sits in (the server's `json.Marshal` plus `scriptSafe`). */
const jsonSafe = (v: unknown): string => JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** The same JSON with the keys of every object in order, as Go writes a map. */
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sorted(x)]));
  return v;
}

/** Replaces `{{name}}` with the parameter as text safe in HTML and `{{json:name}}` with it as a JSON value safe inside a script. */
export function fillSlots(fragment: string, params: Readonly<Record<string, unknown>>, part: string): string {
  return fragment.replace(SLOT, (_m, json: string | undefined, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) throw new PageBuildError(`part ${part}: the fragment uses {{${name}}}, which is not a parameter of the part`);
    return json ? jsonSafe(params[name]) : htmlEscape(String(params[name]));
  });
}

/** The `{{asset:name}}` slots of a fragment: the theme's drawing of that name, or nothing when it has none (the server's draft warns of it). */
export function fillAssets(fragment: string, assets: Readonly<Record<string, string>> | undefined): string {
  return fragment.replace(/\{\{\s*asset:([a-z][a-z0-9_]*)\s*\}\}/g, (_m, name: string) => (assets && Object.prototype.hasOwnProperty.call(assets, name) ? assets[name] : ''));
}

/** The fragment of a part as it goes in the page: its own parameters first, then the fragment, then the hand-over of its seek function. */
function partBlock(p: ScenePart, index: number, assets: Readonly<Record<string, string>> | undefined, slot?: { readonly n: number; readonly from: number; readonly to: number }): string {
  const fragment = p.fragment === null ? placeholderFragment(p) : p.fragment;
  const filled = fillSlots(fillAssets(fragment, assets), p.params, p.name);
  // A part that animates hands its own parameters object to the page, by its place, so the page can move them.
  const hand = moves(p) ? `window.__partParams=window.__partParams||{};window.__partParams[${index}]=window.__params;` : '';
  if (slot) return `<script>window.__params=${jsonSafe(sorted(p.params))};</script>${filled}${layerRegistration(hand, slot.n, slot.from, slot.to)}`;
  return (
    `<script>window.__params=${jsonSafe(sorted(p.params))};</script>${filled}` +
    `<script>(function(){${hand}window.__partSeeks=window.__partSeeks||[];if(typeof window.__partSeek==='function'){window.__partSeeks.push(window.__partSeek);}window.__partSeek=null;})();</script>`
  );
}

/** Whether a part of a scene has keyframes. */
const moves = (p: ScenePart): boolean => !!p.animate && Object.keys(p.animate).length > 0;

const pageCss = (w: number, h: number, size: number): string => `
html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--body)}
#stage{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}
#backdrop{position:absolute;left:0;top:0;width:100%;height:100%}
#backdrop svg{width:100%;height:100%;display:block}
#actors{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;z-index:3}
#actors .actor{position:absolute;transform-origin:50% 100%}
#actors .actor svg{display:block;width:100%;height:100%;overflow:visible}
#verse{position:absolute;left:7%;right:7%;bottom:6%;text-align:center;font-family:var(--body);font-weight:700;font-size:${size}px;line-height:1.2;z-index:5}
#verse .w{display:inline-block;margin:0 .14em;opacity:0}
#verse .k{color:var(--accent)}
#verse.verse-highlight .w.sung{background:var(--accent);color:var(--bg);border-radius:.18em;padding:0 .18em}
#verse.verse-karaoke .w.sung{color:var(--accent)}
#verse.verse-glow .w{color:var(--fg);text-shadow:0 0 .1em var(--fg),0 0 .45em color-mix(in srgb,var(--fg) 75%,transparent)}
#verse.verse-glow .w.k{color:var(--accent);text-shadow:0 0 .1em var(--accent),0 0 .45em color-mix(in srgb,var(--accent) 75%,transparent)}
#hitbg{position:absolute;left:0;top:0;width:100%;height:100%;background:var(--bg);opacity:0;visibility:hidden;z-index:8}
#hit.hit-metal .ch,#hit.hit-glow .ch{display:inline-block;opacity:0}
#hit.hit-metal .ch{background-image:linear-gradient(180deg,#f4f6fa 0%,#9aa1ad 48%,#e3e7ee 52%,#7b818c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
#hit.hit-glow .ch{color:var(--accent);text-shadow:0 0 .12em var(--accent),0 0 .35em color-mix(in srgb,var(--accent) 65%,transparent)}
#hit{position:absolute;left:3%;right:3%;top:0;bottom:0;display:flex;align-items:center;justify-content:center;white-space:nowrap;text-align:center;font-family:var(--display);font-weight:900;text-transform:uppercase;letter-spacing:-.01em;color:var(--fg);z-index:9;visibility:hidden}
`;

/** Runs the two layers: the verse that is being sung and the word hit. `window.__scene` holds the lines and the hit. */
const LAYER_SCRIPT = `(function(){
  var S = window.__scene, verse = document.getElementById('verse') || document.createElement('div'), hit = document.getElementById('hit') || document.createElement('div'), hitbg = document.getElementById('hitbg') || document.createElement('div');
  var lineEls = [];
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  S.lines.forEach(function(l){
    var box = el('div', 'line'); box.style.display = 'none';
    if (l.words && l.words.length) {
      l.words.forEach(function(w, i){ var s = el('span', 'w' + (i === l.keyword ? ' k' : ''), w.t); box.appendChild(s); });
    } else { var s = el('span', 'w' + (l.keyword === 0 ? ' k' : ''), l.text); s.style.opacity = '0'; box.appendChild(s); }
    verse.appendChild(box); lineEls.push(box);
  });
  var letters = null;
  if (S.hit && (S.hit_style === 'metal' || S.hit_style === 'glow')) {
    hit.className = 'hit-' + S.hit_style; hit.textContent = ''; letters = [];
    Array.from(S.hit.word).forEach(function(c){ var sp = el('span', 'ch', c); hit.appendChild(sp); letters.push(sp); });
  }
  if (S.hit) { if (!letters) hit.textContent = S.hit.word; var size = window.innerHeight * 0.6; hit.style.fontSize = size + 'px';
    var avail = window.innerWidth * 0.94; var w = hit.scrollWidth; if (w > avail) hit.style.fontSize = Math.floor(size * avail / w) + 'px'; }
  function ease(p){ p = Math.min(1, Math.max(0, p)); return 1 - Math.pow(1 - p, 3); }
  function layers(t){
    var cur = -1;
    for (var i = 0; i < S.lines.length; i++) { if (t >= S.lines[i].start - 1e-9) cur = i; }
    lineEls.forEach(function(box, i){
      var show = i === cur; box.style.display = show ? 'block' : 'none';
      if (!show) return;
      var l = S.lines[i], spans = box.children;
      if (l.words && l.words.length) {
        for (var k = 0; k < spans.length; k++) {
          var p = ease((t - l.words[k].s) / 0.12); spans[k].style.opacity = String(p); spans[k].style.transform = 'translateY(' + ((1 - p) * 14) + 'px)';
          var sung = t >= l.words[k].s - 1e-9, now = sung && (k === spans.length - 1 || t < l.words[k + 1].s);
          spans[k].classList.toggle('sung', sung); spans[k].classList.toggle('now', now);
        }
      } else { var q = ease((t - l.start) / 0.2); spans[0].style.opacity = String(q); spans[0].classList.toggle('sung', t >= l.start - 1e-9); spans[0].classList.toggle('now', t >= l.start - 1e-9); }
    });
    if (S.hit) {
      var on = t >= S.hit.at - 1e-9 && t < S.hit.at + S.hit.length;
      hit.style.visibility = on ? 'visible' : 'hidden'; hitbg.style.visibility = on ? 'visible' : 'hidden';
      if (on) {
        var a = ease((t - S.hit.at) / 0.15), out = Math.min(1, Math.max(0, (S.hit.at + S.hit.length - t) / 0.1));
        hit.style.opacity = String(Math.min(a, out)); hit.style.transform = 'scale(' + (0.85 + 0.15 * a) + ')'; hitbg.style.opacity = String(0.6 * Math.min(a, out));
        if (letters) {
          var n = letters.length, step = Math.min(0.4, S.hit.length * 0.4) / n, prog = (t - S.hit.at) / S.hit.length;
          letters.forEach(function(ch, i){
            var p = ease((t - S.hit.at - i * step) / 0.12);
            ch.style.opacity = String(p); ch.style.transform = 'translateY(' + ((1 - p) * 0.25) + 'em) scale(' + (0.8 + 0.2 * p) + ')';
            if (S.hit_style === 'metal') { var shine = Math.max(0, 1 - Math.abs(prog * (n + 2) - (i + 1))); ch.style.filter = 'brightness(' + (1 + 0.7 * shine) + ')'; }
          });
        }
      }
    }
  }
  window.__seek = function(t){
    if (typeof window.__stageSeek === 'function') window.__stageSeek(t, window.__beat || {number: 0, position: 0, bpm: 0});
    var beat = window.__beat || {number: 0, position: 0, section: '', sectionIndex: -1, bpm: 0, time: t}, seeks = window.__partSeeks || [];
    for (var i = 0; i < seeks.length; i++) seeks[i](t, beat);
    layers(t);
  };
  window.__seek(0);
})();`;

/** Places the actors and moves them from the beat clock. `window.__scene.actors` holds where each goes. */
const STAGE_SCRIPT = `(function(){
  var S = window.__scene, W = window.innerWidth, H = window.innerHeight, els = [];
  (S.actors || []).forEach(function(a){
    var el = document.getElementById('actor-' + a.id), h = a.size / 100 * H, w = h * a.aspect;
    el.style.height = h + 'px'; el.style.width = w + 'px';
    el.style.left = (a.x / 100 * W) + 'px'; el.style.top = (a.y / 100 * H) + 'px';
    els.push({el: el, a: a, w: w, h: h});
  });
  function ease(p){ p = Math.min(1, Math.max(0, p)); return 1 - Math.pow(1 - p, 3); }
  window.__stageSeek = function(t, b){
    var n = b.number < 0 ? 0 : b.number, pos = b.number < 0 ? 0 : b.position, period = b.bpm > 0 ? 60 / b.bpm : 0.5, D = S.duration;
    els.forEach(function(o){
      var a = o.a, dx = 0, dy = 0, rot = 0, sx = 1, sy = 1;
      var side = a.x < 50 ? -1 : 1, away = side < 0 ? (a.x / 100 * W + o.w) : ((100 - a.x) / 100 * W + o.w);
      if (a.action === 'enter') { dx = side * away * (1 - ease(t / Math.max(0.3, period))); }
      else if (a.action === 'exit') { var d = Math.max(0.5, period), p = (t - (D - d)) / d; dx = side * away * (p <= 0 ? 0 : ease(p) ); }
      else if (a.action === 'bounce') { dy = -o.h * 0.07 * Math.sin(Math.PI * pos); sy = 1 + 0.04 * Math.sin(Math.PI * pos); sx = 1 - 0.02 * Math.sin(Math.PI * pos); }
      else if (a.action === 'look') { rot = 6 * Math.sin(Math.PI * (n + pos)); }
      else if (a.action === 'wave') { rot = 7 * Math.sin(4 * Math.PI * (n + pos)); }
      else if (a.action === 'slide') { dx = 0.10 * W * Math.sin(Math.PI * (n + pos) / 2); }
      o.el.style.transform = 'translate(' + (-a.anchor_x * 100) + '%, ' + (-a.anchor_y * 100) + '%) translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg) scale(' + sx + ',' + sy + ')';
      o.el.style.transformOrigin = (a.anchor_x * 100) + '% ' + (a.anchor_y * 100) + '%';
    });
  };
})();`;

const actorJson = (a: SceneActor) => ({ id: a.id, scope: a.scope, action: a.action, x: a.x, y: a.y, size: a.size, aspect: a.aspect, anchor_x: a.anchor_x, anchor_y: a.anchor_y, expression: a.expression, svg: a.svg });

/** The theme's stylesheet, after the page's own so that it can restyle `#verse` and `#hit`. */
const themeStyle = (s: SceneInput): string => (s.theme?.css ? `<style data-theme>${s.theme.css.replace(/<\/style/gi, '')}</style>` : '');

/** The page of a scene: a complete document with nothing loaded from outside. The twin of the server's `BuildPage`. */
export function buildScenePage(s: SceneInput): string {
  if (s.duration <= 0) throw new PageBuildError('the scene has no duration');
  if (s.width <= 0 || s.height <= 0) throw new PageBuildError('the scene needs a width and a height');
  if (s.extras.length > 3) throw new PageBuildError(`a piece may carry up to 3 extra parts, it has ${s.extras.length}`);
  const seen = new Set([s.part.name]);
  for (const e of s.extras) {
    if (seen.has(e.name)) throw new PageBuildError(`the part "${e.name}" is in the piece twice: two fragments of one part would share their element ids`);
    seen.add(e.name);
  }

  const assets = s.theme?.assets;
  let stage = partBlock(s.part, 0, assets);
  s.extras.forEach((e, i) => (stage += partBlock(e, i + 1, assets)));
  // The items of the layers go after the extras, each in a wrapper the page's seek shows between its bounds.
  s.layers.forEach((l, i) => (stage += layerWrapper(i, partBlock(l.part, 1 + s.extras.length + i, assets, { n: i, from: l.from, to: l.to }))));

  const dark = s.mode === 'dark';
  const bg = dark ? s.design.dark : s.design.light;
  const fg = dark ? s.design.light : s.design.dark;
  const scene = {
    actors: s.actors.map(actorJson),
    duration: s.duration,
    hit: s.hit,
    hit_style: s.design.hitStyle ?? '',
    lines: s.lines.map((l) => ({ text: l.text, start: l.start, end: l.end, words: l.words, keyword: l.keyword })),
    mode: s.mode,
    song_length: s.songLength,
    song_start: s.songStart,
  };
  const paramsJson = jsonSafe(sorted(s.part.params));
  const vars = `:root{--bg:${bg};--fg:${fg};--accent:${s.design.accent};--dark:${s.design.dark};--light:${s.design.light};--display:${fontCss(s.design.display, s.fontStacks)};--body:${fontCss(s.design.body, s.fontStacks)}}`;
  const size = Math.trunc((s.height * 62) / 1000);

  let out = '<!doctype html><html><head><meta charset="utf-8"><style>' + vars + pageCss(s.width, s.height, size) + `</style>${themeStyle(s)}</head><body class="mode-${s.mode}">`;
  out += `<script>window.__scene=${jsonSafe(scene)};window.__params=${paramsJson};window.__theme=${jsonSafe(sorted({ css: s.theme?.css ?? '', assets: s.theme?.assets ?? {}, hud: s.theme?.hud ?? {} }))};</script>`;
  if (s.backdrop !== '') out += `<div id="backdrop">${s.backdrop}</div>`;
  else if (s.backdropLabel !== '') out += `<div id="backdrop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" preserveAspectRatio="none"><rect width="160" height="90" fill="currentColor" opacity=".08"/><text x="80" y="48" text-anchor="middle" font-size="5" fill="currentColor" opacity=".4" font-family="sans-serif">${htmlEscape(s.backdropLabel)}</text></svg></div>`;
  out += `<div id="stage">${stage}<script>window.__params=${paramsJson};</script></div>`;
  if (s.actors.length > 0) {
    out += '<style>';
    for (const a of s.actors) out += `#actor-${a.id} .expr{display:none !important}#actor-${a.id} .expr-${a.expression}{display:inline !important}`;
    out += '</style><div id="actors">';
    for (const a of s.actors) out += `<div class="actor ${a.scope}" id="actor-${a.id}">${a.svg}</div>`;
    out += '</div>';
  }
  const v = s.design.verseStyle;
  const verseClass = v === 'highlight' || v === 'karaoke' || v === 'glow' ? ` class="verse-${v}"` : '';
  // A main part that draws the lyric or the hit itself (`own`) takes the page's layer out; the layers' script then works on detached elements.
  if (!s.verseOwn) out += `<div id="verse"${verseClass}></div>`;
  if (!s.hitOwn) out += '<div id="hitbg"></div><div id="hit"></div>';
  out += `<script>${STAGE_SCRIPT}</script>`;
  let layers = LAYER_SCRIPT;
  if (s.layers.length > 0) layers = layers.replace(SEEK_LOOP, SEEK_LOOP + LAYER_SEEK);
  const moving = [...[s.part, ...s.extras].map((p) => ({ part: p, off: undefined as number | undefined })), ...s.layers.map((l) => ({ part: l.part, off: l.from as number | undefined }))];
  const animation = animateData(moving.map(({ part, off }) => ({ animate: part.animate, ints: new Set(part.defs.filter((d) => d.type === 'int').map((d) => d.name)), ...(off !== undefined ? { off } : {}) })), jsonSafe);
  if (animation !== '') {
    // Only a page that animates carries the evaluator and the call in its seek; any other page is what it always was.
    out += `${animation}<script>${ANIMATION_SCRIPT}</script>`;
    layers = layers.replace('window.__seek = function(t){\n', 'window.__seek = function(t){\n    window.__setAnimated(t);\n');
  }
  out += `<script>${layers}</script></body></html>`;
  return out;
}
