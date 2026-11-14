import type { Catalog, Design, Part, SongMap } from '@lab/animation-core';

import { diagnosticText } from './diagnostics';
import { mapCode, type MapResult } from './to-script';

const design: Design = { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'grotesk', body: 'grotesk', defaultMode: 'dark', modes: {}, concept: '' };
const part = (name: string, params: Part['params'] = []): Part => ({ name, description: `The ${name} part`, levels: ['simple', 'medium', 'advanced'], costMs: 10, manual: false, params });
const catalog = {
  parts: [
    part('toggle', [
      { name: 'count', type: 'int', default: '3', min: 1, max: 5, animatable: true },
      { name: 'label', type: 'string', default: 'x', maxLength: 6 },
      { name: 'on', type: 'bool', default: 'true', animatable: true },
      { name: 'ratio', type: 'number', default: '0.5', min: 0, max: 1 },
      { name: 'mode', type: 'enum', default: 'up', options: ['up', 'down'], animatable: true },
    ]),
    part('glass-card', [{ name: 'title', type: 'string', default: '' }]),
    part('timeline-strip', [{ name: 'marks', type: 'string', default: '' }]),
    part('stamp'),
  ],
  characters: [],
  backgrounds: [],
  levels: ['simple', 'medium', 'advanced'],
  styles: ['typographic', 'illustrated'],
  frameRates: [24],
  actions: [],
  fonts: [],
  modes: ['dark', 'light'],
  features: ['animate'],
} as Catalog;

const songMap = (extra: Partial<SongMap> = {}): SongMap => ({
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
  words: [
    { text: 'neon', start: 1, end: 1.5, line: 3 },
    { text: 'pulse', start: 1.5, end: 2, line: 3 },
  ],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [],
  ...extra,
});

const run = (code: string, map = songMap()): MapResult => mapCode(code, { catalog, songMap: map, design, level: 'simple' });
/** One piece that covers the song, with `rest` of its keys added. */
const one = (rest: string, head = "id: 'a', from: 0, to: song.end, part: parts.stamp()"): string => `export default script([ piece({ ${head}${rest ? `, ${rest}` : ''} }) ]);`;
const errors = (r: MapResult): string[] => r.diagnostics.filter((d) => d.severity === 'error').map((d) => (d.code === 'not-representable' ? `nr:${d.args['what']}` : d.code));

