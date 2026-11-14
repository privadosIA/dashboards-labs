import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Catalog, Design, Script, SongMap } from '@lab/animation-core';
import { CATALOG } from '@lab/animation-core/testing';

import { quote, toCode } from './to-code';
import { mapCode } from './to-script';

/** The shared test catalog plus the part of the user's that one golden dataset draws. */
const catalog: Catalog = {
  ...CATALOG,
  features: ['animate', 'layers'],
  parts: [...CATALOG.parts.map((p) => (p.name === 'counter' ? { ...p, params: p.params.map((q) => ({ ...q, animatable: true })) } : p)), { name: 'my-badge', description: 'A badge of the user', levels: ['simple', 'medium', 'advanced'], costMs: 30, manual: false, source: 'user', params: [] }],
};

const design: Design = { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'grotesk', body: 'grotesk', defaultMode: 'dark', modes: {}, concept: '' };

/** 48 seconds with a beat every half second and four sections: what the goldens' songs have in length, with structure to anchor to. */
const songMap = (extra: Partial<SongMap> = {}): SongMap => ({
  duration: 48,
  bpm: 120,
  beats: Array.from({ length: 96 }, (_, i) => (i + 1) / 2),
  beatBase: 0,
  gridAnchored: true,
  sections: [
    { tag: 'Verse', start: 0, end: 12 },
    { tag: 'Chorus', start: 12, end: 24 },
    { tag: 'Verse', start: 24, end: 36 },
    { tag: 'Chorus', start: 36, end: 48 },
  ],
  words: [
    { text: 'Walking', start: 1, end: 1.5, line: 0 },
    { text: 'town', start: 3.5, end: 4, line: 0 },
    { text: 'neon', start: 14, end: 14.5, line: 3 },
  ],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [],
  ...extra,
});

