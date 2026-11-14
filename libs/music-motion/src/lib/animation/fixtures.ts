import type { DatasetSong } from './dataset';
import { CATALOG } from '@lab/animation-core/testing';
import { type AssistedPlan, type Catalog, type Design, type FontFile, type Part, type Level, type PartParam, type Script, type Song, type SongMap, defaultParams } from '@lab/animation-core';

/** The data the in-memory adapter works with: a few songs, a small catalog and the fixed rules that make a piece. */

const LYRICS = '[Verse]\nWalking through the quiet town\nLights are coming down\n\n[Chorus]\nHold on to the morning\nNever let it go';

export interface FixtureSong extends Song {
  readonly lyrics: string;
  readonly bpm: number;
}

const song = (variant: number, title: string, extra: Partial<FixtureSong> = {}): FixtureSong => ({
  key: `demo-musica/track-1/${variant + 7}`,
  project: 'demo-musica',
  trackId: 'track-1',
  variant,
  title,
  seconds: 48,
  instrumental: false,
  lyrics: LYRICS,
  bpm: 96,
  ...extra,
});

/** A song of a dataset as the adapter keeps the songs it can make a piece from. */
export const fixtureSong = (s: DatasetSong): FixtureSong => ({
  key: `${s.project}/${s.trackId}/${s.variant}`,
  project: s.project,
  trackId: s.trackId,
  variant: s.variant,
  title: s.title,
  seconds: s.seconds,
  instrumental: s.instrumental,
  lyrics: s.lyrics,
  bpm: s.bpm,
});

export const SONGS: readonly FixtureSong[] = [
  song(0, 'Quiet Town'),
  song(1, 'Quiet Town (instrumental)', { instrumental: true, lyrics: '', seconds: 52 }),
  { ...song(0, 'Morning Light', { seconds: 36, bpm: 120 }), key: 'morning-light/track-1/7', project: 'morning-light' },
];

export { BUILT_IN_PART_NAMES, CATALOG } from '@lab/animation-core/testing';

/** The parameters of the built-in parts that this in-memory server lets a script animate (a text and a switch hold their value between keyframes). */
const ANIMATABLE: Readonly<Record<string, readonly string[]>> = { counter: ['to', 'speed'], toggle: ['label', 'on'] };

/** The catalog of the in-memory server: the shared one with `features` and the animatable parameters, as a server that supports keyframes says them. */
/** The fonts the memory server says it embeds: the ones of the free pack that its list has. */
const FONT_FILES: Readonly<Record<string, FontFile>> = Object.fromEntries(
  ['Inter', 'Space Grotesk', 'Playfair Display', 'JetBrains Mono', 'Bebas Neue'].map((family) => [family, { family, weights: [400, 700], licence: 'OFL-1.1' }]),
);

/** The two parts that come with the `theme` feature: a HUD drawn from the theme's four corner labels and a film grain. Both are for layers. */
const THEME_PARTS: readonly Part[] = [
  { name: 'hud-chrome', description: 'Four corner labels from the theme, drawn over every scene.', levels: ['simple', 'medium', 'advanced'], costMs: 4, manual: true, source: 'builtin', params: [] },
  { name: 'grain', description: 'A fine film grain over the whole frame.', levels: ['simple', 'medium', 'advanced'], costMs: 6, manual: true, source: 'builtin', params: [{ name: 'amount', type: 'number', default: '0.08', min: 0, max: 1, description: 'How strong the grain is.' }] },
];

export const memoryCatalog = (features: readonly string[] = ['animate', 'layers', 'svg']): Catalog => {
  const parts = features.includes('animate')
    ? CATALOG.parts.map((p) => (ANIMATABLE[p.name] ? { ...p, params: p.params.map((q) => (ANIMATABLE[p.name].includes(q.name) ? { ...q, animatable: true } : q)) } : p))
    : CATALOG.parts;
  const theme = features.includes('theme');
  return { ...CATALOG, features: [...features], parts: theme ? [...parts, ...THEME_PARTS.filter((t) => !parts.some((p) => p.name === t.name))] : parts, ...(theme ? { fontFiles: FONT_FILES } : {}) };
};

