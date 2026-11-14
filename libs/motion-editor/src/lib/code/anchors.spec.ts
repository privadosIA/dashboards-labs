import type { SongMap } from '@lab/animation-core';

import { anchorFor, resolveTime, tagOf, type TimeRef } from './anchors';

const map = (extra: Partial<SongMap> = {}): SongMap => ({
  duration: 40,
  bpm: 120,
  beats: [0.5, 1, 1.5, 2, 2.5, 3],
  beatBase: 0,
  gridAnchored: true,
  sections: [
    { tag: 'Verse', start: 0, end: 10 },
    { tag: 'Chorus', start: 10, end: 20 },
    { tag: 'Verse', start: 20, end: 30 },
    { tag: 'Chorus', start: 30, end: 40 },
  ],
  words: [],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [],
  ...extra,
});

const seconds = (ref: TimeRef, m = map()): number | string => {
  const r = resolveTime(ref, m);
  return r.ok ? r.seconds : r.code;
};

describe('resolveTime', () => {
  it('takes seconds as they are, to three decimals', () => {
    expect(seconds({ kind: 'seconds', value: 12.3456 })).toBe(12.346);
    expect(seconds({ kind: 'seconds', value: -1 })).toBe('time-range');
  });

  it('resolves song.end to the duration', () => {
    expect(seconds({ kind: 'song-end' })).toBe(40);
  });

  it('numbers the beats from beatBase', () => {
    expect(seconds({ kind: 'beat', n: 2, f: 0.5 }, map({ beatBase: 0 }))).toBe(1.75);
    expect(seconds({ kind: 'beat', n: 100 }, map({ beatBase: 100 }))).toBe(0.5);
    expect(seconds({ kind: 'beat', n: 103 }, map({ beatBase: 100 }))).toBe(2);
  });

  it('measures the part of a beat with the next one, or with the one before at the end', () => {
    expect(seconds({ kind: 'beat', n: 0, f: 0.5 })).toBe(0.75);
    expect(seconds({ kind: 'beat', n: 5, f: 0.5 })).toBe(3.25);
    expect(seconds({ kind: 'beat', n: 0, f: 0.5 }, map({ beats: [1] }))).toBe(1.25);
  });

  it('refuses a beat out of range and a bad fraction', () => {
    const r = resolveTime({ kind: 'beat', n: 6 }, map());
    expect(r).toEqual({ ok: false, code: 'beat-range', args: { n: 6, first: 0, last: 5 } });
    expect(seconds({ kind: 'beat', n: -1 })).toBe('beat-range');
    expect(seconds({ kind: 'beat', n: 1.5 })).toBe('beat-range');
    expect(seconds({ kind: 'beat', n: 1, f: 1 })).toBe('beat-fraction');
    expect(seconds({ kind: 'beat', n: 1, f: -0.1 })).toBe('beat-fraction');
  });

  it('finds the k-th section of a tag, the first by default, whatever the case', () => {
    expect(seconds({ kind: 'section', tag: 'chorus', edge: 'start' })).toBe(10);
    expect(seconds({ kind: 'section', tag: 'chorus', k: 2, edge: 'start' })).toBe(30);
    expect(seconds({ kind: 'section', tag: 'verse', k: 2, edge: 'end' })).toBe(30);
  });

  it('refuses a section that is not there', () => {
    expect(resolveTime({ kind: 'section', tag: 'bridge', edge: 'start' }, map())).toEqual({ ok: false, code: 'no-section', args: { tag: 'bridge' } });
    expect(resolveTime({ kind: 'section', tag: 'chorus', k: 3, edge: 'start' }, map())).toEqual({ ok: false, code: 'no-section', args: { tag: 'chorus', k: 3 } });
    expect(seconds({ kind: 'section', tag: 'chorus', k: 0, edge: 'start' })).toBe('no-section');
  });
});

describe('anchorFor', () => {
  it('writes the end of the song as song.end', () => {
    expect(anchorFor(40, map())).toEqual({ kind: 'song-end' });
  });

  it('writes a section start, with k only after the first', () => {
    expect(anchorFor(10, map())).toEqual({ kind: 'section', tag: 'chorus', edge: 'start' });
    expect(anchorFor(30, map())).toEqual({ kind: 'section', tag: 'chorus', k: 2, edge: 'start' });
  });

  it('prefers the start of the next section to the end of the one before', () => {
    expect(anchorFor(20, map())).toEqual({ kind: 'section', tag: 'verse', k: 2, edge: 'start' });
  });

  it('writes the end of a section when no section starts there', () => {
    const gap = map({ sections: [{ tag: 'Intro', start: 0, end: 5 }, { tag: 'Verse', start: 6, end: 20 }] });
    expect(anchorFor(5, gap)).toEqual({ kind: 'section', tag: 'intro', edge: 'end' });
  });

  it('writes a beat, numbered from beatBase', () => {
    expect(anchorFor(1.5, map())).toEqual({ kind: 'beat', n: 2 });
    expect(anchorFor(1.5, map({ beatBase: 100 }))).toEqual({ kind: 'beat', n: 102 });
  });

  it('matches within a millisecond and not beyond', () => {
    expect(anchorFor(1.5004, map())).toEqual({ kind: 'beat', n: 2 });
    expect(anchorFor(1.502, map())).toBeUndefined();
  });

  it('writes nothing for zero, for a time past the song and for one on no anchor', () => {
    expect(anchorFor(0, map())).toBeUndefined();
    expect(anchorFor(41, map())).toBeUndefined();
    expect(anchorFor(7.77, map())).toBeUndefined();
  });

  it('is the inverse of resolveTime', () => {
    for (const t of [1.5, 10, 20, 30, 40, 3]) {
      const ref = anchorFor(t, map())!;
      expect(seconds(ref)).toBe(t);
    }
  });
});

describe('tagOf', () => {
  it('lowercases', () => expect(tagOf('Chorus')).toBe('chorus'));
});
