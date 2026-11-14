import { identityTransform, type Transform } from '../model/document';
import { anchorGesture, anchorInParent, handleAt, inside, moveGesture, rectBetween, rotateGesture, scaleAbout, scaleGesture, rotateAbout, scaleRatios, turnedBy, unionOf, type Frame } from './gestures';
import { fitView, scaleOf, stageBox, toArt, toScreen, zoomAt } from './view';

const identity: Frame = { toLocal: (p) => p, toScreen: (p) => p };
const t = (patch: Partial<Transform> = {}): Transform => ({ ...identityTransform(), ...patch });

/** Where a point of the node's own coordinates lands in its parent's: the model's transform, written here on its own. */
function place(tr: Transform, p: { x: number; y: number }): { x: number; y: number } {
  const a = (tr.rotate * Math.PI) / 180;
  const x = (p.x - tr.anchorX) * tr.scaleX;
  const y = (p.y - tr.anchorY) * tr.scaleY;
  return { x: tr.x + tr.anchorX + x * Math.cos(a) - y * Math.sin(a), y: tr.y + tr.anchorY + x * Math.sin(a) + y * Math.cos(a) };
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('moving', () => {
  it('adds the distance the pointer went, in the parent’s coordinates', () => {
    expect(moveGesture(t({ x: 5 }), identity, { x: 10, y: 10 }, { x: 50, y: 10 })).toEqual({ x: 45, y: 0 });
  });

  it('goes through the frame: a parent drawn at half size takes twice the distance', () => {
    const half: Frame = { toLocal: (p) => ({ x: p.x * 2, y: p.y * 2 }), toScreen: (p) => ({ x: p.x / 2, y: p.y / 2 }) };
    expect(moveGesture(t(), half, { x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 20, y: 40 });
  });
});

describe('scaling', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };

  it('gives the handles of a box and the side opposite each', () => {
    expect(handleAt(box, 'se')).toMatchObject({ at: { x: 300, y: 200 }, opposite: { x: 100, y: 100 } });
    expect(handleAt(box, 'n')).toMatchObject({ at: { x: 200, y: 100 }, opposite: { x: 200, y: 200 }, hx: 0, hy: -1 });
  });

  it('takes the ratio of the handle’s new place to its old one about the opposite corner', () => {
    const r = scaleRatios(box, 'se', { x: 500, y: 300 }, { uniform: false, aroundAnchor: false }, { x: 200, y: 150 });
    expect(r).toEqual({ rx: 2, ry: 2, pivot: { x: 100, y: 100 } });
    expect(scaleRatios(box, 'e', { x: 500, y: 999 }, { uniform: false, aroundAnchor: false }, { x: 0, y: 0 })).toMatchObject({ rx: 2, ry: 1 });
  });

  it('keeps the ratio with Shift, following the axis that moved most, and scales about the anchor with Alt', () => {
    const shift = scaleRatios(box, 'se', { x: 500, y: 210 }, { uniform: true, aroundAnchor: false }, { x: 0, y: 0 });
    expect(shift.rx).toBe(shift.ry);
    expect(shift.rx).toBe(2);
    const alt = scaleRatios(box, 'e', { x: 400, y: 150 }, { uniform: false, aroundAnchor: true }, { x: 200, y: 150 });
    expect(alt).toMatchObject({ rx: 2, pivot: { x: 200, y: 150 } });
  });

  it('keeps the pivot where it is, whatever the node’s own turn and scale', () => {
    const start = t({ x: 30, y: -10, rotate: 40, scaleX: 1.5, scaleY: 0.5, anchorX: 20, anchorY: 10 });
    const q = { x: 77, y: 31 };
    const local = (() => {
      // the point of the node that is at q now
      const a = (-start.rotate * Math.PI) / 180;
      const dx = q.x - start.x - start.anchorX;
      const dy = q.y - start.y - start.anchorY;
      return { x: start.anchorX + (dx * Math.cos(a) - dy * Math.sin(a)) / start.scaleX, y: start.anchorY + (dx * Math.sin(a) + dy * Math.cos(a)) / start.scaleY };
    })();
    const next = scaleAbout(start, q, 3, 2);
    near(place({ ...start, ...next }, local), q);
    expect(next).toMatchObject({ scaleX: 3, scaleY: 2 });
  });

  it('multiplies the node’s own factors by the box’s', () => {
    const next = scaleGesture(t({ scaleX: 2 }), identity, { rx: 1.5, ry: 2, pivot: { x: 0, y: 0 } });
    expect(next).toMatchObject({ scaleX: 3, scaleY: 2 });
  });

  it('leaves a node alone that has no scale to start from', () => {
    expect(scaleAbout(t({ scaleX: 0 }), { x: 5, y: 5 }, 2, 2)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('turning', () => {
  it('adds the angle the pointer turned about the anchor to the node’s own', () => {
    const anchor = { x: 100, y: 100 };
    expect(rotateGesture(t({ rotate: 10 }), anchor, { x: 200, y: 100 }, { x: 100, y: 200 }, false)).toBeCloseTo(100);
  });

  it('goes by 15° with Shift', () => {
    expect(rotateGesture(t(), { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 }, true)).toBe(15);
  });
});

describe('the anchor', () => {
  it('moves without the node moving: every point of it lands where it did', () => {
    const start = t({ x: 12, y: 3, rotate: 30, scaleX: 2, scaleY: 1.5, anchorX: 10, anchorY: 20 });
    const next = { ...start, ...anchorGesture(start, identity, { x: 60, y: 50 }) };
    expect(next.anchorX).not.toBe(start.anchorX);
    for (const p of [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: -5, y: 77 }]) near(place(next, p), place(start, p));
  });

  it('is dropped at the pointer: the new anchor is where the pointer is, in the parent', () => {
    const start = t({ anchorX: 10, anchorY: 10 });
    const next = { ...start, ...anchorGesture(start, identity, { x: 60, y: 50 }) };
    near(anchorInParent(next), { x: 60, y: 50 });
  });
});

describe('selecting and the view', () => {
  it('knows a box inside a rectangle, the rectangle between two corners and the union of boxes', () => {
    expect(inside({ x: 10, y: 10, width: 5, height: 5 }, rectBetween({ x: 20, y: 20 }, { x: 0, y: 0 }))).toBe(true);
    expect(inside({ x: 10, y: 10, width: 50, height: 5 }, rectBetween({ x: 20, y: 20 }, { x: 0, y: 0 }))).toBe(false);
    expect(unionOf([{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 10 }])).toEqual({ x: 0, y: 0, width: 30, height: 15 });
    expect(unionOf([])).toBeUndefined();
  });

  it('fits the artboard, converts both ways and zooms around a point that stays put', () => {
    const view = fitView({ x: 0, y: 0, width: 200, height: 100 }, { width: 800, height: 600 });
    expect(scaleOf(view)).toBeCloseTo(3.6);
    near(toArt(view, toScreen(view, { x: 37, y: 11 })), { x: 37, y: 11 });
    const at = { x: 300, y: 250 };
    const zoomed = zoomAt(view, 2, at);
    near(toScreen(zoomed, toArt(view, at)), at);
    expect(zoomed.zoom).toBe(2);
    expect(zoomAt(view, 1e9, at).zoom).toBe(40);
  });

  it('gives the stage a viewBox in which an artboard unit lands where the view says', () => {
    const view = fitView({ x: 0, y: 0, width: 200, height: 100 }, { width: 800, height: 600 });
    const [x, y, w, h] = stageBox(view).split(' ').map(Number);
    const p = { x: 50, y: 20 };
    const s = toScreen(view, p);
    near({ x: ((p.x - x) / w) * 800, y: ((p.y - y) / h) * 600 }, s);
  });
});

describe('turning several nodes together', () => {
  const at = (x: number, y: number): Transform => ({ x, y, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0, anchorY: 0 });

  it('turns each node by the same angle and takes its anchor round the common centre', () => {
    const pivot = { x: 50, y: 0 };
    const a = rotateAbout(at(0, 0), pivot, 90);
    const b = rotateAbout(at(100, 0), pivot, 90);
    expect(a).toMatchObject({ rotate: 90 });
    expect(a.x).toBeCloseTo(50, 3);
    expect(a.y).toBeCloseTo(-50, 3);
    expect(b.rotate).toBe(90);
    expect(b.x).toBeCloseTo(50, 3);
    expect(b.y).toBeCloseTo(50, 3);
  });

  it('keeps a node that turns about its own anchor where it is', () => {
    const start = { ...at(10, 20), anchorX: 5, anchorY: 5, rotate: 30 };
    expect(rotateAbout(start, { x: 15, y: 25 }, 45)).toEqual({ x: 10, y: 20, rotate: 75 });
  });

  it('measures the angle the pointer went, in steps of 15° with Shift', () => {
    expect(turnedBy({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, false)).toBeCloseTo(90, 6);
    expect(turnedBy({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, true)).toBe(15 * Math.round(Math.atan2(3, 10) * 180 / Math.PI / 15));
  });
});