describe('mapCode: the shape of a piece', () => {
  it('maps a piece with its times, part and parameters', () => {
    const r = run(one('', "id: 'a', from: 0, to: 12.5, part: parts.toggle({ count: 3, on: true })"));
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.script).toEqual({ version: 1, pieces: [{ id: 'a', start: 0, end: 12.5, part: 'toggle', params: { count: 3, on: true } }] });
  });

  it('restores the catalog name of a part from its camel-cased name', () => {
    const r = run(one("with: [parts.timelineStrip({ marks: '1|2' })]", "id: 'a', from: 0, to: song.end, part: parts.glassCard({ title: 'Neon' })"));
    expect(r.script!.pieces[0]).toMatchObject({ part: 'glass-card', params: { title: 'Neon' }, with: [{ part: 'timeline-strip', params: { marks: '1|2' } }] });
  });

  it('does not fill in the parameters that were left out', () => {
    expect(run(one('')).script!.pieces[0]).toEqual({ id: 'a', start: 0, end: 40, part: 'stamp' });
    expect(run(one('', "id: 'a', from: 0, to: 5, part: parts.toggle({})")).script!.pieces[0].params).toEqual({});
  });

  it('starts each piece where the one before ended unless it says from', () => {
    const r = run(`export default script([
      piece({ id: 'a', from: 0, to: 10, part: parts.stamp() }),
      piece({ id: 'b', to: 20, part: parts.stamp() }),
      piece({ id: 'c', from: 25, to: 40, part: parts.stamp() }),
    ]);`);
    expect(r.script!.pieces.map((p) => [p.start, p.end])).toEqual([[0, 10], [10, 20], [25, 40]]);
  });

  it('maps mode, section, lines, hit, stage and design with its camel keys turned to the server names', () => {
    const r = run(
      one(
        `mode: 'light', section: 'outro', lines: [line(3, { keyword: 'neon' }), line(3), { text: 'free', from: 1, to: beat(3), keyword: 'free' }],
         hit: { word: 'pulse', at: beat(2, 0.5), length: 1 },
         stage: { background: 'night-sky', characters: [{ character: 'bot', x: 30, y: 78, size: 42 }] },
         design: { accent: '#ff00aa', verseStyle: 'karaoke', hitStyle: 'glow' }`,
      ),
    );
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.script!.pieces[0]).toEqual({
      id: 'a',
      start: 0,
      end: 40,
      part: 'stamp',
      mode: 'light',
      section: 'outro',
      lines: [{ line: 3, keyword: 'neon' }, { line: 3 }, { text: 'free', start: 1, end: 2, keyword: 'free' }],
      hit: { word: 'pulse', at: 1.75, length: 1 },
      stage: { background: 'night-sky', characters: [{ character: 'bot', x: 30, y: 78, size: 42 }] },
      design: { accent: '#ff00aa', verse_style: 'karaoke', hit_style: 'glow' },
    });
  });

  it('unfolds extra to the piece level', () => {
    const r = run(one("extra: { x_editor: { colour: 'red' }, note: 'n' }"));
    expect(r.script!.pieces[0]).toMatchObject({ x_editor: { colour: 'red' }, note: 'n' });
    expect(Object.keys(r.script!.pieces[0])).not.toContain('extra');
  });

  it('inlines constants wherever they are used', () => {
    const r = run(`const chorus = section('chorus');\nconst at = beat(2);\nconst params = { count: 2 };
      export default script([ piece({ id: 'a', from: 0, to: chorus.start, part: parts.toggle(params) }), piece({ id: 'b', to: at, part: parts.stamp() }) ]);`);
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual(['bad-end']);
    const ok = run(`const chorus = section('chorus', 2);\nconst params = { count: 2 };
      export default script([ piece({ id: 'a', from: 0, to: chorus.start, part: parts.toggle(params) }) ]);`);
    expect(ok.script!.pieces[0]).toMatchObject({ end: 30, params: { count: 2 } });
  });
});

describe('mapCode: time expressions', () => {
  it('numbers beats from the song map', () => {
    const r = run(one('', "id: 'a', from: 0, to: beat(2, 0.5), part: parts.stamp()"));
    expect(r.script!.pieces[0].end).toBe(1.75);
  });

  it('takes a section by tag and by which one of that tag', () => {
    const r = run(`export default script([ piece({ id: 'a', from: section('verse', 2).start, to: section('chorus', 2).end, part: parts.stamp() }) ]);`);
    expect(r.script!.pieces[0]).toMatchObject({ start: 20, end: 40 });
  });
});

