import type { Box } from '../import/measure';
import type { Transform } from '../model/document';
import type { Pt } from './view';

/** The two ways between the screen and a node's parent: where a point of the screen is in the parent's coordinates, and back. */
export interface Frame {
  toLocal(p: Pt): Pt;
  toScreen(p: Pt): Pt;
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const DEG = Math.PI / 180;

const rad = (t: Transform): number => t.rotate * DEG;

/** `R · S` applied to a vector: the node's own scale, then its rotation. */
function rs(t: Transform, sx: number, sy: number, v: Pt): Pt {
  const a = rad(t);
  const x = v.x * sx;
  const y = v.y * sy;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

/** The inverse of `R · S` applied to a vector; nothing when a scale is zero. */
function rsInverse(t: Transform, v: Pt): Pt | undefined {
  if (t.scaleX === 0 || t.scaleY === 0) return undefined;
  const a = -rad(t);
  const x = v.x * Math.cos(a) - v.y * Math.sin(a);
  const y = v.x * Math.sin(a) + v.y * Math.cos(a);
  return { x: x / t.scaleX, y: y / t.scaleY };
}

/** Where a node's anchor is in its parent's coordinates: the anchor is the one point that does not move when the node turns or scales. */
export const anchorInParent = (t: Transform): Pt => ({ x: t.x + t.anchorX, y: t.y + t.anchorY });

/** Moving by a pointer: the node's `x` and `y` go by the distance the pointer went, in the parent's coordinates. */
export function moveGesture(start: Transform, frame: Frame, from: Pt, to: Pt): Pick<Transform, 'x' | 'y'> {
  const a = frame.toLocal(from);
  const b = frame.toLocal(to);
  return { x: start.x + (b.x - a.x), y: start.y + (b.y - a.y) };
}

/** Scales a node by new factors keeping one point (in the parent's coordinates) where it is. */
export function scaleAbout(start: Transform, pivot: Pt, scaleX: number, scaleY: number): Pick<Transform, 'x' | 'y' | 'scaleX' | 'scaleY'> {
  const anchor = anchorInParent(start);
  const local = rsInverse(start, { x: pivot.x - anchor.x, y: pivot.y - anchor.y });
  if (!local) return { x: start.x, y: start.y, scaleX, scaleY };
  const moved = rs(start, scaleX, scaleY, local);
  return { x: pivot.x - start.anchorX - moved.x, y: pivot.y - start.anchorY - moved.y, scaleX, scaleY };
}

export interface ScaleOptions {
  /** Shift: the same factor on both axes. */
  uniform: boolean;
  /** Alt: scale about the anchor and not about the opposite side. */
  aroundAnchor: boolean;
}

/** The point of the box a handle is on, and the one opposite it, in the same coordinates as the box. */
export function handleAt(box: Box, handle: Handle): { at: Pt; opposite: Pt; hx: number; hy: number } {
  const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const x = (k: number): number => box.x + (k + 1) * (box.width / 2);
  return {
    at: { x: x(hx), y: box.y + (hy + 1) * (box.height / 2) },
    opposite: { x: x(-hx), y: box.y + (-hy + 1) * (box.height / 2) },
    hx,
    hy,
  };
}

/** The factors a handle dragged to `to` gives the box (screen coordinates), and the screen point that stays where it is. */
export function scaleRatios(box: Box, handle: Handle, to: Pt, options: ScaleOptions, anchorScreen: Pt): { rx: number; ry: number; pivot: Pt } {
  const { at, opposite, hx, hy } = handleAt(box, handle);
  const pivot = options.aroundAnchor ? anchorScreen : opposite;
  const ratio = (now: number, was: number, fixed: number): number => (Math.abs(was - fixed) < 1e-6 ? 1 : (now - fixed) / (was - fixed));
  let rx = hx === 0 ? 1 : ratio(to.x, at.x, pivot.x);
  let ry = hy === 0 ? 1 : ratio(to.y, at.y, pivot.y);
  if (options.uniform) {
    const r = hx === 0 ? ry : hy === 0 ? rx : Math.abs(rx - 1) >= Math.abs(ry - 1) ? rx : ry;
    rx = r;
    ry = r;
  }
  return { rx, ry, pivot };
}

/** Scaling a node: its factors times the box's, with the pivot kept in place whatever its own turn and scale were. */
export function scaleGesture(start: Transform, frame: Frame, ratios: { rx: number; ry: number; pivot: Pt }): Pick<Transform, 'x' | 'y' | 'scaleX' | 'scaleY'> {
  return scaleAbout(start, frame.toLocal(ratios.pivot), start.scaleX * ratios.rx, start.scaleY * ratios.ry);
}

/** The angle, in degrees, of a point seen from a centre. */
export const angleOf = (centre: Pt, p: Pt): number => Math.atan2(p.y - centre.y, p.x - centre.x) / DEG;

/** Turning by a pointer around the anchor (screen coordinates): the angle the pointer went on top of the node's own, in steps of 15° with Shift. */
export function rotateGesture(start: Transform, anchorScreen: Pt, from: Pt, to: Pt, snap: boolean): number {
  const turned = start.rotate + angleOf(anchorScreen, to) - angleOf(anchorScreen, from);
  const value = snap ? Math.round(turned / 15) * 15 : turned;
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Turning a node by `delta` degrees around a point of its parent's coordinates (the centre of a selection's box): its own rotation grows by
 * `delta` and its anchor goes round the pivot, so each node of a selection keeps its place in the whole as it turns.
 */
export function rotateAbout(start: Transform, pivot: Pt, delta: number): Pick<Transform, 'x' | 'y' | 'rotate'> {
  const a = anchorInParent(start);
  const r = delta * DEG;
  const dx = a.x - pivot.x;
  const dy = a.y - pivot.y;
  const x = pivot.x + dx * Math.cos(r) - dy * Math.sin(r);
  const y = pivot.y + dx * Math.sin(r) + dy * Math.cos(r);
  const round = (n: number): number => Math.round(n * 1e4) / 1e4;
  return { x: round(x - start.anchorX), y: round(y - start.anchorY), rotate: round(start.rotate + delta) };
}

/** The angle the pointer went around a centre, in degrees, in steps of 15° with Shift. */
export function turnedBy(centre: Pt, from: Pt, to: Pt, snap: boolean): number {
  const delta = angleOf(centre, to) - angleOf(centre, from);
  return snap ? Math.round(delta / 15) * 15 : delta;
}

/** Dragging the anchor to a point of the screen without the node moving: `x` and `y` take up what the anchor gives up. */
export function anchorGesture(start: Transform, frame: Frame, to: Pt): Pick<Transform, 'x' | 'y' | 'anchorX' | 'anchorY'> {
  const target = frame.toLocal(to);
  const anchor = anchorInParent(start);
  const local = rsInverse(start, { x: target.x - anchor.x, y: target.y - anchor.y });
  if (!local) return { x: start.x, y: start.y, anchorX: start.anchorX, anchorY: start.anchorY };
  const anchorX = start.anchorX + local.x;
  const anchorY = start.anchorY + local.y;
  // T2 = T + (I − R·S)(A − A2): what the node would have moved is given back.
  const gap = { x: start.anchorX - anchorX, y: start.anchorY - anchorY };
  const moved = rs(start, start.scaleX, start.scaleY, gap);
  return { anchorX, anchorY, x: start.x + gap.x - moved.x, y: start.y + gap.y - moved.y };
}

/** Whether a box lies wholly inside a rectangle (both in the same coordinates). */
export const inside = (box: Box, rect: Box): boolean =>
  box.x >= rect.x && box.y >= rect.y && box.x + box.width <= rect.x + rect.width && box.y + box.height <= rect.y + rect.height;

/** The rectangle between two corners, whichever way it was dragged. */
export const rectBetween = (a: Pt, b: Pt): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });

export const unionOf = (boxes: readonly Box[]): Box | undefined => {
  if (!boxes.length) return undefined;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
};
