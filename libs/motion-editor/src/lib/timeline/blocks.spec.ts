import type { Script } from '@lab/animation-core';

import { blocksOf } from './blocks';

const words = [{ text: 'a', start: 1.5, end: 2, line: 0 }, { text: 'b', start: 6, end: 7, line: 1 }];

describe('blocksOf', () => {
  it('lists the pieces in time order with their part and extras', () => {
    const script: Script = { version: 1, pieces: [{ id: 'b', start: 4, end: 8, part: 'x', with: [{ part: 'y' }, { part: 'z' }] }, { id: 'a', start: 0, end: 4, part: 'w' }] };
    const blocks = blocksOf(script, { words });
    expect(blocks.map((b) => b.id)).toEqual(['a', 'b']);
    expect(blocks[1].extras).toEqual([{ part: 'y', index: 0 }, { part: 'z', index: 1 }]);
    expect(blocks[0].extras).toEqual([]);
  });

  it('places a dot for each line at the time it starts, from the song map or from its own start', () => {
    const script: Script = { version: 1, pieces: [{ id: 'a', start: 0, end: 8, part: 'x', lines: [{ line: 0 }, { line: 1 }, { text: 'own', start: 3, end: 4 }, { line: 9 }] }] };
    expect(blocksOf(script, { words })[0].dots).toEqual([1.5, 6, 3, 0]);
  });

  it('flags the word hit with its time', () => {
    const script: Script = { version: 1, pieces: [{ id: 'a', start: 0, end: 8, part: 'x', hit: { word: 'go', at: 2.5, length: 1 } }, { id: 'b', start: 8, end: 9, part: 'x' }] };
    const [a, b] = blocksOf(script, { words });
    expect(a.hit).toBe(2.5);
    expect(b.hit).toBeUndefined();
  });

  it('counts the parts the page of a piece draws: its main part, its extras and the layer items that touch it', () => {
    const script: Script = {
      version: 1,
      pieces: [{ id: 'a', start: 0, end: 4, part: 'x', with: [{ part: 'y' }] }, { id: 'b', start: 4, end: 8, part: 'w' }],
      layers: [{ id: 'l', items: [{ part: 'p', start: 3, end: 5 }, { part: 'q', start: 6, end: 7 }] }],
    };
    const [a, b] = blocksOf(script, { words });
    expect(a.pageParts).toBe(3); // x, y and the item that starts at 3 s
    expect(b.pageParts).toBe(3); // w and the two items that touch it
  });
});