/** Generates the code, maps it back and says what came out. */
function roundTrip(script: Script, map = songMap()): { code: string; back: Script | undefined; errors: string[] } {
  const code = toCode(script, { songMap: map });
  const r = mapCode(code, { catalog, songMap: map, design, level: 'simple' });
  return { code, back: r.script, errors: r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line}:${d.column} ${d.message}`) };
}

describe('toCode: layers', () => {
  const script: Script = {
    version: 1,
    pieces: [{ id: 'p1', start: 0, end: 24, part: 'toggle' }, { id: 'p2', start: 24, end: 48, part: 'parallax-cards' }],
    layers: [
      { id: 'strip', items: [{ part: 'wire-sphere', params: { detail: 8 }, start: 6, end: 24 }, { part: 'counter', start: 30, end: 48, animate: { to: [{ t: 0, value: 1, ease: 'in' }, { t: 6, value: 3 }] } }] },
      { id: 'empty', items: [] },
    ],
  };

  it('writes the layers as the second argument, one item per line, with anchors where the times land on the song', () => {
    const code = toCode(script, { songMap: songMap() });
    expect(code.split('\n')[0]).toBe("import { script, piece, layer, item, parts, beat, section, kf, song } from '@motion/script';");
    expect(code).toContain("], [\n  layer('strip', [\n    item(parts.wireSphere({ detail: 8 }), beat(11), section('verse', 2).start),");
    expect(code).toContain("    item(parts.counter(undefined, { to: [kf(0, 1, 'in'), kf(section('chorus', 2).start, 3)] }), beat(59), song.end),");
    expect(code).toContain("  layer('empty', []),\n]);");
  });

  it('writes nothing of layers for a script without them: the code is what it always was', () => {
    const code = toCode({ ...script, layers: undefined }, { songMap: songMap() });
    expect(code).not.toContain('layer');
    expect(code.trimEnd().endsWith(']);')).toBe(true);
  });

  it('maps back to the same script', () => {
    const r = roundTrip(script);
    expect(r.errors).toEqual([]);
    expect(r.back).toEqual(script);
  });
});

describe('toCode: the canonical form', () => {
  it('writes one piece per piece with the keys in a fixed order, two-space indentation, single quotes and trailing commas', () => {
    const script: Script = {
      version: 1,
      pieces: [
        { id: 'p1', start: 0, end: 12, part: 'toggle', params: { label: "it's", on: true }, mode: 'dark', lines: [{ line: 3, keyword: 'neon' }], section: 'verse' },
        { id: 'p2', start: 12, end: 48, part: 'counter', params: { to: 10 }, with: [{ part: 'toggle' }], hit: { word: 'neon', at: 14.25, length: 1 } },
      ],
    };
    expect(toCode(script, { songMap: songMap() })).toBe(`import { script, piece, parts, section, line, song } from '@motion/script';

export default script([
  piece({
    id: 'p1',
    from: 0,
    to: section('chorus').start,
    part: parts.toggle({ label: 'it\\'s', on: true }),
    mode: 'dark',
    section: 'verse',
    lines: [line(3, { keyword: 'neon' })],
  }),
  piece({
    id: 'p2',
    to: song.end,
    part: parts.counter({ to: 10 }),
    with: [parts.toggle()],
    hit: { word: 'neon', at: 14.25, length: 1 },
  }),
]);
`);
  });

  it('lists in the import only the names it uses', () => {
    const only = toCode({ version: 1, pieces: [{ id: 'a', start: 0, end: 7.3, part: 'blank' }] }, { songMap: songMap() });
    expect(only.split('\n')[0]).toBe("import { script, piece, parts } from '@motion/script';");
    expect(toCode({ version: 1, pieces: [] }, { songMap: songMap() })).toBe("import { script } from '@motion/script';\n\nexport default script([]);\n");
  });

  it('writes an anchor where a time falls on one and the seconds where it does not', () => {
    const code = toCode({ version: 1, pieces: [{ id: 'a', start: 0, end: 24, part: 'blank' }, { id: 'b', start: 24, end: 31.3, part: 'blank' }, { id: 'c', start: 31.3, end: 36.5, part: 'blank' }] }, { songMap: songMap() });
    expect(code).toContain("to: section('verse', 2).start,");
    expect(code).toContain('to: 31.3,');
    expect(code).toContain('to: beat(72),');
  });

  it('writes from on the first piece and wherever a piece does not start where the one before ended', () => {
    const code = toCode({ version: 1, pieces: [{ id: 'a', start: 0, end: 10, part: 'blank' }, { id: 'b', start: 10, end: 20, part: 'blank' }, { id: 'c', start: 25.3, end: 48, part: 'blank' }] }, { songMap: songMap() });
    expect(code.match(/ from: /g)?.length).toBe(2);
    expect(code).toContain('from: 25.3,');
  });

  it('turns the keys of a piece design to camel case and folds unknown fields into extra', () => {
    const piece = { id: 'a', start: 0, end: 48, part: 'blank', design: { accent: '#ff00aa', verse_style: 'karaoke' }, x_editor: { colour: 'red' }, 'odd-key': 1 } as unknown as Script['pieces'][number];
    const code = toCode({ version: 1, pieces: [piece] }, { songMap: songMap() });
    expect(code).toContain("design: { accent: '#ff00aa', verseStyle: 'karaoke' },");
    expect(code).toContain("extra: { x_editor: { colour: 'red' }, 'odd-key': 1 },");
  });

  it('escapes what a text can hold', () => {
    expect(quote("a'b\\c\nd\u0001")).toBe("'a\\'b\\\\c\\nd\\u0001'");
  });
});

describe('toCode: keyframes', () => {
  const kf = (t: number, value: string | number | boolean, ease?: 'linear' | 'in' | 'out' | 'in-out' | 'step') => ({ t, value, ...(ease ? { ease } : {}) });

  it('writes them as the second argument of the part, with the times in the piece\'s own seconds and anchors where they fall on the song', () => {
    const script: Script = {
      version: 1,
      pieces: [
        // starts at 12 (the start of the chorus); 6 s in is 18 s, beat 35 of the half-second grid, and 12 s in is 24 s, the start of the outro
        { id: 'p1', start: 12, end: 24, part: 'counter', params: { to: 50 }, animate: { to: [kf(0, 1, 'in'), kf(6, 500), kf(12, 100, 'out')] } },
        { id: 'p2', start: 24, end: 48, part: 'toggle', with: [{ part: 'counter', animate: { speed: [kf(1.25, 2)] } }] },
      ],
    };
    const code = toCode(script, { songMap: songMap({ sections: [{ tag: 'Verse', start: 0, end: 12 }, { tag: 'Chorus', start: 12, end: 24 }, { tag: 'Outro', start: 24, end: 48 }] }) });
    expect(code).toContain("part: parts.counter({ to: 50 }, { to: [kf(0, 1, 'in'), kf(beat(35), 500), kf(section('outro').start, 100, 'out')] }),");
    expect(code).toContain('with: [parts.counter(undefined, { speed: [kf(1.25, 2)] })],');
    expect(code.split('\n')[0]).toBe("import { script, piece, parts, beat, section, kf, song } from '@motion/script';");
  });

  it('writes an anchor for a keyframe that lands on one, relative to the piece, and 0 plain', () => {
    const script: Script = { version: 1, pieces: [{ id: 'p1', start: 3.2, end: 11.7, part: 'counter', animate: { to: [kf(0, 1), kf(0.3, 2), kf(8.5, 9)] } }] };
    const code = toCode(script, { songMap: songMap() });
    // 3.2 + 0.3 = 3.5 is beat(6)... the piece's own seconds are what the code says unless it is an anchor: 11.7 is not one, 3.5 is beat 6 (half-second beats)
    expect(code).toContain('kf(0, 1), kf(beat(6), 2), kf(8.5, 9)');
  });
});

describe('toCode: mapping it back gives the same script', () => {
  const full: Script = {
    version: 1,
    pieces: [
      { id: 'p1', start: 0, end: 12, part: 'blank', mode: 'dark', lines: [{ line: 0, text: 'Walking', start: 1, end: 3.5, keyword: 'Walking' }, { line: 3 }], stage: { background: 'stage', characters: [{ character: 'bot', pose: 'wave', x: 30, y: 70, size: 50 }] } },
      { id: 'p2', start: 12, end: 24, part: 'counter', params: { to: 100, speed: 1.5 }, with: [{ part: 'toggle', params: { label: 'x' } }, { part: 'parallax-cards' }], hit: { word: 'neon', at: 14.25, length: 0.6 } },
      { id: 'p3', start: 24, end: 31.3, part: 'toggle', params: {}, section: 'verse', design: { accent: '#ff00aa', verse_style: 'karaoke', hit_style: 'glow' } },
      { id: 'p4', start: 40, end: 48, part: 'wire-sphere', x_editor: { colour: 'red', n: [1, 2, { a: true }] } } as unknown as Script['pieces'][number],
    ],
  };

  it('for a script that uses everything the format has', () => {
    const r = roundTrip(full);
    expect(r.errors).toEqual([]);
    expect(r.back).toEqual(full);
  });

  it('with the beats numbered from another base', () => {
    const map = songMap({ beatBase: 100 });
    const r = roundTrip(full, map);
    expect(r.errors).toEqual([]);
    expect(r.back).toEqual(full);
    expect(r.code).toContain('beat(');
  });

  it('for an empty script', () => {
    expect(roundTrip({ version: 1, pieces: [] }).back).toEqual({ version: 1, pieces: [] });
  });

// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
  const dir = join(process.cwd(), 'libs/animation-dataset/src/testing/golden');
  // The scenes file names parts (its scenes, the HUD) that this spec's catalog does not have: its script is tried where the catalog is the server's.
  const names = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'scenes.json');

  it('has the golden datasets to try', () => {
    expect(names.length).toBeGreaterThanOrEqual(3);
  });

  it.each(names)('for the script of the golden dataset %s', (file) => {
    const script = (JSON.parse(readFileSync(join(dir, file), 'utf8')) as { animation: { script: Script } }).animation.script;
    const r = roundTrip(script);
    expect(r.errors).toEqual([]);
    expect(r.back).toEqual(script);
  });
});
