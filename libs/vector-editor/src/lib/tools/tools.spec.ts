import { identityTransform } from '../model/document';
import { alignMoves, distributeMoves, unionBox } from './align';
import { drawFromDrag } from './draw';
import { checkImage, fitImage, MAX_IMAGE_BYTES } from './image';
import { snapToBoxes } from './snap';
import { drawsByDragging, toolForKey } from './tools';

const base = identityTransform();
const defaults = { width: 200, height: 120, x2: 200, y2: 0 };
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('tools', () => {
  it('are chosen by V R E L T I in either case, and nothing else', () => {
    expect(['v', 'R', 'e', 'L', 't', 'I'].map(toolForKey)).toEqual(['select', 'rect', 'ellipse', 'line', 'text', 'image']);
    expect(toolForKey('x')).toBeUndefined();
    expect(drawsByDragging('rect') && drawsByDragging('line') && !drawsByDragging('text') && !drawsByDragging('image')).toBe(true);
  });
});

describe('drawFromDrag', () => {
  it('makes the rectangle between the corners whichever way it is dragged', () => {
    expect(drawFromDrag('rect', { x: 10, y: 20 }, { x: 110, y: 70 }, false, base, defaults)).toMatchObject({ transform: { x: 10, y: 20 }, width: 100, height: 50 });
    expect(drawFromDrag('rect', { x: 110, y: 70 }, { x: 10, y: 20 }, false, base, defaults)).toMatchObject({ transform: { x: 10, y: 20 }, width: 100, height: 50 });
  });

  it('makes a square, a circle and a 45° line with Shift', () => {
    expect(drawFromDrag('rect', { x: 0, y: 0 }, { x: 100, y: 40 }, true, base, defaults)).toMatchObject({ width: 100, height: 100 });
    expect(drawFromDrag('ellipse', { x: 0, y: 0 }, { x: 100, y: 40 }, true, base, defaults)).toMatchObject({ transform: { x: 50, y: 50 }, width: 100, height: 100 });
    const line = drawFromDrag('line', { x: 0, y: 0 }, { x: 100, y: 30 }, true, base, defaults) as { x2: number; y2: number };
    expect(line.x2).toBeCloseTo(Math.hypot(100, 30), 6);
    expect(line.y2).toBeCloseTo(0, 6);
    const diagonal = drawFromDrag('line', { x: 0, y: 0 }, { x: 60, y: 50 }, true, base, defaults) as { x2: number; y2: number };
    expect(diagonal.x2).toBeCloseTo(diagonal.y2, 6);
  });

  it('puts the ellipse’s origin at the centre of its box and the line’s at its start', () => {
    expect(drawFromDrag('ellipse', { x: 0, y: 0 }, { x: 80, y: 40 }, false, base, defaults)).toMatchObject({ transform: { x: 40, y: 20 }, width: 80, height: 40 });
    expect(drawFromDrag('line', { x: 5, y: 6 }, { x: 25, y: 46 }, false, base, defaults)).toMatchObject({ transform: { x: 5, y: 6 }, x2: 20, y2: 40 });
  });

  it('gives a click the default size at the point', () => {
    expect(drawFromDrag('rect', { x: 50, y: 60 }, { x: 51, y: 60 }, false, base, defaults)).toMatchObject({ transform: { x: 50, y: 60 }, width: 200, height: 120 });
    expect(drawFromDrag('ellipse', { x: 50, y: 60 }, { x: 50, y: 60 }, false, base, defaults)).toMatchObject({ transform: { x: 150, y: 120 }, width: 200, height: 120 });
  });
});