describe('mapCode: what it reports, and where', () => {
  it('says a value must be at most its limit, at the value', () => {
    const code = one('', "id: 'a', from: 0, to: 5, part: parts.toggle({ count: 9 })");
    const r = run(code);
    expect(r.script).toBeUndefined();
    const d = r.diagnostics.find((x) => x.code === 'param-max')!;
    expect(d.message).toBe('"count" must be at most 5.');
    expect(code.split('\n')[d.line - 1].slice(d.column - 1, d.endColumn - 1)).toBe('9');
  });

  it.each([
    ['count: 0', 'param-min'],
    ['count: 2.5', 'param-whole'],
    ['count: "3"', 'param-type'],
    ["label: 'toolong!'", 'param-length'],
    ['label: 4', 'param-type'],
    ["on: 'yes'", 'param-type'],
    ['ratio: 2', 'param-max'],
    ["mode: 'spiral'", 'param-option'],
    ['mode: 3', 'param-option'],
    ['nope: 1', 'unknown-param'],
  ])('reports the parameter %s as %s', (arg, code) => {
    expect(errors(run(one('', `id: 'a', from: 0, to: 5, part: parts.toggle({ ${arg} })`)))).toEqual([code]);
  });

  it('reports an unknown part at its name', () => {
    const code = one('', "id: 'a', from: 0, to: 5, part: parts.spiral({ n: 1 })");
    const r = run(code);
    const d = r.diagnostics.find((x) => x.code === 'unknown-part')!;
    expect(d.args['name']).toBe('spiral');
    expect(d.endColumn - d.column).toBe('parts.spiral'.length);
  });

  it('reports a beat out of range', () => {
    expect(errors(run(one('', "id: 'a', from: 0, to: beat(60), part: parts.stamp()")))).toEqual(['beat-range']);
    expect(errors(run(one('', "id: 'a', from: 0, to: beat(1, 1), part: parts.stamp()")))).toEqual(['beat-fraction']);
  });

  it('reports a section or a line that does not exist', () => {
    expect(errors(run(one('', "id: 'a', from: 0, to: section('bridge').end, part: parts.stamp()")))).toEqual(['no-section']);
    expect(errors(run(one('', "id: 'a', from: 0, to: section('chorus', 3).end, part: parts.stamp()")))).toEqual(['no-section']);
    expect(errors(run(one('lines: [line(9)]')))).toEqual(['no-line']);
  });

  it('reports a first piece without from and a to that is not after its start', () => {
    expect(errors(run(one('', "id: 'a', to: 5, part: parts.stamp()")))).toEqual(['no-from']);
    const d = run(one('', "id: 'a', from: 5, to: 5, part: parts.stamp()")).diagnostics.find((x) => x.code === 'bad-end')!;
    expect(d.args).toEqual({ start: 5, end: 5 });
  });

  it('reports a key of extra that is a known key', () => {
    expect(errors(run(one('extra: { part: 1, to: 2 }')))).toEqual(['extra-collision', 'extra-collision']);
  });

  it('reports a missing id, to and part, an unknown key and a repeated id', () => {
    expect(errors(run('export default script([ piece({ from: 0 }) ]);'))).toEqual(['piece-needs', 'piece-needs', 'piece-needs']);
    expect(errors(run(one('colour: 1')))).toEqual(['unknown-key']);
    const twice = run(`export default script([ piece({ id: 'a', from: 0, to: 5, part: parts.stamp() }), piece({ id: 'a', to: 9, part: parts.stamp() }) ]);`);
    expect(errors(twice)).toEqual(['duplicate-id']);
  });

  it('reports what is not a piece, a time that is not one, and a bad mode', () => {
    expect(errors(run('export default script([ parts.stamp() ]);'))).toEqual(['not-a-piece']);
    expect(errors(run(one('', "id: 'a', from: 0, to: 'soon', part: parts.stamp()")))).toEqual(['time-expected']);
    expect(errors(run(one('', "id: 'a', from: 0, to: parts.x(), part: parts.stamp()")))).toEqual(['time-expected']);
    expect(errors(run(one("mode: 'blue'")))).toEqual(['bad-value']);
  });

  it('reports constants that are unknown, repeated or defined later', () => {
    expect(errors(run(one('', "id: 'a', from: 0, to: later.start, part: parts.stamp()")))).toEqual(['unknown-const']);
    expect(errors(run(`const a = 1;\nconst a = 2;\n` + one('')))).toEqual(['duplicate-const']);
    expect(errors(run(`export default script([ piece({ id: 'a', from: 0, to: t, part: parts.stamp() }) ]);\nconst t = beat(2);`))).toEqual(['const-later']);
  });

  it('carries the parser diagnostics and does not change the script when there is any', () => {
    const r = run(one('', "id: 'a', from: 0, to: 1 + 2, part: parts.stamp()"));
    expect(r.script).toBeUndefined();
    expect(errors(r)).toContain('nr:arithmetic');
  });

  it('keeps going after a piece with a mistake to show the next one', () => {
    const r = run(`export default script([
      piece({ id: 'a', from: 0, to: 5, part: parts.toggle({ count: 9 }) }),
      piece({ id: 'b', to: 9, part: parts.toggle({ count: 0 }) }),
    ]);`);
    expect(r.diagnostics.map((d) => [d.code, d.line])).toEqual([['param-max', 2], ['param-min', 3]]);
  });

  it('gives the messages in Spanish too', () => {
    const d = run(one('', "id: 'a', from: 0, to: 5, part: parts.toggle({ count: 9 })")).diagnostics[0];
    expect(diagnosticText(d, 'es')).toBe('«count» debe ser como mucho 5.');
    const nr = run(one('', "id: 'a', from: 0, to: 1 + 2, part: parts.stamp()")).diagnostics.find((x) => x.code === 'not-representable')!;
    expect(diagnosticText(nr, 'es')).toBe('no representable: aritmética');
  });
});

