import type { Box } from '../import/measure';

export type AlignMode = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeMode = 'horizontal' | 'vertical';
export const ALIGN_MODES: readonly AlignMode[] = ['left', 'centre', 'right', 'top', 'middle', 'bottom'];
export const DISTRIBUTE_MODES: readonly DistributeMode[] = ['horizontal', 'vertical'];

export interface Boxed {
  id: string;
  box: Box;
}

export interface Move {
  id: string;
  dx: number;
  dy: number;
}

const right = (b: Box): number => b.x + b.width;
const bottom = (b: Box): number => b.y + b.height;

/** The box that holds all of them. */
export function unionBox(items: readonly Boxed[]): Box {
  const x = Math.min(...items.map((i) => i.box.x));
  const y = Math.min(...items.map((i) => i.box.y));
  return { x, y, width: Math.max(...items.map((i) => right(i.box))) - x, height: Math.max(...items.map((i) => bottom(i.box))) - y };
}

/**
 * How far each box moves to align to `target` (the selection's box, or the artboard), in the units of the boxes. A box already there does not
 * appear. Text aligns by its box here; `text-anchor` keeps the origin of a text out of this.
 */
export function alignMoves(items: readonly Boxed[], mode: AlignMode, target: Box): Move[] {
  const moves = items.map(({ id, box }) => {
    switch (mode) {
      case 'left':
        return { id, dx: target.x - box.x, dy: 0 };
      case 'centre':
        return { id, dx: target.x + target.width / 2 - (box.x + box.width / 2), dy: 0 };
      case 'right':
        return { id, dx: right(target) - right(box), dy: 0 };
      case 'top':
        return { id, dx: 0, dy: target.y - box.y };
      case 'middle':
        return { id, dx: 0, dy: target.y + target.height / 2 - (box.y + box.height / 2) };
      case 'bottom':
        return { id, dx: 0, dy: bottom(target) - bottom(box) };
    }
  });
  return moves.filter((m) => Math.abs(m.dx) > 1e-9 || Math.abs(m.dy) > 1e-9);
}

/**
 * Spreads the boxes so the gaps between neighbours are equal, the first and the last staying where they are. Three boxes are needed to have
 * a gap to even out; with fewer nothing moves.
 */
export function distributeMoves(items: readonly Boxed[], mode: DistributeMode): Move[] {
  if (items.length < 3) return [];
  const horizontal = mode === 'horizontal';
  const start = (b: Box): number => (horizontal ? b.x : b.y);
  const size = (b: Box): number => (horizontal ? b.width : b.height);
  const sorted = [...items].sort((a, b) => start(a.box) - start(b.box));
  const first = sorted[0].box;
  const last = sorted[sorted.length - 1].box;
  const span = start(last) + size(last) - start(first);
  const gap = (span - sorted.reduce((sum, i) => sum + size(i.box), 0)) / (sorted.length - 1);
  const moves: Move[] = [];
  let cursor = start(first) + size(first) + gap;
  for (const item of sorted.slice(1, -1)) {
    const delta = cursor - start(item.box);
    if (Math.abs(delta) > 1e-9) moves.push(horizontal ? { id: item.id, dx: delta, dy: 0 } : { id: item.id, dx: 0, dy: delta });
    cursor += size(item.box) + gap;
  }
  return moves;
}
