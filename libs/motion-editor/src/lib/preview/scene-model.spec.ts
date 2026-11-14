import { designWith, hasWord, modeFor, resolveParams, scenesOf } from './scene-model';
import { CATALOG, DESIGN, FRAGMENTS, SCRIPT, SONG_MAP } from './test-data';

const scenes = () => scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script: SCRIPT, catalog: CATALOG, fragments: FRAGMENTS });

describe('scenesOf', () => {
  it('makes one scene per piece with its own time', () => {
    const s = scenes();
    expect(s.map((x) => [x.id, x.start, x.end, x.duration])).toEqual([['p1', 0, 4, 4], ['p2', 4, 12, 8], ['p3', 12, 20, 8]]);
    expect(s[0]).toMatchObject({ width: 1280, height: 720, songStart: 0, songLength: 20 });
  });

  it('resolves the parameters with the catalog defaults and types', () => {
    const s = scenes();
    expect(s[0].part.params).toEqual({ label: 'on <air>', on: true });
    expect(s[1].extras[0].params).toEqual({ to: 5 });
    expect(s[1].part.params).toEqual({ rings: 3 });
    expect(resolveParams(CATALOG.parts[1].params, { to: '7' })).toEqual({ to: 7 });
  });

  it('takes the mode of the piece, else of its section, else the default', () => {
    const s = scenes();
    expect(s.map((x) => x.mode)).toEqual(['dark', 'dark', 'light']);
    expect(modeFor(DESIGN, ' chorus ')).toBe('light');
    expect(modeFor(DESIGN, undefined)).toBe('dark');
  });

  it('puts the design of a piece over the song design', () => {
    expect(scenes()[2].design).toMatchObject({ accent: '#00ff00', display: 'Comic Sans', dark: '#101018' });
    expect(designWith(DESIGN, undefined)).toBe(DESIGN);
    expect(designWith(DESIGN, { verse_style: 'karaoke' }).verseStyle).toBe('karaoke');
  });

  it('resolves a line from the song map in the time of the piece, with the keyword index', () => {
    const [p1] = scenes();
    expect(p1.lines).toEqual([{ text: 'Hello, quiet town', start: 1, end: 2.6, words: [{ t: 'Hello,', s: 1, e: 1.4 }, { t: 'quiet', s: 1.5, e: 2 }, { t: 'town', s: 2, e: 2.6 }], keyword: 1 }]);
  });

  it('shifts the hit and the words by the start of the piece, never before 0', () => {
    const s = scenesOf({ piece: { width: 100, height: 100, songMap: SONG_MAP }, design: DESIGN, catalog: CATALOG, fragments: FRAGMENTS, script: { version: 1, pieces: [{ id: 'x', start: 1.2, end: 5, part: 'toggle', hit: { word: 'a', at: 1, length: 1 }, lines: [{ line: 0 }] }] } });
    expect(s[0].hit).toEqual({ word: 'a', at: 0, length: 1 });
    expect(s[0].lines[0].words[0]).toEqual({ t: 'Hello,', s: -0.2, e: 0.2 });
    expect(s[0].lines[0].start).toBe(0);
  });

  it('keeps a line of its own text with its own times', () => {
    const s = scenesOf({ piece: { width: 100, height: 100, songMap: SONG_MAP }, design: DESIGN, catalog: CATALOG, fragments: FRAGMENTS, script: { version: 1, pieces: [{ id: 'x', start: 2, end: 8, part: 'toggle', lines: [{ text: 'Free words', start: 3, end: 5, keyword: 'words' }] }] } });
    expect(s[0].lines[0]).toEqual({ text: 'Free words', start: 1, end: 3, words: [], keyword: 0 });
  });

  it('says what it cannot show: missing parts, the stage, unknown fonts, and that it was built here', () => {
    const [p1, p2, p3] = scenes();
    expect(p1.fidelity).toBe('approximate');
    expect(p1.gaps).toEqual([{ kind: 'browser' }, { kind: 'missing-part', name: 'toggle' }]);
    expect(p2.gaps).toEqual([{ kind: 'browser' }, { kind: 'missing-part', name: 'counter' }]);
    expect(p3.gaps).toEqual([{ kind: 'browser' }, { kind: 'stage' }, { kind: 'fonts' }]);
    expect(p3.actors).toHaveLength(1);
    expect(p3.actors[0]).toMatchObject({ id: 'a1', label: 'bot', x: 30, y: 80, size: 40, action: 'bounce' });
  });

  it('leaves hidden parts out of the page and of the gaps', () => {
    const s = scenesOf({ piece: { width: 100, height: 100, songMap: SONG_MAP }, design: DESIGN, script: SCRIPT, catalog: CATALOG, fragments: FRAGMENTS, hidden: new Set(['toggle']) });
    expect(s[0].part.fragment).toBe('');
    expect(s[0].gaps).toEqual([{ kind: 'browser' }]);
  });
});

describe('hasWord', () => {
  it('ignores case and the marks around the word', () => {
    expect(hasWord('Hello, quiet town', '  Quiet! ')).toBe(true);
    expect(hasWord('Hello, quiet town', 'loud')).toBe(false);
    expect(hasWord('Hello', '...')).toBe(false);
  });
});