/** The parameters a part's manifest declares, as the catalog lists them (what a part of the user's is approved with). */
export function paramsOfManifest(manifest: unknown): PartParam[] {
  const list = (manifest as { params?: unknown } | null | undefined)?.params;
  if (!Array.isArray(list)) return [];
  return list
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object' && typeof (q as { name?: unknown }).name === 'string')
    .map((q) => ({
      name: String(q['name']),
      type: (['string', 'int', 'number', 'bool', 'enum'].includes(String(q['type'])) ? q['type'] : 'string') as PartParam['type'],
      default: String(q['default'] ?? ''),
      ...(typeof q['description'] === 'string' ? { description: q['description'] } : {}),
      ...(typeof q['min'] === 'number' ? { min: q['min'] } : {}),
      ...(typeof q['max'] === 'number' ? { max: q['max'] } : {}),
      ...(typeof q['max_length'] === 'number' ? { maxLength: q['max_length'] } : {}),
      ...(Array.isArray(q['options']) ? { options: q['options'].map(String) } : {}),
      ...(q['animatable'] === true ? { animatable: true } : {}),
    }));
}

export const PALETTES: readonly Design[] = [
  { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Space Grotesk', body: 'Inter', defaultMode: 'dark', modes: {}, concept: 'Words that land on the beat, one idea per scene.' },
  { dark: '#0b1d2a', light: '#eef6f9', accent: '#f2b705', display: 'Playfair Display', body: 'Inter', defaultMode: 'light', modes: {}, concept: 'A calm night that turns into morning.' },
];

export function songMapOf(s: FixtureSong): SongMap {
  const beat = 60 / s.bpm;
  const blocks = (s.instrumental ? '' : s.lyrics).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const [head, ...lines] = b.split('\n');
    return { tag: head.replace(/[[\]]/g, '').toLowerCase(), lines };
  });
  const sections: SongMap['sections'][number][] = [];
  const words: SongMap['words'][number][] = [];
  const per = blocks.length ? s.seconds / blocks.length : s.seconds;
  let line = 0;
  if (!blocks.length) sections.push({ tag: 'instrumental', start: 0, end: s.seconds });
  blocks.forEach((b, i) => {
    const start = Math.round(i * per * 100) / 100;
    const end = i === blocks.length - 1 ? s.seconds : Math.round((i + 1) * per * 100) / 100;
    sections.push({ tag: b.tag, start, end });
    const each = (end - start) / b.lines.length;
    b.lines.forEach((text, l) => {
      const ws = text.split(/\s+/).filter(Boolean);
      ws.forEach((w, k) => words.push({ text: w, start: Math.round((start + l * each + (k * each) / ws.length) * 100) / 100, end: Math.round((start + l * each + ((k + 1) * each) / ws.length) * 100) / 100, line }));
      line++;
    });
  });
  const hop = 0.25;
  return {
    duration: s.seconds,
    bpm: s.bpm,
    beats: Array.from({ length: Math.floor(s.seconds / beat) }, (_, i) => Math.round(i * beat * 1000) / 1000),
    beatBase: 0,
    gridAnchored: true,
    sections,
    words,
    wordsEstimated: !s.instrumental,
    loudnessHop: hop,
    loudness: Array.from({ length: Math.floor(s.seconds / hop) }, (_, i) => Math.round((0.5 + 0.4 * Math.sin(i / 6)) * 100) / 100),
  };
}

/** The fixed rule: one piece per section, the parts that the level supports taken in turn. */
export function scriptOf(map: SongMap, level: Level, design: Design, parts: readonly string[] = []): Script {
  const all = CATALOG.parts.filter((p) => !p.manual && p.levels.includes(level));
  // A preset's parts, when it has some the level supports; none (or none usable) means all the usual ones.
  const chosen = all.filter((p) => parts.includes(p.name));
  const usable = chosen.length ? chosen : all;
  return {
    version: 1,
    pieces: map.sections.map((s, i) => {
      const part = usable[i % usable.length];
      const lines = lineTexts(map, s.start, s.end);
      return { id: `p${i + 1}`, start: s.start, end: s.end, section: s.tag, part: part.name, params: defaultParams(part), mode: design.modes[s.tag] ?? design.defaultMode, ...(lines.length ? { lines } : {}) };
    }),
  };
}

/**
 * A script that uses the sample's own parts, so the preview of the sample piece draws real fragments: the first piece's main part is the first
 * own part, and the last piece carries the other two as extras. Pieces of one only get the first. The rest of the script is left as it was.
 */
export function withOwnParts(script: Script, own: readonly string[]): Script {
  if (own.length === 0 || script.pieces.length === 0) return script;
  const last = script.pieces.length - 1;
  return {
    ...script,
    pieces: script.pieces.map((p, i) => {
      if (i === 0) {
        const { params: _params, ...rest } = p;
        return { ...rest, part: own[0] };
      }
      return i === last && own.length > 1 ? { ...p, with: own.slice(1, 3).map((part) => ({ part })) } : p;
    }),
  };
}

