import { setKeyframe, type VectorDocument } from '@lab/vector-editor';

/** What the example does over its four seconds: the ring turns, the dot beats and the bars rise one after another. It has no text: a part with text that overlaps the words of a song is refused by the server. */
export function animateExample(doc: VectorDocument): VectorDocument {
  const key = (d: VectorDocument, id: string, property: Parameters<typeof setKeyframe>[2], t: number, value: number, ease: Parameters<typeof setKeyframe>[5] = 'linear') =>
    setKeyframe(d, id, property, t, value, ease);
  let d = doc;
  d = key(key(d, 'ring', 'rotate', 0, 0), 'ring', 'rotate', 4, 360);
  d = key(key(key(d, 'dot', 'scaleX', 0, 1, 'in-out'), 'dot', 'scaleX', 2, 1.25, 'in-out'), 'dot', 'scaleX', 4, 1, 'in-out');
  d = key(key(key(d, 'dot', 'scaleY', 0, 1, 'in-out'), 'dot', 'scaleY', 2, 1.25, 'in-out'), 'dot', 'scaleY', 4, 1, 'in-out');
  [
    ['bar-a', 0.4],
    ['bar-b', 0.8],
    ['bar-c', 1.2],
  ].forEach(([id, start]) => {
    d = key(key(d, id as string, 'scaleY', start as number, 0, 'out'), id as string, 'scaleY', (start as number) + 1, 1);
  });
  return d;
}
