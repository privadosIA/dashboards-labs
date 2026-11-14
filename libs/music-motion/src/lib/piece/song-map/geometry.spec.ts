import type { SongMap } from '@lab/animation-core';
import { HEIGHT, MAX_BEATS, WIDTH, geometryOf } from './geometry';

const map = (extra: Partial<SongMap> = {}): SongMap => ({
  duration: 20,
  bpm: 120,
  beats: [0, 0.5, 1, 1.5],
  beatBase: 0,
  gridAnchored: true,
  sections: [{ tag: 'verse', start: 0, end: 10 }, { tag: 'chorus', start: 10, end: 20 }],
  words: [{ text: 'hello', start: 5, end: 6, line: 0 }],
  wordsEstimated: false,
  loudnessHop: 0.25,
  loudness: [0, 0.5, 1],
  ...extra,
});

describe('the geometry of a song map', () => {
  it('puts the sections side by side across the width, in proportion to their time', () => {
    expect(geometryOf(map()).sections).toEqual([{ tag: 'verse', x: 0, width: WIDTH / 2 }, { tag: 'chorus', x: WIDTH / 2, width: WIDTH / 2 }]);
  });

  it('puts a beat and a word where their time is', () => {
    const g = geometryOf(map());
    expect(g.beats).toEqual([0, 25, 50, 75]);
    expect(g.words).toEqual([{ text: 'hello', x: 250 }]);
  });

  it('draws the loudness from the bottom edge up to the top, the loudest at the top', () => {
    const points = geometryOf(map()).loudness.split(' ').map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual([0, HEIGHT]);
    expect(points[2][0]).toBe(WIDTH);
    expect(points[2][1]).toBeLessThan(points[1][1]);
    expect(points[1][1]).toBeLessThan(points[0][1]);
  });

  it('draws no loudness when it is flat or missing', () => {
    expect(geometryOf(map({ loudness: [] })).loudness).toBe('');
    expect(geometryOf(map({ loudness: [0, 0, 0] })).loudness).toBe('');
    expect(geometryOf(map({ loudness: [0.4] })).loudness).toBe('');
  });

  it('draws one beat in each bar when there are too many to tell apart', () => {
    const beats = Array.from({ length: MAX_BEATS + 8 }, (_, i) => i * 0.1);
    const g = geometryOf(map({ duration: 100, beats }), 4);
    expect(g.beats).toHaveLength((MAX_BEATS + 8) / 4);
  });

  it('keeps a time outside the song on its edge', () => {
    const g = geometryOf(map({ words: [{ text: 'late', start: 99, end: 100, line: 0 }], beats: [-3] }));
    expect(g.words[0].x).toBe(WIDTH);
    expect(g.beats).toEqual([0]);
  });

  it('turns a span into a rectangle, and nothing into nothing', () => {
    const g = geometryOf(map());
    expect(g.span({ start: 5, end: 10 })).toEqual({ x: 250, width: 250 });
    expect(g.span(null)).toBeNull();
  });

  it('has no width to divide for a song of no length, and does not fail', () => {
    const g = geometryOf(map({ duration: 0, sections: [{ tag: 'x', start: 0, end: 0 }] }));
    expect(g.sections[0].x).toBe(0);
    expect(g.span({ start: 0, end: 1 })).toBeNull();
  });
});
