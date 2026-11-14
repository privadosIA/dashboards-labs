import type { Animate } from '@lab/animation-core';

/**
 * What a page needs to move the parameters of its parts with keyframes: the server's own scripts, word for word, so a part behaves the
 * same in the page the browser builds and in the one the server draws. The page carries `window.__animate` (the tracks of each part in the
 * order of the page, `null` for a part that does not move), each moving part hands over `window.__partParams[i]` (the very object it reads
 * inside its `__partSeek`), and `window.__setAnimated(t)` at the start of the page's seek writes the evaluated values into them. A part drawn as an
 * item of a layer reads its keyframes at its own time: `window.__animateOff` holds, by place, the song second its time starts from.
 */
export const ANIMATE_VALUE = `
  window.__animateValue = function(kfs, t){
    var n = kfs.length;
    if (t <= kfs[0].t) return kfs[0].value;
    if (t >= kfs[n - 1].t) return kfs[n - 1].value;
    var i = 0; while (i < n - 1 && t >= kfs[i + 1].t) i++;
    var a = kfs[i], b = kfs[i + 1], e = a.ease || 'linear';
    if (typeof a.value !== 'number' || typeof b.value !== 'number' || e === 'step') return a.value;
    var p = (t - a.t) / (b.t - a.t);
    if (e === 'in') p = p * p * p; else if (e === 'out') p = 1 - Math.pow(1 - p, 3);
    else if (e === 'in-out') p = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    return a.value + (b.value - a.value) * p;
  };`;

export const ANIMATE_SEEK = `
    var AN = window.__animate, PP = window.__partParams || [], AO = window.__animateOff || {};
    if (AN) for (var ai = 0; ai < AN.length; ai++) { if (AN[ai] && PP[ai]) { var at = AO[ai] === undefined ? t : ((window.__scene && window.__scene.song_start) || 0) + t - AO[ai]; for (var pn in AN[ai]) { var v = window.__animateValue(AN[ai][pn].k, at); PP[ai][pn] = (AN[ai][pn].int && typeof v === 'number') ? Math.round(v) : v; } } }`;

/** The script that defines the evaluator and `__setAnimated`; the page's seek calls the second. */
export const ANIMATION_SCRIPT = `(function(){${ANIMATE_VALUE}
  window.__setAnimated = function(t){${ANIMATE_SEEK}
  };
})();`;

/** A moving part of a page: its keyframes and which of its parameters are whole numbers (their evaluated value is rounded). */
export interface MovingPart {
  readonly animate: Animate | undefined;
  readonly ints: ReadonlySet<string>;
  /** For an item of a layer: the song second its own time starts from. */
  readonly off?: number;
}

/** The data of `window.__animate`, in the form the server writes it (keys of a keyframe in its order, parameter names in order), or `''` when no part moves. */
export function animateData(parts: readonly MovingPart[], safe: (v: unknown) => string): string {
  if (!parts.some((p) => p.animate && Object.keys(p.animate).length > 0)) return '';
  const list = parts.map((p) => {
    if (!p.animate || Object.keys(p.animate).length === 0) return null;
    const tracks: Record<string, unknown> = {};
    for (const name of Object.keys(p.animate).sort()) {
      const k = p.animate[name].map((kf) => ({ t: kf.t, value: kf.value, ...(kf.ease ? { ease: kf.ease } : {}) }));
      tracks[name] = { k, ...(p.ints.has(name) ? { int: true } : {}) };
    }
    return tracks;
  });
  const offs: [string, number][] = [];
  parts.forEach((p, i) => {
    if (p.off !== undefined && p.animate && Object.keys(p.animate).length > 0) offs.push([String(i), p.off]);
  });
  // Written as Go writes a map: the keys in order as text ("10" before "3"), which a JavaScript object would not keep.
  const body = offs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `"${k}":${JSON.stringify(v)}`).join(',');
  const off = offs.length > 0 ? `<script>window.__animateOff={${body}};</script>` : '';
  return `<script>window.__animate=${safe(list)};</script>${off}`;
}
