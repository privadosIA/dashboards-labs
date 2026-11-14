import type { Animate, Catalog, Ease, Keyframe } from './model';
import { FEATURE_ANIMATE } from './model';

/** The shortest time between two keyframes of a parameter: the server wants each one strictly after the one before it. */
export const MIN_KEYFRAME_GAP = 0.01;

const round3 = (n: number): number => Math.floor(n * 1000 + 0.5) / 1000;

/** Whether the catalog says the server's scripts take keyframes. */
export const hasAnimateFeature = (catalog: Pick<Catalog, 'features'> | null | undefined): boolean => !!catalog?.features?.includes(FEATURE_ANIMATE);

/** The share of the way (0 to 1) a value has travelled after a share `p` of the time, for an ease. These are the server's formulas. */
export function easeShare(ease: Ease | undefined, p: number): number {
  switch (ease) {
    case 'in':
      return p * p * p;
    case 'out':
      return 1 - Math.pow(1 - p, 3);
    case 'in-out':
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    default:
      return p;
  }
}

/**
 * The value of an animated parameter at second `t` of its piece: the first keyframe's before it and the last one's after it; between two,
 * a number goes from the earlier value to the later with the **earlier** keyframe's ease, and anything else (text, true or false, an
 * option), and every value under `step`, holds the earlier value. An `int` parameter's number is rounded to the nearest whole. The page the
 * browser builds runs the same function (`animateValueSource`), and it is the server's.
 */
export function evaluateKeyframes(keyframes: readonly Keyframe[], t: number, int = false): string | number | boolean | undefined {
  const n = keyframes.length;
  if (n === 0) return undefined;
  const settle = (v: string | number | boolean): string | number | boolean => (int && typeof v === 'number' ? Math.round(v) : v);
  if (t <= keyframes[0].t) return settle(keyframes[0].value);
  if (t >= keyframes[n - 1].t) return settle(keyframes[n - 1].value);
  let i = 0;
  while (i < n - 1 && t >= keyframes[i + 1].t) i++;
  const a = keyframes[i];
  const b = keyframes[i + 1];
  const ease = a.ease ?? 'linear';
  if (typeof a.value !== 'number' || typeof b.value !== 'number' || ease === 'step') return settle(a.value);
  const p = (t - a.t) / (b.t - a.t);
  return settle(a.value + (b.value - a.value) * easeShare(ease, p));
}

/** Puts keyframes in the shape the server asks: in order, `t` to three decimals inside `[0, duration]`, none at the same second as the one before. */
export function normaliseKeyframes(keyframes: readonly Keyframe[], duration: number): Keyframe[] {
  const sorted = keyframes
    .map((k) => ({ ...k, t: round3(Math.min(Math.max(k.t, 0), duration)) }))
    .sort((a, b) => a.t - b.t);
  return sorted.filter((k, i) => i === 0 || k.t > sorted[i - 1].t);
}

/**
 * Splits the keyframes of a parameter at second `r` of its piece into those of the first half and those of the second (whose times start
 * again from 0), each with the value the parameter has at the cut on its edge, so the picture does not change: exactly for linear
 * and step segments, and for a curved one the part after the cut starts a new curve of the same kind from that value.
 */
export function splitKeyframes(keyframes: readonly Keyframe[], r: number, int = false): { before: Keyframe[]; after: Keyframe[] } {
  const at = round3(r);
  const value = evaluateKeyframes(keyframes, at, int);
  if (value === undefined) return { before: [], after: [] };
  // The ease of the segment the cut falls in, which the new keyframe at the cut carries on into the second half.
  let i = -1;
  keyframes.forEach((k, n) => {
    if (k.t <= at + 1e-9) i = n;
  });
  const carried = i >= 0 ? keyframes[i].ease : keyframes[0]?.ease;
  const before = keyframes.filter((k) => k.t < at - 1e-9);
  const after = keyframes.filter((k) => k.t > at + 1e-9).map((k) => ({ ...k, t: round3(k.t - at) }));
  const cutKeyframe = (ease?: Ease): Keyframe => ({ t: 0, value, ...(ease ? { ease } : {}) });
  return {
    before: [...before, { t: at, value }],
    after: [cutKeyframe(carried), ...after],
  };
}

/** The animation of one part with `param` given these keyframes (in order, inside `length`); an empty list takes the parameter away, and nothing is returned when no parameter animates. */
export function animateSet(animate: Animate | undefined, param: string, frames: readonly Keyframe[], length: number): Animate | undefined {
  const next: Record<string, readonly Keyframe[]> = { ...(animate ?? {}), [param]: normaliseKeyframes(frames, length) };
  const kept = Object.entries(next).filter(([, list]) => list.length > 0);
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** Adds a keyframe to a parameter, keeping the others; one at the same second takes its place. */
export function animateAdd(animate: Animate | undefined, param: string, frame: Keyframe, length: number): Animate | undefined {
  const at = round3(frame.t);
  const existing = (animate?.[param] ?? []).filter((x) => Math.abs(x.t - at) >= MIN_KEYFRAME_GAP / 2);
  return animateSet(animate, param, [...existing, frame], length);
}

/** Moves keyframe `n` of a parameter to second `t`, between its neighbours (at least `MIN_KEYFRAME_GAP` from each) and inside `length`; the same animation if it cannot. */
export function animateMove(animate: Animate | undefined, param: string, n: number, t: number, length: number): Animate | undefined {
  const list = animate?.[param];
  if (!list?.[n] || !Number.isFinite(t)) return animate;
  const low = n > 0 ? list[n - 1].t + MIN_KEYFRAME_GAP : 0;
  const high = n < list.length - 1 ? list[n + 1].t - MIN_KEYFRAME_GAP : length;
  if (high < low) return animate;
  const at = round3(Math.min(Math.max(t, low), high));
  if (at === list[n].t) return animate;
  return animateSet(animate, param, list.map((k, i) => (i === n ? { ...k, t: at } : k)), length);
}

/** Gives keyframe `n` another value and/or ease (only the fields given change). */
export function animateEdit(animate: Animate | undefined, param: string, n: number, change: Partial<Pick<Keyframe, 'value' | 'ease'>>, length: number): Animate | undefined {
  const list = animate?.[param];
  if (!list?.[n]) return animate;
  return animateSet(animate, param, list.map((k, i) => (i === n ? { ...k, ...change } : k)), length);
}

/** Takes keyframe `n` out of a parameter; with none left the parameter stops animating. */
export function animateRemove(animate: Animate | undefined, param: string, n: number, length: number): Animate | undefined {
  const list = animate?.[param];
  if (!list?.[n]) return animate;
  return animateSet(animate, param, list.filter((_, i) => i !== n), length);
}

/** Whether the document or one piece carries keyframes anywhere (main part or extras). */
export const animateOf = (piece: { readonly animate?: Animate; readonly with?: readonly { readonly animate?: Animate }[] }): Animate[] =>
  [piece.animate, ...(piece.with ?? []).map((w) => w.animate)].filter((a): a is Animate => !!a && Object.keys(a).length > 0);
