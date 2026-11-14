import type { DrawnNodeOf } from '../model/document';

export interface Point {
  x: number;
  y: number;
}

/** A drag shorter than this (in artboard units) is a click: the shape gets its default size. */
export const CLICK_REACH = 3;

/** The part of a shape's fields a drag from `a` to `b` decides, in the coordinates the node lives in. */
export type DragPatch = Partial<Pick<DrawnNodeOf, 'transform'>> & Record<string, unknown>;

type Transform = DrawnNodeOf['transform'];

const at = (x: number, y: number, over: Transform): Transform => ({ ...over, x, y });

/**
 * What a drag of a shape tool makes: a rectangle between the two corners (its origin at the top left), an ellipse in that box (its origin
 * at the centre), a line from `a` to `b`. Shift makes the rectangle a square, the ellipse a circle and the line a multiple of 45°.
 * A click (no drag) gives the kind's default size at the point: the rectangle's corner, the ellipse's centre, the line's start.
 */
export function drawFromDrag(
  kind: 'rect' | 'ellipse' | 'line',
  a: Point,
  b: Point,
  shift: boolean,
  base: Transform,
  defaults: { width: number; height: number; x2: number; y2: number },
): DragPatch {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const click = Math.hypot(dx, dy) < CLICK_REACH;
  if (kind === 'line') {
    let x2 = click ? defaults.x2 : dx;
    let y2 = click ? defaults.y2 : dy;
    if (shift && !click) {
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(dy, dx) / step) * step;
      const length = Math.hypot(dx, dy);
      x2 = Math.round(Math.cos(angle) * length * 1e6) / 1e6;
      y2 = Math.round(Math.sin(angle) * length * 1e6) / 1e6;
    }
    return { transform: at(a.x, a.y, base), x2, y2 };
  }
  let width = click ? defaults.width : Math.abs(dx);
  let height = click ? defaults.height : Math.abs(dy);
  if (shift && !click) width = height = Math.max(width, height);
  // The box grows from `a` towards `b`, whichever way that is.
  const left = click || dx >= 0 ? a.x : a.x - width;
  const top = click || dy >= 0 ? a.y : a.y - height;
  if (kind === 'rect') return { transform: at(left, top, base), width, height };
  return { transform: at(left + width / 2, top + height / 2, base), width, height };
}
