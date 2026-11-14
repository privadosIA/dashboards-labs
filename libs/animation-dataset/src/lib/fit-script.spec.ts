import { type Script, type SongMap } from '@lab/animation-core';
import { fitScript } from './fit-script';

const map = (duration: number, sections: [string, number, number][]): SongMap => ({
  duration,
  bpm: 100,
  beats: [],
  beatBase: 0,
  gridAnchored: true,
  sections: sections.map(([tag, start, end]) => ({ tag, start, end })),
  words: [],
  wordsEstimated: true,
  loudnessHop: 0.1,
  loudness: [],
});

const script: Script = {
  version: 1,
  pieces: [
    { id: 'a', start: 0, end: 12, section: 'intro', part: 'toggle', mode: 'dark', params: { label: 'hi' }, lines: [{ line: 1, text: 'old words' }], hit: { word: 'old', at: 2, length: 1 } },
    { id: 'b', start: 12, end: 36, section: 'chorus', part: 'counter', mode: 'light', with: [{ part: 'wire-sphere' }] },
    { id: 'c', start: 36, end: 48, section: 'outro', part: 'toggle', stage: { background: 'stage' } },
  ],
};
const design = { modes: { intro: 'light', verse: 'dark', chorus: 'dark', outro: 'light' } as const };

const gaps = (s: Script) => s.pieces.every((p, i) => p.end > p.start && (i === 0 ? p.start === 0 : p.start === s.pieces[i - 1].end));

describe('fitScript', () => {
  it('keeps the order and the proportions on a longer song and covers it with no gaps', () => {
    const fitted = fitScript(script, 48, map(96, [['Intro', 0, 24], ['Chorus', 24, 72], ['Outro', 72, 96]]), design);
    expect(fitted.pieces.map((p) => [p.id, p.start, p.end])).toEqual([['a', 0, 24], ['b', 24, 72], ['c', 72, 96]]);
    expect(gaps(fitted)).toBe(true);
  });

  it('shrinks the pieces on a shorter song and ends exactly where the song does', () => {
    const fitted = fitScript(script, 48, map(36.123, [['intro', 0, 9], ['chorus', 9, 27], ['outro', 27, 36.123]]), design);
    expect(fitted.pieces.at(-1)!.end).toBe(36.123);
    expect(fitted.pieces[1].start).toBe(9.031);
    expect(gaps(fitted)).toBe(true);
  });

  it('changes nothing of the times on a song of the same length', () => {
    const fitted = fitScript(script, 48, map(48, [['intro', 0, 12], ['chorus', 12, 36], ['outro', 36, 48]]), design);
    expect(fitted.pieces.map((p) => [p.start, p.end])).toEqual([[0, 12], [12, 36], [36, 48]]);
  });

  it('covers a song a little longer than the script by stretching the last piece', () => {
    const fitted = fitScript({ version: 1, pieces: [{ id: 'a', start: 0, end: 10, part: 'toggle' }, { id: 'b', start: 10, end: 20, part: 'toggle' }] }, 21, map(20, [['verse', 0, 20]]), design);
    expect(fitted.pieces.at(-1)!.end).toBe(20);
    expect(gaps(fitted)).toBe(true);
  });

  it('takes the section and the mode again from the new song and the design, in lowercase', () => {
    const fitted = fitScript(script, 48, map(96, [['Intro', 0, 10], ['Verse', 10, 60], ['Outro', 60, 96]]), design);
    expect(fitted.pieces.map((p) => [p.section, p.mode])).toEqual([['intro', 'light'], ['verse', 'dark'], ['outro', 'light']]);
  });

  it('leaves out the mode when the design has none for the section, and the section when the song has none', () => {
    const fitted = fitScript(script, 48, map(48, [['bridge', 0, 48]]), design);
    expect(fitted.pieces.every((p) => p.section === 'bridge' && p.mode === undefined)).toBe(true);
    const bare = fitScript(script, 48, map(48, []), design);
    expect(bare.pieces.every((p) => p.section === undefined && p.mode === undefined)).toBe(true);
  });

  it('drops the lines and the hit of the old song and keeps what the person chose', () => {
    const fitted = fitScript(script, 48, map(96, [['intro', 0, 96]]), design);
    expect(fitted.pieces[0].lines).toBeUndefined();
    expect(fitted.pieces[0].hit).toBeUndefined();
    expect(fitted.pieces[0]).toMatchObject({ part: 'toggle', params: { label: 'hi' } });
    expect(fitted.pieces[1].with).toEqual([{ part: 'wire-sphere' }]);
    expect(fitted.pieces[2].stage).toEqual({ background: 'stage' });
  });

  it('does not change the script it was given', () => {
    const before = structuredClone(script);
    fitScript(script, 48, map(96, [['intro', 0, 96]]), design);
    expect(script).toEqual(before);
  });

  it('drops a piece that collapses and gives its time to the next', () => {
    const tiny: Script = { version: 1, pieces: [{ id: 'a', start: 0, end: 0.001, part: 'x' }, { id: 'b', start: 0.001, end: 100, part: 'x' }] };
    const fitted = fitScript(tiny, 100, map(10, [['verse', 0, 10]]), design);
    expect(fitted.pieces.map((p) => p.id)).toEqual(['b']);
    expect(fitted.pieces[0]).toMatchObject({ start: 0, end: 10 });
  });

  it('uses the end of the last piece when the old length is not known', () => {
    const fitted = fitScript(script, 0, map(96, [['verse', 0, 96]]), design);
    expect(fitted.pieces.map((p) => p.end)).toEqual([24, 72, 96]);
  });
});
