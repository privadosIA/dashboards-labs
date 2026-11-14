import { newDocument, newShape, type VectorDocument } from '../lib/model/document';

/** A document of the five drawn kinds: a rectangle whose width grows, a text whose size changes, an ellipse, a line and an image. */
export function shapesDocument(): VectorDocument {
  const bar = newShape('rect', 'bar', 'Bar', { width: 100, height: 40, rx: 6, transform: { x: 20, y: 30, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 50, anchorY: 20 } });
  bar.tracks = {
    width: [
      { t: 0, value: 100, ease: 'in-out' },
      { t: 4, value: 300, ease: 'linear' },
    ],
    rx: [
      { t: 0, value: 6, ease: 'linear' },
      { t: 4, value: 20, ease: 'linear' },
    ],
  };
  const title = newShape('text', 'title', 'Title', { content: 'Hello', fontSize: 40, transform: { x: 30, y: 150, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0, anchorY: 0 } });
  title.tracks = {
    fontSize: [
      { t: 0, value: 40, ease: 'out' },
      { t: 4, value: 80, ease: 'linear' },
    ],
  };
  const dot = newShape('ellipse', 'dot', 'Dot', { width: 60, height: 40 });
  dot.tracks = {
    height: [
      { t: 1, value: 40, ease: 'linear' },
      { t: 3, value: 90, ease: 'linear' },
    ],
    fill: [
      { t: 0, value: '#ff0000', ease: 'linear' },
      { t: 4, value: '#0000ff', ease: 'linear' },
    ],
  };
  const rule = newShape('line', 'rule', 'Rule', { x2: 120, y2: 30 });
  const photo = newShape('image', 'photo', 'Photo', { source: 'data:image/png;base64,iVBORw0KGgo=', width: 80, height: 60, preserve: 'cover' });
  return newDocument({ viewBox: { x: 0, y: 0, width: 400, height: 300 }, duration: 4, nodes: [bar, title, dot, rule, photo] });
}
