import type { Catalog, Design, Part, PartText, Script, SongMap } from '@lab/animation-core';

/** Data the specs of this folder share: a small piece, its song map, its catalog. Not exported by the library. */
export const DESIGN: Design = { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'heavy', body: 'grotesk', defaultMode: 'dark', modes: { chorus: 'light' }, concept: '' };

export const SONG_MAP: SongMap = {
  duration: 20,
  bpm: 120,
  beats: [0.5, 1, 1.5, 2, 2.5, 3],
  beatBase: 0,
  gridAnchored: true,
  sections: [{ tag: 'Verse', start: 0, end: 10 }, { tag: 'Chorus', start: 10, end: 20 }],
  words: [
    { text: 'Hello,', start: 1, end: 1.4, line: 0 },
    { text: 'quiet', start: 1.5, end: 2, line: 0 },
    { text: 'town', start: 2, end: 2.6, line: 0 },
  ],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [0.2, 0.4, 0.6, 0.8],
};

const part = (name: string, params: Part['params'], extra: Partial<Part> = {}): Part => ({ name, description: `The ${name} part`, levels: ['simple', 'medium', 'advanced'], costMs: 50, manual: false, params, ...extra });

export const CATALOG: Catalog = {
  parts: [
    part('toggle', [{ name: 'label', type: 'string', default: 'allow', maxLength: 20 }, { name: 'on', type: 'bool', default: 'true' }], { source: 'builtin' }),
    part('counter', [{ name: 'to', type: 'int', default: '100', min: 1, max: 999 }], { source: 'builtin' }),
    part('pulse-ring', [{ name: 'rings', type: 'int', default: '3' }], { source: 'user' }),
  ],
  characters: [],
  backgrounds: [],
  levels: ['simple', 'medium', 'advanced'],
  styles: ['typographic', 'illustrated'],
  frameRates: [24, 30, 60],
  actions: [],
  fonts: [],
  modes: ['dark', 'light'],
  features: [],
};

export const FRAGMENTS = new Map<string, PartText | null>([
  ['pulse-ring', { name: 'pulse-ring', manifest: '{"name":"pulse-ring"}', fragment: '<div id="pr">{{rings}} rings</div><script>window.__partSeek=function(t,b){window.__last=[t,b.number];};</script>' }],
  ['toggle', null],
  ['counter', null],
]);

export const SCRIPT: Script = {
  version: 1,
  pieces: [
    { id: 'p1', start: 0, end: 4, section: 'Verse', part: 'toggle', params: { label: 'on <air>' }, lines: [{ line: 0, keyword: 'quiet' }], hit: { word: 'Hello', at: 1, length: 1 } },
    { id: 'p2', start: 4, end: 12, section: 'Verse', part: 'pulse-ring', with: [{ part: 'counter', params: { to: 5 } }] },
    { id: 'p3', start: 12, end: 20, section: 'Chorus', part: 'pulse-ring', design: { accent: '#00ff00', display: 'Comic Sans' }, stage: { background: 'stage', characters: [{ character: 'bot', x: 30, y: 80, size: 40, action: 'bounce' }] } },
  ],
};