describe('mapCode: keyframes', () => {
  /** One piece 10 s long, from 10 s into the song, with `animate` as the second argument of its part. */
  const keyed = (animate: string, params = '{ count: 2 }'): string => one('', `id: 'a', from: 10, to: 20, part: parts.toggle(${params}, ${animate})`);
  const frames = (r: MapResult) => r.script!.pieces[0].animate;

  it('maps them with times in the piece\'s own seconds, the ease where it is written and the value checked against the parameter', () => {
    const r = run(keyed("{ count: [kf(0, 1), kf(2.5, 3, 'out'), kf(10, 5, 'step')], on: [kf(0, true)], mode: [kf(1, 'up'), kf(4, 'down')] }"));
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(frames(r)).toEqual({
      count: [{ t: 0, value: 1 }, { t: 2.5, value: 3, ease: 'out' }, { t: 10, value: 5, ease: 'step' }],
      on: [{ t: 0, value: true }],
      mode: [{ t: 1, value: 'up' }, { t: 4, value: 'down' }],
    });
    expect(r.script!.pieces[0].params).toEqual({ count: 2 });
  });

  it('resolves an anchor to the song\'s time and takes where the piece starts away', () => {
    // the piece starts at 10 s: beat 29 is at 15 s (beats[i] = (i + 1) / 2) and the first chorus ends at 20 s, the end of the piece
    const long = songMap({ beats: Array.from({ length: 100 }, (_, i) => (i + 1) / 2) });
    const r = run(keyed("{ count: [kf(0, 1), kf(beat(29), 2), kf(section('chorus').end, 5)] }"), long);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(frames(r)!['count'].map((k) => k.t)).toEqual([0, 5, 10]);
  });

  it('takes `undefined` for the parameters when only the keyframes are given, and leaves params out', () => {
    const r = run(one('', "id: 'a', from: 0, to: 10, part: parts.toggle(undefined, { count: [kf(0, 1)] })"));
    expect(r.script!.pieces[0]).toEqual({ id: 'a', start: 0, end: 10, part: 'toggle', animate: { count: [{ t: 0, value: 1 }] } });
    // and the rest of the piece, up to the end of the song, is the other piece's: one covering it
    expect('params' in r.script!.pieces[0]).toBe(false);
  });

  it('maps the keyframes of an extra part, relative to its piece', () => {
    const r = run(one("with: [parts.glassCard(undefined, { title: [kf(1, 'x')] })]"));
    expect(r.diagnostics.map((d) => d.code)).toContain('not-animatable');
    const ok = run(one('with: [parts.toggle({}, { count: [kf(1, 1), kf(3, 4, \'in\')] })]'));
    expect(ok.script!.pieces[0].with).toEqual([{ part: 'toggle', params: {}, animate: { count: [{ t: 1, value: 1 }, { t: 3, value: 4, ease: 'in' }] } }]);
  });

  it.each([
    ['a parameter that cannot be animated', "{ label: [kf(0, 'x')] }", 'not-animatable'],
    ['a parameter the part does not have', "{ nope: [kf(0, 1)] }", 'unknown-param'],
    ['no keyframe', '{ count: [] }', 'kf-empty'],
    ['a keyframe before the piece', '{ count: [kf(-1, 1)] }', 'kf-outside'],
    ['a keyframe after the piece', '{ count: [kf(11, 1)] }', 'kf-outside'],
    ['times that do not increase', '{ count: [kf(2, 1), kf(2, 3)] }', 'kf-order'],
    ['a value outside the limits', '{ count: [kf(0, 9)] }', 'param-max'],
    ['a fraction for a whole number', '{ count: [kf(0, 1.5)] }', 'param-whole'],
    ['a value of another type', "{ on: [kf(0, 'yes')] }", 'param-type'],
    ['an option that is not there', "{ mode: [kf(0, 'spiral')] }", 'param-option'],
    ['an ease that is not one', "{ count: [kf(0, 1, 'bounce')] }", 'bad-value'],
    ['a list that is not a list', '{ count: 5 }', 'bad-value'],
    ['something that is not kf', '{ count: [5] }', 'bad-call'],
    ['a kf with a missing value', '{ count: [kf(0)] }', 'bad-call'],
    ['a beat that does not exist', '{ count: [kf(beat(9999), 1)] }', 'beat-range'],
  ])('reports %s', (_name, animate, code) => {
    expect(errors(run(keyed(animate)))).toEqual([code]);
  });

  it('puts the diagnostic of a keyframe where the keyframe is', () => {
    const source = keyed('{ count: [kf(0, 1), kf(11, 1)] }');
    const d = run(source).diagnostics.find((x) => x.code === 'kf-outside')!;
    expect(source.slice(d.column - 1, d.endColumn - 1)).toBe('11');
    expect(d.args).toEqual({ t: 11, length: 10 });
  });

  it('refuses a second argument too many, and keyframes where the server does not take them', () => {
    expect(errors(run(one('', "id: 'a', from: 0, to: 10, part: parts.toggle({}, {}, {})")))).toEqual(['bad-call']);
    const old = mapCode(keyed('{ count: [kf(0, 1)] }'), { catalog: { ...catalog, features: [] }, songMap: songMap(), design, level: 'simple' });
    expect(old.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual(['no-animate']);
  });

  it('says it in Spanish too', () => {
    const d = run(keyed("{ label: [kf(0, 'x')] }")).diagnostics.find((x) => x.code === 'not-animatable')!;
    expect(diagnosticText(d, 'es')).toBe('El parámetro «label» de «toggle» no se puede animar.');
  });

  it('a constant can hold the list of keyframes', () => {
    const r = run(`const up = [kf(0, 1), kf(4, 5)];\n` + keyed('{ count: up }'));
    expect(frames(r)!['count']).toEqual([{ t: 0, value: 1 }, { t: 4, value: 5 }]);
  });
});

describe('mapCode: the editor checks as warnings', () => {
  it('warns of a gap and does not stop the script', () => {
    const r = run(one('', "id: 'a', from: 0, to: 20, part: parts.stamp()"));
    expect(r.script).toBeDefined();
    const w = r.diagnostics.find((d) => d.code === 'check')!;
    expect(w.severity).toBe('warning');
    expect(w.warning?.kind).toBe('coverage');
    expect(diagnosticText(w, 'es')).toMatch(/no cubre/);
  });

  it('puts a warning of a piece at its id and one of an extra at that extra', () => {
    const code = `export default script([ piece({ id: 'a', from: 0, to: 40, part: parts.stamp(), with: [parts.stamp()] }) ]);`;
    const r = run(code);
    const w = r.diagnostics.find((d) => d.warning?.kind === 'extras-repeat')!;
    expect(code.slice(w.column - 1, w.endColumn - 1)).toBe('parts.stamp()');
  });
});

describe('mapCode: where the pieces are', () => {
  it('lists each piece with its range, its id and its extras', () => {
    const code = `export default script([\n  piece({ id: 'a', from: 0, to: 20, part: parts.stamp(), with: [parts.toggle(), parts.glassCard()] }),\n  piece({ id: 'b', to: 40, part: parts.stamp() }),\n]);`;
    const r = run(code);
    expect(r.sites.map((s) => s.id)).toEqual(['a', 'b']);
    expect(r.sites[0].range.start.line).toBe(2);
    expect(r.sites[0].extras.length).toBe(2);
    expect(code.slice(r.sites[1].idRange.start.offset, r.sites[1].idRange.end.offset)).toBe("'b'");
  });

  it('lists them even when the script has errors', () => {
    expect(run(one('colour: 1')).sites.length).toBe(1);
  });
});

describe('mapCode: layers', () => {
  const withLayers = { ...catalog, features: ['animate', 'layers'] } as Catalog;
  const runL = (layers: string, features: Catalog = withLayers, map = songMap()): MapResult => mapCode(`export default script([ piece({ id: 'a', from: 0, to: song.end, part: parts.stamp() }) ], [${layers}]);`, { catalog: features, songMap: map, design, level: 'simple' });
  const errs = (r: MapResult): string[] => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

  it('maps a layer of items: the part with its parameters, from and to in song seconds', () => {
    const r = runL("layer('top', [item(parts.toggle({ count: 2 }), 5, 8), item(parts.glassCard({ title: 'x' }), section('chorus').start, song.end)])");
    expect(errs(r)).toEqual([]);
    expect(r.script!.layers).toEqual([{ id: 'top', items: [{ part: 'toggle', params: { count: 2 }, start: 5, end: 8 }, { part: 'glass-card', params: { title: 'x' }, start: 10, end: 40 }] }]);
    expect(r.script!.pieces).toHaveLength(1);
  });

  it('reads the keyframes of an item in seconds from the item\'s start, an anchor being the song\'s time less where the item starts', () => {
    const r = runL("layer('top', [item(parts.toggle({}, { count: [kf(0, 1, 'in'), kf(2, 3), kf(section('chorus').start, 5)] }), 5, 20)])");
    expect(errs(r)).toEqual([]);
    expect(r.script!.layers![0].items[0].animate).toEqual({ count: [{ t: 0, value: 1, ease: 'in' }, { t: 2, value: 3 }, { t: 5, value: 5 }] });
  });

  it('puts the diagnostic of a keyframe outside the item where the keyframe is, saying item', () => {
    const r = runL('layer(\'top\', [item(parts.toggle({}, { count: [kf(0, 1), kf(9, 3)] }), 5, 12)])');
    const d = r.diagnostics.find((x) => x.code === 'kf-outside')!;
    expect(d.message).toBe('This keyframe is at 9 s, outside the item (0 s to 7 s).');
    expect(diagnosticText(d, 'es')).toBe('Este fotograma clave está en 9 s, fuera de el elemento (de 0 s a 7 s).');
  });

  it('refuses layers when the server does not say it takes them', () => {
    const r = runL("layer('top', [item(parts.toggle(), 5, 12)])", catalog);
    expect(r.script).toBeUndefined();
    expect(errs(r)).toEqual(['This server does not take layers.']);
  });

  it('says what the server would refuse, in its words, on the item it is about', () => {
    const code = "layer('a', [item(parts.toggle(), 5, 12),\n  item(parts.glassCard(), 10, 20)])";
    const r = runL(code);
    expect(r.script).toBeUndefined();
    const d = r.diagnostics.find((x) => x.code === 'layer-problem')!;
    expect(d.message).toBe('layer "a" item #2 overlaps item #1 (items of a layer follow one another, in order)');
    expect(d.line).toBe(2);
    expect(diagnosticText(d, 'es')).toBe(d.message);
  });

  it('refuses a part the page already draws, naming the piece, and an item outside the song', () => {
    expect(errs(runL("layer('a', [item(parts.stamp(), 5, 12)])"))).toEqual(['piece "a" (#1): the part "stamp" is drawn twice (the main part and layer "a" item #1)']);
    expect(errs(runL("layer('a', [item(parts.toggle(), 30, 50)])"))).toEqual(['layer "a" item #1 (30.00 s to 50.00 s) is outside the song (0 s to 40.00 s)']);
    expect(errs(runL("layer('Bad Id', [item(parts.toggle(), 1, 2)])"))).toEqual(['layer "Bad Id": the id must be lower case letters, digits and dashes, up to 24 characters']);
  });

  it('reports what is wrong with the shape: not a layer, wrong calls, a part that does not exist', () => {
    expect(errors(runL('piece({})'))).toContain('not-a-layer');
    expect(errors(runL("layer('a')"))).toContain('bad-call');
    expect(errors(runL("layer('a', [item(parts.toggle(), 5)])"))).toContain('bad-call');
    expect(errors(runL("layer('a', [item(parts.nothing(), 5, 9)])"))).toContain('unknown-part');
    expect(errors(runL("layer('a', [parts.toggle()])"))).toContain('bad-value');
  });

  it('keeps an empty layer, and has no layers at all for an empty list', () => {
    expect(runL("layer('a', [])").script!.layers).toEqual([{ id: 'a', items: [] }]);
    expect(runL('').script!.layers).toBeUndefined();
  });

  it('says where each layer and item was written', () => {
    const r = runL("layer('a', [item(parts.toggle(), 5, 9), item(parts.glassCard(), 10, 20)]), layer('b', [])");
    expect(r.layerSites!.map((s) => [s.id, s.items.length])).toEqual([['a', 2], ['b', 0]]);
    expect(r.layerSites![0].items[1].start.offset).toBeGreaterThan(r.layerSites![0].items[0].end.offset);
  });
});
