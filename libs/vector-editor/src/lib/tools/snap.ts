import type { Box } from '../import/measure';

/** How close, in screen pixels, a box has to be to an edge or a centre to snap to it. */
export const SNAP_REACH = 6;

export interface Guides {
  /** Screen x of the vertical guides that are on. */
  x: number[];
  y: number[];
}

export const NO_GUIDES: Guides = { x: [], y: [] };

const lines = (b: Box, axis: 'x' | 'y'): number[] => {
  const from = axis === 'x' ? b.x : b.y;
  const size = axis === 'x' ? b.width : b.height;
  return [from, from + size / 2, from + size];
};

function pick(own: number[], targets: number[], reach: number): { delta: number; at: number[] } {
  let best: number | undefined;
  for (const o of own) for (const t of targets) if (Math.abs(t - o) <= reach && (best === undefined || Math.abs(t - o) < Math.abs(best))) best = t - o;
  if (best === undefined) return { delta: 0, at: [] };
  // Every target the box lands on is shown, not only the one that decided.
  const hit = new Set<number>();
  for (const o of own) for (const t of targets) if (Math.abs(o + best - t) < 1e-6) hit.add(t);
  return { delta: best, at: [...hit] };
}

/**
 * Snaps a box being moved (screen pixels, the move already added) to the edges and centres of the `targets` (the other nodes' boxes and the
 * artboard's): what to add to the move, and the guides to draw. Alt suspends it: the caller does not call this.
 */
export function snapToBoxes(box: Box, targets: readonly Box[], reach: number = SNAP_REACH): { dx: number; dy: number; guides: Guides } {
  const sx = pick(lines(box, 'x'), targets.flatMap((t) => lines(t, 'x')), reach);
  const sy = pick(lines(box, 'y'), targets.flatMap((t) => lines(t, 'y')), reach);
  return { dx: sx.delta, dy: sy.delta, guides: { x: sx.at, y: sy.at } };
}
