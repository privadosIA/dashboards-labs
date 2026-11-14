import type { ServerCatalog, ServerDesign, ServerDraft, ServerPiece, ServerLearning, ServerPreset, ServerReference, ServerSongMap } from './server-mapping';

/** Answers shaped like the server's, for the tests of the mapping and of the server adapter. */
export const serverDesign: ServerDesign = { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Space Grotesk', body: 'Inter', default_mode: 'dark', modes: { chorus: 'light' }, concept: 'Words on the beat.' };

export const serverSongMap: ServerSongMap = {
  version: 1,
  duration: 20,
  bpm: 96,
  beats: [0, 0.625, 1.25],
  beat_base: 4,
  grid_anchored: true,
  sections: [{ tag: 'verse', start: 0, end: 20 }],
  words: [{ text: 'hello', start: 0, end: 1, line: 0 }],
  words_estimated: true,
  loudness_hop: 0.25,
  loudness: [0.5, 0.6],
};

export const serverPiece = (extra: Partial<ServerPiece> = {}): ServerPiece => ({
  id: 'api-mm-1',
  state: 'draft',
  progress: 0,
  title: 'Quiet Town',
  source: { project: 'demo-musica', track_id: 'track-1', variant: 0 },
  style: 'typographic',
  level: 'simple',
  fps: 30,
  width: 1280,
  height: 720,
  client: 'video-anim',
  created_at: '2026-11-06T10:00:00Z',
  estimate: { seconds: 40, estimate: true, frames: 600, corrected: false, factor: 1 },
  size_bytes: 0,
  ...extra,
});

export const serverDetail = (extra: Partial<ServerPiece> = {}): ServerPiece =>
  serverPiece({
    design: { design: serverDesign, source: 'fallback', edited: false },
    script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'toggle', params: { label: 'allow' } }] },
    script_source: 'fallback',
    song_map: serverSongMap,
    ...extra,
  });

export const serverCatalog: ServerCatalog = {
  parts: [
    { name: 'toggle', description: 'A switch', levels: ['simple', 'medium', 'advanced'], cost_ms: 55, source: 'builtin', params: [{ name: 'label', type: 'string', default: 'allow', max_length: 20 }, { name: 'on', type: 'bool', default: 'true' }] },
    { name: 'counter', description: 'A counter', levels: ['simple', 'medium', 'advanced'], cost_ms: 55, source: 'user', params: [{ name: 'to', type: 'int', default: '100', min: 1, max: 999, animatable: true }, { name: 'speed', type: 'number', default: '1.5', min: 0.5, max: 4 }] },
    { name: 'cards', description: 'Cards', levels: ['medium', 'advanced'], cost_ms: 85, manual: true, source: 'builtin', params: [{ name: 'align', type: 'enum', default: 'left', options: ['left', 'center'] }] },
  ],
  characters: [{ name: 'bot', description: 'A robot', poses: ['idle', 'wave'], expressions: ['neutral', 'happy'], source: 'builtin' }],
  backgrounds: [{ name: 'stage', description: 'A floor', source: 'builtin' }],
  levels: ['simple', 'medium', 'advanced'],
  styles: ['typographic', 'illustrated'],
  frame_rates: [24, 30, 60],
  actions: ['enter', 'bounce'],
  fonts: ['Inter', 'Space Grotesk'],
  font_stacks: { Inter: '"Inter", sans-serif', 'Space Grotesk': '"Space Grotesk", sans-serif' },
  font_files: { Inter: { family: 'Inter', weights: [400, 700], licence: 'OFL-1.1' } },
  modes: ['dark', 'light'],
  features: ['animate', 'layers'],
};

export const serverReference = (extra: Partial<ServerReference> = {}): ServerReference => ({
  id: 'ref-1',
  title: 'A good video',
  notes: 'fast cuts',
  tags: ['pop'],
  source: 'https://www.youtube.com/watch?v=abc',
  state: 'ready',
  created_at: '2026-11-06T10:00:00Z',
  analysis: {
    duration: 90,
    fps: 30,
    width: 1280,
    height: 720,
    frames: ['01.jpg', '02 b.jpg'],
    colours: [{ hex: '#e63946', share: 0.4 }],
    thirds: [[{ hex: '#e63946', share: 0.4 }], [{ hex: '#264653', share: 0.5 }]],
    cuts: 24,
    mean_shot: 3.75,
    tempo: 112,
    key: 'A minor',
    description: 'Warm colours.',
  },
  ...extra,
});

export const serverLearning = (extra: Partial<ServerLearning> = {}): ServerLearning => ({
  id: 'learn-1',
  reference_id: 'ref-1',
  state: 'ready',
  strictness: 'normal',
  created_at: '2026-11-10T10:00:00Z',
  finished_at: '2026-11-10T10:01:00Z',
  styles: [{ id: 'preset-2', name: 'Neon terminal', novel: true, state: 'ready', similar_to: { kind: 'style', id: 'preset-1', name: 'Warm pop', distance: 0.62, reason: 'another palette' } }],
  part_drafts: [{ id: 'draft-1', name: 'scanlines', novel: true, state: 'writing' }, { id: 'draft-9', name: 'old idea', novel: true, state: 'gone' }],
  discarded: [{ kind: 'part', name: 'counter again', idea: 'a counter', novel: false, similar_to: { kind: 'part', name: 'counter', distance: 0.1, reason: 'the same drawing' }, reason: 'too similar to the part "counter"' }],
  skipped: [{ what: 'part scanlines', reason: 'the vision model is not installed' }],
  ...extra,
});

export const serverPreset = (extra: Partial<ServerPreset> = {}): ServerPreset => ({
  id: 'preset-1',
  name: 'Warm pop',
  reference_id: 'ref-1',
  created_at: '2026-11-06T10:05:00Z',
  design: serverDesign,
  rhythm: 6,
  parts: ['toggle'],
  adjustments: ['accent adjusted'],
  ...extra,
});

export const serverDraft = (extra: Partial<ServerDraft> = {}): ServerDraft => ({
  id: 'draft-1',
  state: 'ready',
  request: 'a clock that ticks',
  with_picture: true,
  source: 'reference:ref-1/03.jpg',
  description: 'A dark scene.',
  attempts: 2,
  name: 'ticking-clock',
  problems: [],
  created_at: '2026-11-06T10:00:00Z',
  preview: ['01.png', '02 b.png'],
  manifest: '{"name":"ticking-clock"}',
  fragment: '<div></div>',
  ...extra,
});
