import type { Catalog, Script, SongMap } from '@lab/animation-core';
import { CATALOG } from '@lab/animation-core/testing';
import ts from 'typescript';

import { declarationsFor } from './declarations';
import { toCode } from './to-code';

const songMap: SongMap = {
  duration: 48,
  bpm: 120,
  beats: Array.from({ length: 96 }, (_, i) => (i + 1) / 2),
  beatBase: 0,
  gridAnchored: true,
  sections: [
    { tag: 'Verse', start: 0, end: 12 },
    { tag: 'Chorus', start: 12, end: 24 },
    { tag: 'Verse', start: 24, end: 48 },
  ],
  words: [
    { text: 'Walking', start: 1, end: 1.5, line: 0 },
    { text: 'neon', start: 14, end: 14.5, line: 3 },
  ],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [],
};

const dts = declarationsFor(CATALOG, songMap);

/** TypeScript's own errors for `program`, with the declarations as the module the code imports from. */
function check(program: string, declarations = dts): string[] {
  const files = new Map<string, string>([
    ['/node_modules/@motion/script/index.d.ts', declarations],
    ['/script.ts', program],
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
    lib: ['lib.es2022.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  const dirs = new Set(['/', '/node_modules', '/node_modules/@motion', '/node_modules/@motion/script']);
  const { directoryExists } = host;
  host.directoryExists = (d) => dirs.has(d) || (directoryExists?.call(host, d) ?? false);
  host.fileExists = (f) => files.has(f) || fileExists.call(host, f);
  host.readFile = (f) => files.get(f) ?? readFile.call(host, f);
  host.getSourceFile = (f, lang, onError, shouldCreate) => (files.has(f) ? ts.createSourceFile(f, files.get(f)!, lang) : getSourceFile.call(host, f, lang, onError, shouldCreate));
  const program2 = ts.createProgram(['/script.ts'], options, host);
  return ts.getPreEmitDiagnostics(program2).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

const wrap = (body: string): string => `import { script, piece, parts, beat, section, line, song } from '@motion/script';\nexport default script([ ${body} ]);`;

describe('declarationsFor', () => {
  it('has one function per part, camel cased, with its description as the comment completion shows', () => {
    expect(dts).toContain('parallaxCards(params?: {');
    expect(dts).toContain('wireSphere(params?: {');
    expect(dts).toContain('blank(): PartCall;');
    expect(dts).toContain(' * A switch that flips on the beat');
    expect(dts).toContain('Cost: 55 ms. Levels: simple, medium, advanced.');
    expect(dts).toContain('Only drawn when a piece names it.');
  });

  it('types every parameter as optional, by its type, with the options of an enum as a union', () => {
    expect(dts).toContain('label?: string;');
    expect(dts).toContain('on?: boolean;');
    expect(dts).toContain('to?: number;');
    expect(dts).toContain("align?: 'left' | 'center' | 'right';");
  });

  it('writes the limits and the default as the comment of a parameter', () => {
    expect(dts).toContain('Limits: 1..999.');
    expect(dts).toContain('Limits: up to 20 characters.');
    expect(dts).toContain('Default: 100.');
  });

  it('takes the section tags and the line numbers from the song', () => {
    expect(dts).toContain("export type SectionTag = 'verse' | 'chorus';");
    expect(dts).toContain('export type LineNumber = 0 | 3;');
  });

  it('takes the stage names from the catalog, each character with its own poses', () => {
    expect(dts).toContain("background?: 'stage';");
    expect(dts).toContain("character: 'bot';");
    expect(dts).toContain("pose?: 'idle' | 'wave';");
    expect(dts).toContain("expression?: 'neutral' | 'happy';");
  });

  it('falls back to text where the catalog has none, and to never where the song has none', () => {
    const bare = declarationsFor({ ...CATALOG, characters: [], backgrounds: [], actions: [] } as Catalog, { ...songMap, sections: [], words: [] });
    expect(bare).toContain('background?: string;');
    expect(bare).toContain('character: string;');
    expect(bare).toContain('export type SectionTag = never;');
    expect(bare).toContain('export type LineNumber = never;');
  });

  it('does not let a description close its own comment', () => {
    const odd = declarationsFor({ ...CATALOG, parts: [{ ...CATALOG.parts[0], description: 'ends */ here' }] } as Catalog, songMap);
    expect(odd).toContain('ends *\\/ here');
    expect(check(wrap(''), odd)).toEqual([]);
  });
});

describe('the declarations as TypeScript sees them', () => {
  it('accept a program that uses everything', () => {
    const script: Script = {
      version: 1,
      pieces: [
        { id: 'p1', start: 0, end: 12, part: 'blank', mode: 'dark', lines: [{ line: 0, keyword: 'Walking' }, { text: 'free', start: 1, end: 3.5 } as never], stage: { background: 'stage', characters: [{ character: 'bot', pose: 'wave', expression: 'happy', action: 'enter', x: 30, y: 70, size: 50 }] } },
        { id: 'p2', start: 12, end: 24, part: 'counter', params: { to: 100, speed: 1.5 }, with: [{ part: 'toggle', params: { label: 'x', on: true } }, { part: 'parallax-cards', params: { align: 'center' } }], hit: { word: 'neon', at: 14.25, length: 0.6 } },
        { id: 'p3', start: 24, end: 48, part: 'wire-sphere', design: { accent: '#ff00aa', verse_style: 'karaoke', hit_style: 'fade' }, x_editor: { a: [1, { b: true }] } } as never,
      ],
    };
    expect(check(toCode(script, { songMap }))).toEqual([]);
  });

  it('mark an option that is not in the list', () => {
    const errors = check(wrap("piece({ id: 'a', from: 0, to: song.end, part: parts.parallaxCards({ align: 'spiral' }) })"));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('"spiral"');
    expect(errors[0]).toContain('"left" | "center" | "right"');
  });

  it('mark an unknown part and an unknown parameter', () => {
    expect(check(wrap("piece({ id: 'a', from: 0, to: song.end, part: parts.spiral() })")).join('\n')).toContain("'spiral'");
    expect(check(wrap("piece({ id: 'a', from: 0, to: song.end, part: parts.toggle({ colour: 'red' }) })")).join('\n')).toContain('colour');
  });

  it('mark a value of the wrong primitive type', () => {
    expect(check(wrap("piece({ id: 'a', from: 0, to: song.end, part: parts.toggle({ on: 'yes' }) })")).join('\n')).toContain("Type 'string' is not assignable to type 'boolean");
    expect(check(wrap("piece({ id: 'a', from: 0, to: song.end, part: parts.counter({ to: '5' }) })")).join('\n')).toContain("Type 'string' is not assignable to type 'number");
  });

  it('mark a section tag or a line that the song does not have', () => {
    expect(check(wrap("piece({ id: 'a', from: 0, to: section('bridge').start, part: parts.blank() })")).join('\n')).toContain('"bridge"');
    expect(check(wrap("piece({ id: 'a', from: 0, to: song.end, part: parts.blank(), lines: [line(7)] })")).join('\n')).toContain('7');
  });

  it('mark a piece that lacks its id, its end or its part, and a time that is a text', () => {
    expect(check(wrap('piece({ from: 0 })')).join('\n')).toMatch(/id.*to.*part|missing/);
    expect(check(wrap("piece({ id: 'a', from: 0, to: 'soon', part: parts.blank() })")).join('\n')).toContain("'string'");
  });
});

describe('the declarations of keyframes', () => {
  const animating: Catalog = {
    ...CATALOG,
    features: ['animate'],
    parts: CATALOG.parts.map((p) => (p.name === 'counter' ? { ...p, params: p.params.map((q) => ({ ...q, animatable: true })) } : p.name === 'parallax-cards' ? { ...p, params: p.params.map((q) => (q.name === 'align' ? { ...q, animatable: true } : q)) } : p)),
  } as Catalog;
  const withKf = declarationsFor(animating, songMap);
  const program = (body: string): string => `import { script, piece, parts, kf, beat, song } from '@motion/script';\nexport default script([ piece({ id: 'a', from: 0, to: song.end, part: ${body} }) ]);`;

  it('declare kf, the eases and, for a part that has animatable parameters, a second argument with only those', () => {
    expect(withKf).toContain('export declare function kf<V extends string | number | boolean>(t: TimeExpr, value: V, ease?: Ease): Keyframe<V>;');
    expect(withKf).toContain("export type Ease = 'linear' | 'in' | 'out' | 'in-out' | 'step';");
    expect(withKf).toContain('counter(params?: {');
    expect(withKf).toMatch(/animate\?: \{\n    to\?: Keyframe<number>\[\];\n    speed\?: Keyframe<number>\[\];\n  \}\): PartCall;/);
    expect(withKf).toContain("align?: Keyframe<'left' | 'center' | 'right'>[];");
    // a part with no animatable parameter takes no second argument
    expect(withKf).toMatch(/wireSphere\(params\?: \{[^}]*\}\): PartCall;/);
  });

  it('are the same as before for a server that does not take keyframes', () => {
    const plain = declarationsFor({ ...animating, features: [] } as Catalog, songMap);
    expect(plain).not.toContain('kf<V');
    expect(plain).not.toContain('Keyframe<');
    expect(plain).toBe(declarationsFor(CATALOG, songMap));
  });

  it('accept a program with keyframes of the right type, anchors and eases', () => {
    expect(check(program("parts.counter({ to: 5 }, { to: [kf(0, 1), kf(beat(8), 100, 'out')], speed: [kf(1.5, 2, 'step')] })"), withKf)).toEqual([]);
    expect(check(program("parts.counter(undefined, { to: [kf(0, 1)] })"), withKf)).toEqual([]);
    expect(check(program("parts.parallaxCards({}, { align: [kf(0, 'left'), kf(2, 'right', 'in-out')] })"), withKf)).toEqual([]);
  });

  it('mark a value of the wrong type, an option that is not there, a parameter that cannot be animated and an ease that is not one', () => {
    expect(check(program("parts.counter({}, { to: [kf(0, 'x')] })"), withKf).join('\n')).toContain('"x"');
    expect(check(program("parts.parallaxCards({}, { align: [kf(0, 'sideways')] })"), withKf).join('\n')).toContain('"sideways"');
    expect(check(program("parts.counter({}, { nope: [kf(0, 1)] })"), withKf).join('\n')).toContain('nope');
    expect(check(program("parts.wireSphere({}, { detail: [kf(0, 1)] })"), withKf).join('\n')).toContain('Expected 0-1 arguments');
    expect(check(program("parts.counter({}, { to: [kf(0, 1, 'bounce')] })"), withKf).join('\n')).toContain('"bounce"');
  });
});

describe('the declarations of layers', () => {
  const withLayers = declarationsFor({ ...CATALOG, features: ['layers'] } as Catalog, songMap);
  const program = (layers: string): string => `import { script, piece, layer, item, parts, section, song } from '@motion/script';\nexport default script([ piece({ id: 'a', from: 0, to: song.end, part: parts.blank() }) ], [${layers}]);`;

  it('add layer and item, and a second argument to script, only for a server that takes layers', () => {
    expect(withLayers).toContain('export declare function layer(id: string, items: LayerItem[]): Layer;');
    expect(withLayers).toContain('export declare function item(part: PartCall, from: TimeExpr, to: TimeExpr): LayerItem;');
    expect(withLayers).toContain('export declare function script(pieces: PieceItem[], layers?: Layer[]): unknown;');
    const plain = declarationsFor(CATALOG, songMap);
    expect(plain).not.toContain('layer(');
    expect(plain).toContain('export declare function script(pieces: PieceItem[]): unknown;');
  });

  it('accept a program with layers of items with times of every kind', () => {
    expect(check(program("layer('top', [item(parts.counter({ to: 5 }), 2, section('chorus').start), item(parts.wireSphere(), song.end, 47)])"), withLayers)).toEqual([]);
  });

  it('mark an item without its times, a layer without its items, and a layer where there is none', () => {
    expect(check(program("layer('top', [item(parts.counter())])"), withLayers).join('\n')).toContain('Expected 3 arguments');
    expect(check(program("layer('top')"), withLayers).join('\n')).toContain('Expected 2 arguments');
    expect(check(program("layer('top', [])"), declarationsFor(CATALOG, songMap)).join('\n')).toContain('layer');
  });
});