function lineTexts(map: SongMap, from: number, to: number) {
  const byLine = new Map<number, SongMap['words']>();
  for (const w of map.words) if (w.start >= from - 1e-6 && w.start < to - 1e-6) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]);
  return [...byLine].map(([line, ws]) => ({ line, text: ws.map((w) => w.text).join(' '), start: ws[0].start, end: ws[ws.length - 1].end, keyword: ws.reduce((a, b) => (b.text.length > a.text.length ? b : a)).text.replace(/[^\p{L}\p{N}'-]/gu, '') }));
}


/** A key frame the in-memory adapter can show with no server: a plain picture of a colour, as an address that needs no ticket. */
export const frameOf = (hex: string, n: number): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="${hex}"/><text x="8" y="82" font-size="12" fill="#fff">${n}</text></svg>`)}`;

/** The names of the parts the catalog starts with: a dataset cannot bring one of them again. */

/** The drawing the in-memory assistant writes for a description: by a word it holds (`circle`, `bars`, `logo`), else a square. Every shape has an id, as the server asks. */
export function svgOf(text: string): string {
  const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">';
  if (/circle|círculo|circulo|ring/i.test(text)) return `${open}<circle id="ring" cx="960" cy="540" r="260" fill="none" stroke="#7fd1a8" stroke-width="24"/><circle id="dot" cx="960" cy="540" r="60" fill="#7fd1a8"/></svg>`;
  if (/bars|barras/i.test(text)) {
    const bars = [0, 1, 2, 3, 4].map((i) => `<rect id="bar-${i + 1}" x="${560 + i * 160}" y="${700 - (i % 3) * 120}" width="100" height="${240 + (i % 3) * 120}" fill="#7fd1a8"/>`);
    return `${open}<g id="bars">${bars.join('')}</g></svg>`;
  }
  if (/logo/i.test(text)) return `${open}<g id="logo"><path id="mark" d="M760 700 L960 340 L1160 700 Z" fill="#7fd1a8"/><rect id="base" x="760" y="740" width="400" height="36" fill="#e6f3ec"/></g></svg>`;
  return `${open}<rect id="square" x="710" y="290" width="500" height="500" fill="#7fd1a8"/></svg>`;
}

/**
 * The plan the in-memory adapter makes of a sentence: deterministic, read from words in it (a length in seconds, `illustrated`, `advanced`/`medium`, `light`, `NN fps`,
 * `instrumental`, and the parts after `with`), with choices the catalog offers. It exists so the screens and the end-to-end tests run with no server, not to be clever.
 */
export function plannedFrom(text: string, catalog: Catalog): AssistedPlan {
  const words = text.trim().split(/\s+/);
  const title = words.slice(0, 6).join(' ').slice(0, 60);
  const instrumental = /instrumental/i.test(text);
  const seconds = Number(/(\d+)\s*(?:seconds?|secs?|segundos)/i.exec(text)?.[1] ?? 0);
  const style = /illustrat|ilustrad/i.test(text) && catalog.styles.includes('illustrated') ? 'illustrated' : (catalog.styles.find((s) => s === 'typographic') ?? catalog.styles[0] ?? '');
  const level = /advanced|avanzad/i.test(text) ? 'advanced' : /medium|medio/i.test(text) ? 'medium' : 'simple';
  const named = Number(/(\d+)\s*fps/i.exec(text)?.[1] ?? 0);
  const fps = catalog.frameRates.includes(named) ? named : style === 'illustrated' ? 24 : 30;
  const mode = /\blight\b|claro/i.test(text) ? 'light' : 'dark';
  const afterWith = /\b(?:with|con)\b(.+)$/i.exec(text)?.[1] ?? '';
  const names = afterWith
    .split(/,| and | y /i)
    .map((n) =>
      n
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((n) => /^[a-z][a-z0-9-]{0,39}$/.test(n))
    .slice(0, 6);
  const have = new Set(catalog.parts.map((p) => p.name));
  return {
    song: { title, caption: `a piece for: ${title}`, lyrics: instrumental ? '' : `[Verse]\n${text.trim()}`, tags: 'calm, piano', instrumental, seconds },
    animation: { style, level, fps, mode, concept: `${title}, as a ${mode} piece`, prompt: text.trim() },
    parts: names.map((name) => (have.has(name) ? { name, exists: true } : { name, exists: false, request: `a part that draws ${name.replace(/-/g, ' ')}` })),
    warnings: seconds === 0 ? ['the sentence names no length for the song'] : [],
  };
}
