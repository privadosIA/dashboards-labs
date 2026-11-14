import type { SongMap } from '@lab/animation-core';

import { injectedScript } from './preview-wrapper';
import { beatOfSlice, loudnessOfSlice, round3, sliceSongMap } from './song-slice';

const map = (extra: Partial<SongMap> = {}): SongMap => ({
  duration: 4,
  bpm: 120,
  beats: [0.5, 1.0, 1.5],
  beatBase: 0,
  gridAnchored: true,
  sections: [{ tag: 'verse', start: 0, end: 2 }, { tag: 'chorus', start: 2, end: 4 }],
  words: [{ text: 'a', start: 0.2, end: 0.4, line: 0 }, { text: 'b', start: 1.3, end: 1.6, line: 0 }, { text: 'c', start: 2.5, end: 2.9, line: 1 }],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  ...extra,
});

describe('sliceSongMap', () => {
  it('keeps the beat just before the start and drops the ones before that (the scenario of the spec)', () => {
    const s = sliceSongMap(map(), 1.2, 3);
    expect(s.beats).toEqual([-0.2, 0.3]);
    expect(s.beat_base).toBe(1);
    expect(s.duration).toBe(1.8);
  });

  it('leaves beat_base at 0 when the first beat is kept', () => {
    expect(sliceSongMap(map(), 0, 2).beat_base).toBe(0);
    expect(sliceSongMap(map(), 0, 2).beats).toEqual([0.5, 1, 1.5]);
  });

  it('cuts the sections to the range and shifts them', () => {
    expect(sliceSongMap(map(), 1, 3).sections).toEqual([{ tag: 'verse', start: 0, end: 1 }, { tag: 'chorus', start: 1, end: 2 }]);
    expect(sliceSongMap(map(), 2, 3).sections).toEqual([{ tag: 'chorus', start: 0, end: 1 }]);
  });

  it('keeps the words that start inside, with their end clipped', () => {
    const s = sliceSongMap(map(), 1.3, 1.5);
    expect(s.words).toEqual([{ text: 'b', start: 0, end: 0.2, line: 0 }]);
  });

  it('takes the loudness from floor(start/hop) to ceil(end/hop)', () => {
    expect(sliceSongMap(map(), 0.7, 1.6).loudness).toEqual([0.2, 0.3, 0.4]);
  });

  it('is empty for a range with no length, and carries the grid flag', () => {
    expect(sliceSongMap(map(), 2, 2)).toMatchObject({ duration: 0, beats: [], sections: [], words: [], loudness: [] });
    expect(sliceSongMap(map({ gridAnchored: false }), 0, 1).grid_anchored).toBe(false);
  });

  it('rounds to three decimals like the server', () => {
    expect(round3(1.0005)).toBe(1.001);
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });
});

describe('the beat and the loudness of a slice', () => {
  const song = map({ beats: [0.5, 1, 1.5, 2, 3], loudnessHop: 0.5, loudness: [0.2, 0.4, 0.6, 0.8, 1, 0.1, 0.3, 0.5] });

  it('gives the beat the page’s own clock gives, at many times of several slices (the canvas pulses where the preview does)', () => {
    for (const [start, end] of [[0, 4], [1.2, 3], [0.7, 2.9]] as const) {
      const slice = sliceSongMap(song, start, end);
      const win: Record<string, unknown> = { requestAnimationFrame: (cb: () => void) => { cb(); return 1; }, addEventListener: () => undefined, __seek: () => undefined };
      new Function('window', 'performance', 'Date', 'document', 'setTimeout', 'gsap', injectedScript(end - start, slice))(win, { now: () => 0 }, { now: () => 0 }, { getAnimations: () => [] }, setTimeout, undefined);
      for (let i = 0; i <= 40; i++) {
        const t = ((end - start) * i) / 40;
        (win['__motionSeek'] as (t: number) => unknown)(t);
        const page = win['__beat'] as { number: number; position: number };
        const mine = beatOfSlice(slice, t);
        expect(mine.number, `${start}-${end} at ${t}`).toBe(page.number);
        expect(mine.position, `${start}-${end} at ${t}`).toBeCloseTo(page.position, 9);
      }
    }
  });

  it('is -1 before the first beat and never reaches 1', () => {
    const slice = sliceSongMap(song, 0, 4);
    expect(beatOfSlice(slice, 0.2).number).toBe(-1);
    expect(beatOfSlice(slice, 0.9999999).position).toBeLessThan(1);
  });

  it('reads the loudness as the part’s runtime does: loudness[floor(t / hop)], held at the ends, nothing without a curve', () => {
    const slice = sliceSongMap(song, 0, 4);
    expect(loudnessOfSlice(slice, 0)).toBe(0.2);
    expect(loudnessOfSlice(slice, 1.2)).toBe(0.6);
    expect(loudnessOfSlice(slice, 99)).toBe(0.5);
    expect(loudnessOfSlice({ loudness: [], loudness_hop: 0.5 }, 1)).toBeUndefined();
  });
});