describe('images', () => {
  it('take PNG, JPEG, WebP and SVG up to 2 MB', () => {
    expect(checkImage({ type: 'image/png', size: 10 })).toBeUndefined();
    expect(checkImage({ type: 'image/svg+xml', size: MAX_IMAGE_BYTES })).toBeUndefined();
    expect(checkImage({ type: 'image/gif', size: 10 })).toBe('type');
    expect(checkImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('size');
  });

  it('are fitted to half of the artboard and never enlarged', () => {
    expect(fitImage({ width: 4000, height: 2000 }, { width: 1920, height: 1080 })).toEqual({ width: 960, height: 480 });
    expect(fitImage({ width: 100, height: 50 }, { width: 1920, height: 1080 })).toEqual({ width: 100, height: 50 });
  });
});

describe('align', () => {
  const items = [
    { id: 'a', box: box(0, 0, 10, 10) },
    { id: 'b', box: box(30, 20, 20, 10) },
    { id: 'c', box: box(100, 50, 10, 30) },
  ];

  it('moves each node to the left, centre, right, top, middle or bottom of the target', () => {
    const target = unionBox(items);
    expect(target).toEqual(box(0, 0, 110, 80));
    expect(alignMoves(items, 'left', target)).toEqual([{ id: 'b', dx: -30, dy: 0 }, { id: 'c', dx: -100, dy: 0 }]);
    expect(alignMoves(items, 'right', target)).toEqual([{ id: 'a', dx: 100, dy: 0 }, { id: 'b', dx: 60, dy: 0 }]);
    expect(alignMoves(items, 'centre', target).map((m) => m.dx)).toEqual([50, 15, -50]);
    expect(alignMoves(items, 'top', target)).toEqual([{ id: 'b', dx: 0, dy: -20 }, { id: 'c', dx: 0, dy: -50 }]);
    expect(alignMoves(items, 'bottom', target).map((m) => m.dy)).toEqual([70, 50]);
    expect(alignMoves(items, 'middle', target).map((m) => m.dy)).toEqual([35, 15, -25]);
  });

  it('centres one node on the artboard', () => {
    const [move] = alignMoves([items[0]], 'centre', box(0, 0, 200, 100));
    expect(items[0].box.x + items[0].box.width / 2 + move.dx).toBe(100);
  });

  it('distributes so the gaps are equal, leaving the ends, and does nothing with fewer than three', () => {
    const row = [
      { id: 'a', box: box(0, 0, 10, 10) },
      { id: 'b', box: box(15, 0, 10, 10) },
      { id: 'c', box: box(100, 0, 10, 10) },
    ];
    expect(distributeMoves(row, 'horizontal')).toEqual([{ id: 'b', dx: 35, dy: 0 }]);
    expect(distributeMoves(row.slice(0, 2), 'horizontal')).toEqual([]);
    const column = row.map((r, i) => ({ id: r.id, box: box(0, [0, 15, 100][i], 10, 10) }));
    expect(distributeMoves(column, 'vertical')).toEqual([{ id: 'b', dx: 0, dy: 35 }]);
  });
});

describe('snapToBoxes', () => {
  const other = box(100, 100, 50, 50);

  it('lands a box 4 pixels from another’s edge on it, with a guide, and not at 8', () => {
    const near = snapToBoxes(box(104, 300, 30, 30), [other]);
    expect(near).toMatchObject({ dx: -4, dy: 0, guides: { x: [100], y: [] } });
    expect(snapToBoxes(box(108, 300, 10, 10), [other])).toMatchObject({ dx: 0, dy: 0, guides: { x: [], y: [] } });
  });

  it('snaps centres and the far edges too, on both axes at once', () => {
    const c = snapToBoxes(box(113, 113, 24, 24), [other]);
    expect(c).toMatchObject({ dx: 0, dy: 0, guides: { x: [125], y: [125] } });
  });

  it('shows every line the box lands on', () => {
    // 101 goes to 100 (the first box's edge) and 111 to 110 (the second box's right edge): both are on after the move.
    const s = snapToBoxes(box(101, 0, 20, 10), [other, box(100, 300, 10, 10)]);
    expect(s.dx).toBe(-1);
    expect(s.guides.x).toEqual([100, 110]);
  });
});
