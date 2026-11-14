/** A window's box in pixels, from the top-left corner of the screen. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The side or corner being dragged: n, s, e, w or a pair such as se. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export const MIN_WIDTH = 560;
export const MIN_HEIGHT = 360;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.max(lo, v)));

/**
 * The box after dragging an edge or corner by (dx, dy): the opposite side stays
 * where it is, nothing goes beyond the screen and nothing gets smaller than the minimum.
 */
export function resizeRect(start: Rect, edge: Edge, dx: number, dy: number, screen: { width: number; height: number }): Rect {
  let { left, top, width, height } = start;
  if (edge.includes('e')) width = clamp(start.width + dx, MIN_WIDTH, screen.width - start.left);
  if (edge.includes('s')) height = clamp(start.height + dy, MIN_HEIGHT, screen.height - start.top);
  if (edge.includes('w')) {
    const right = start.left + start.width;
    left = clamp(start.left + dx, 0, right - MIN_WIDTH);
    width = right - left;
  }
  if (edge.includes('n')) {
    const bottom = start.top + start.height;
    top = clamp(start.top + dy, 0, bottom - MIN_HEIGHT);
    height = bottom - top;
  }
  return { left, top, width, height };
}

/** The box after moving it by (dx, dy): always within the screen's width, and with its title bar reachable. */
export function moveRect(start: Rect, dx: number, dy: number, screen: { width: number; height: number }, bar = 48): Rect {
  return {
    ...start,
    left: clamp(start.left + dx, 0, screen.width - start.width),
    top: clamp(start.top + dy, 0, screen.height - bar),
  };
}
