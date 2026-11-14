// The music motion operations of the server, simulated: `GET /api/music-motion/catalog` and the pieces (create, list,
// read, delete, design, script, propose, render). A piece is complete when it is created (song map, design from a fixed
// palette, script from a fixed rule), like the server's. What a design or a script must satisfy is a simplification of
// the server's checks (hex colours, the 3:1 contrast, the parts and their limits, the covering of the song, the words
// of a line); the shapes and the statuses are the contract's. A render is derived from the clock, like a generation:
// one step queued, eight running, then done with a placeholder video. The run it names has no events: the mock's
// generations work the same, and a dashboard follows the piece itself.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fx from './fixtures.mjs';
import { parseMultipart } from './generation.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** The animation dataset, shared with the in-memory adapter of the screens: `libs/music-motion/sample/sample.json`. */
export const SAMPLE = JSON.parse(readFileSync(resolve(here, '../libs/music-motion/sample/sample.json'), 'utf8'));
/** The video of the dataset: every finished piece of the dataset plays this file instead of the placeholder. */
export const SAMPLE_VIDEO_FILE = resolve(here, '../libs/music-motion/sample', SAMPLE.video.file);
const SAMPLE_VIDEO_PATHS = new Set(SAMPLE.pieces.filter((p) => p.state === 'done').map((p) => `/api/projects/${p.id}/artifacts/out/${p.id}.mp4`));
export const isSampleVideo = (pathname) => SAMPLE_VIDEO_PATHS.has(pathname);


/** A drawing the mock gives to a character pose: a labelled shape, enough to show where the editor places it. */
const poseSvg = (name, pose, expression) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300"><rect x="40" y="60" width="120" height="200" rx="40" fill="#8899aa"/><circle cx="100" cy="50" r="36" fill="#aabbcc"/><text x="100" y="160" font-size="18" text-anchor="middle" fill="#101018">${name}</text><text x="100" y="185" font-size="14" text-anchor="middle" fill="#101018">${pose} / ${expression}</text></svg>`;

/** A character of the library as the server reads it, with the drawing of each pose. */
export const libraryCharacter = (name) => {
  const c = CHARACTERS.find((x) => x.name === name);
  if (!c) return null;
  return { name: c.name, width: 200, height: 300, anchor: { x: 100, y: 300 }, default_pose: c.poses[0], default_expression: c.expressions[0], expressions: c.expressions, poses: Object.fromEntries(c.poses.map((p) => [p, poseSvg(c.name, p, c.expressions[0])])), source: c.source };
};

/** A background of the library as the server reads it, with its drawing. */
export const libraryBackground = (name) => {
  const b = BACKGROUNDS.find((x) => x.name === name);
  if (!b) return null;
  return { name: b.name, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720"><rect width="1280" height="720" fill="#223344"/><text x="640" y="360" font-size="48" text-anchor="middle" fill="#ddeeff">${b.name}</text></svg>`, source: b.source };
};

const NAME_OK = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PLACEHOLDER_PNG = () => readFileSync(resolve(here, 'assets/placeholder.png'));

const RUN_STEPS = 8;
const err = (status, code, message) => [status, { error: { code, message } }];
const invalid = (message) => err(422, 'validation_failed', message);
const CLIENT_PATTERN = /^[a-z0-9-]{1,32}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export const LEVELS = ['simple', 'medium', 'advanced'];
export const STYLES = ['typographic', 'illustrated'];
export const FRAME_RATES = [24, 30, 60];
export const FONTS = ['Inter', 'Space Grotesk', 'Playfair Display', 'DM Serif Display', 'JetBrains Mono', 'Bebas Neue'];
export const MODES = ['dark', 'light'];
export const ACTIONS = ['enter', 'exit', 'bounce', 'look', 'wave', 'slide'];

const param = (name, type, def, extra = {}) => ({ name, type, default: def, ...extra });
export const PARTS = [
  { name: 'toggle', description: 'A switch that flips on the beat', levels: LEVELS, cost_ms: 55, source: 'builtin', params: [param('label', 'string', 'allow', { max_length: 20 }), param('on', 'bool', 'true')] },
  { name: 'counter', description: 'A number that counts up with the loudness', levels: LEVELS, cost_ms: 55, source: 'builtin', params: [param('to', 'int', '100', { min: 1, max: 999 }), param('speed', 'number', '1.5', { min: 0.5, max: 4 })] },
  { name: 'glass-card', description: 'A frosted card with the verse on it', levels: LEVELS, cost_ms: 55, source: 'builtin', params: [param('title', 'string', '', { max_length: 30 })] },
  { name: 'parallax-cards', description: 'Cards that slide at different depths', levels: ['medium', 'advanced'], cost_ms: 85, source: 'builtin', params: [param('count', 'int', '3', { min: 1, max: 6 }), param('align', 'enum', 'left', { options: ['left', 'center', 'right'] })] },
  { name: 'wire-sphere', description: 'A 3D wireframe sphere that pulses', levels: ['advanced'], cost_ms: 85, source: 'builtin', params: [param('detail', 'int', '12', { min: 4, max: 32 })] },
  { name: 'stamp', description: 'A word stamped onto the page on the beat', levels: LEVELS, cost_ms: 52, source: 'builtin', params: [param('word', 'string', 'APPROVED', { max_length: 20 })] },
  { name: 'terminal', description: 'A terminal that types a command and prints its answer', levels: LEVELS, cost_ms: 55, source: 'builtin', params: [param('command', 'string', 'play song', { max_length: 40 })] },
  { name: 'flat-slabs', description: 'Flat slabs that slide in and out of the frame', levels: LEVELS, cost_ms: 52, source: 'builtin', params: [param('count', 'int', '4', { min: 2, max: 8 })] },
  { name: 'depth-stack', description: 'A stack of layers seen in depth', levels: ['medium', 'advanced'], cost_ms: 70, source: 'builtin', params: [param('layers', 'int', '5', { min: 2, max: 9 })] },
  { name: 'glitch-text', description: 'A word that glitches on the loud beats', levels: ['advanced'], cost_ms: 85, source: 'builtin', params: [param('word', 'string', 'SIGNAL', { max_length: 20 })] },
  { name: 'particles', description: 'Particles that burst on the beat', levels: ['advanced'], cost_ms: 85, source: 'builtin', params: [param('amount', 'int', '120', { min: 20, max: 400 })] },
  { name: 'search-box', description: 'A phrase typed letter by letter with one more suggestion on every beat', levels: LEVELS, cost_ms: 55, source: 'builtin', params: [param('phrase', 'string', 'quiet town', { max_length: 40 }), param('suggestions', 'string', 'quiet town map|quiet town hotel|quiet town news', { max_length: 120 })] },
  { name: 'click-button', description: 'A cursor that comes and presses the button on a beat', levels: LEVELS, cost_ms: 52, source: 'builtin', params: [param('label', 'string', 'Play', { max_length: 20 }), param('pressed', 'string', 'Playing', { max_length: 20 })] },
  { name: 'roll-counter', description: 'Digits that roll from one number to another, with an optional glitch at zero', levels: LEVELS, cost_ms: 58, source: 'builtin', params: [param('from', 'int', '0', { min: 0, max: 999999 }), param('to', 'int', '1000', { min: 0, max: 999999 }), param('glitch', 'bool', 'false')] },
  { name: 'achievement-toast', description: 'A notice with a progress bar that drops in and leaves', levels: LEVELS, cost_ms: 54, source: 'builtin', params: [param('title', 'string', 'Achievement unlocked', { max_length: 30 }), param('text', 'string', 'Heard the whole song', { max_length: 60 })] },
  { name: 'data-table', description: 'A table whose rows come in on the beat', levels: ['medium', 'advanced'], cost_ms: 65, source: 'builtin', params: [param('header', 'string', 'name|value', { max_length: 60 }), param('rows', 'string', 'bpm|96;key|C;length|48', { max_length: 200 })] },
  { name: 'dependency-tree', description: 'A tree of packages that grows a branch on every beat', levels: ['medium', 'advanced'], cost_ms: 62, source: 'builtin', params: [param('root', 'string', 'app', { max_length: 20 }), param('depth', 'int', '3', { min: 1, max: 5 })] },
  { name: 'password-field', description: 'A dot per beat and a strength bar', levels: LEVELS, cost_ms: 52, source: 'builtin', params: [param('label', 'string', 'Password', { max_length: 20 }), param('length', 'int', '12', { min: 4, max: 24 })] },
  { name: 'sunburst', description: 'A pop background of rays that turn with the music', levels: ['medium', 'advanced'], cost_ms: 90, source: 'builtin', params: [param('rays', 'int', '16', { min: 6, max: 48 }), param('spin', 'enum', 'slow', { options: ['slow', 'fast'] })] },
  { name: 'timeline-strip', description: 'A strip of years or labels that follows the whole song', levels: LEVELS, cost_ms: 77, manual: true, source: 'builtin', params: [param('labels', 'string', '1990|2000|2010|2020', { max_length: 120 }), param('progress', 'number', '-1', { min: -1, max: 1 })] },
  { name: 'phosphor-terminal', description: 'A green phosphor terminal with lines that glow and fade', levels: ['medium', 'advanced'], cost_ms: 82, source: 'builtin', params: [param('text', 'string', 'boot sequence', { max_length: 60 })] },
  { name: 'oscilloscope', description: 'A waveform that follows the loudness', levels: ['medium', 'advanced'], cost_ms: 88, source: 'builtin', params: [param('lines', 'int', '2', { min: 1, max: 4 })] },
  { name: 'synth-sun', description: 'A striped retro sun over a grid', levels: ['medium', 'advanced'], cost_ms: 95, source: 'builtin', params: [param('stripes', 'int', '8', { min: 3, max: 16 })] },
  { name: 'warp-grid', description: 'A grid that bends with each beat', levels: ['advanced'], cost_ms: 99, source: 'builtin', params: [param('cells', 'int', '12', { min: 4, max: 32 }), param('bend', 'number', '1', { min: 0, max: 3 })] },
  { name: 'nebula', description: 'A cloud of colour that drifts', levels: ['advanced'], cost_ms: 97, source: 'builtin', params: [param('layers', 'int', '3', { min: 1, max: 6 })] },
  { name: 'word-cloud', description: 'Words that gather and grow with the loudness', levels: ['medium', 'advanced'], cost_ms: 84, source: 'builtin', params: [param('words', 'string', 'sound|light|time', { max_length: 120 })] },
  { name: 'network-diagram', description: 'Nodes and links that light up on the beat', levels: ['medium', 'advanced'], cost_ms: 90, source: 'builtin', params: [param('nodes', 'int', '8', { min: 3, max: 20 })] },
  { name: 'blank', description: 'Draws nothing of its own: the piece is its stage', levels: LEVELS, cost_ms: 40, manual: true, source: 'builtin', params: [] },
];
export const CHARACTERS = [
  { name: 'bot', description: 'A small round robot', poses: ['idle', 'wave'], expressions: ['neutral', 'happy'], source: 'builtin' },
  { name: 'scientist', description: 'A scientist in a lab coat', poses: ['idle', 'point'], expressions: ['neutral', 'surprised'], source: 'builtin' },
  { name: 'mascot', description: 'A round mascot that cheers', poses: ['idle', 'cheer'], expressions: ['happy', 'wink'], source: 'builtin' },
];
export const BACKGROUNDS = [
  { name: 'stage', description: 'A plain stage floor', source: 'builtin' },
  { name: 'night-sky', description: 'A sky of stars', source: 'builtin' },
  { name: 'paper', description: 'A sheet of paper', source: 'builtin' },
  { name: 'pastel-dots', description: 'Soft dots in pastel colours', source: 'builtin' },
];
export const VERSE_STYLES = ['plain', 'highlight', 'karaoke', 'glow'];
export const HIT_STYLES = ['plain', 'metal', 'glow'];
/** Songs the mock hears no words for, as a server without Whisper does: hearing them answers 503. */
const NO_WHISPER = (song) => song.project === 'morning-light';

const stackOf = (name) => `"${name}", ${/Playfair|Serif/.test(name) ? 'Georgia, serif' : /Mono/.test(name) ? 'monospace' : 'sans-serif'}`;
// `features` is what the server supports beyond the base format: `svg` says POST /api/assist/svg exists (the mock does not animate parameters yet).
/** The fonts the mock says its pages carry (the free pack that its list has). */
export const FONT_FILES = Object.fromEntries(['Inter', 'Space Grotesk', 'Playfair Display', 'JetBrains Mono', 'Bebas Neue'].map((family) => [family, { family, weights: [400, 700], licence: 'OFL-1.1' }]));

/** The parts that come with the `theme` feature: a HUD drawn from the theme's corner labels and a film grain. Both are for layers. */
export const THEME_PARTS = [
  { name: 'hud-chrome', description: 'Four corner labels from the theme, drawn over every scene.', levels: LEVELS, cost_ms: 4, manual: true, source: 'builtin', params: [] },
  { name: 'grain', description: 'A fine film grain over the whole frame.', levels: LEVELS, cost_ms: 6, manual: true, source: 'builtin', params: [{ name: 'amount', type: 'number', default: '0.08', min: 0, max: 1, description: 'How strong the grain is.' }] },
];

export const catalog = () => ({ parts: PARTS, characters: CHARACTERS, backgrounds: BACKGROUNDS, levels: LEVELS, styles: STYLES, frame_rates: FRAME_RATES, actions: ACTIONS, fonts: FONTS, font_stacks: Object.fromEntries(FONTS.map((n) => [n, stackOf(n)])), modes: MODES, font_files: FONT_FILES, features: ['svg', 'scene', 'theme', 'review'] });

/** A fragment the mock gives to every part that comes with the program: the mock has no real ones, so each is a labelled card that follows the beat. */
const builtinFragment = (name) =>
  `<style>#mock-${name}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:2% 3%;border:2px solid var(--accent);border-radius:12px;color:var(--fg);font-family:var(--display);font-size:4vh}</style>` +
  `<div id="mock-${name}">${name}</div><script>(function(){var el=document.getElementById('mock-${name}');window.__partSeek=function(t,b){var p=b&&b.position?b.position:0;el.style.transform='translate(-50%,-50%) scale('+(1+0.05*Math.sin(Math.PI*p))+')';};})();</script>`;

const PALETTES = [
  { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Space Grotesk', body: 'Inter', default_mode: 'dark', concept: 'Words that land on the beat, one idea per scene.' },
  { dark: '#0b1d2a', light: '#eef6f9', accent: '#f2b705', display: 'Playfair Display', body: 'Inter', default_mode: 'light', concept: 'A calm night that turns into morning.' },
];

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** What is wrong with a design's theme and crossfade, in the words the server uses; '' when they are fine. */
export function themeProblem(d) {
  if (d.transition_seconds !== undefined && !(typeof d.transition_seconds === 'number' && d.transition_seconds >= 0 && d.transition_seconds <= 2)) return 'design.transition_seconds: it is from 0 to 2 seconds';
  const t = d.theme;
  if (t === undefined) return '';
  if (!t || typeof t !== 'object' || Array.isArray(t)) return 'design.theme: it must be an object';
  const css = t.css ?? '';
  if (typeof css !== 'string' || css.length > 20480) return 'design.theme.css: it must be text of up to 20480 characters';
  if (/@import/i.test(css)) return 'design.theme.css: @import is not allowed';
  if (/url\(\s*['"]?(?!data:)/i.test(css)) return 'design.theme.css: url() may only hold a data: address';
  if (/expression\(|behavior:|javascript:|</i.test(css)) return 'design.theme.css: expression(, behavior:, javascript: and < are not allowed';
  const assets = t.assets ?? {};
  if (Object.keys(assets).length > 5) return 'design.theme.assets: at most 5 drawings';
  for (const [name, svg] of Object.entries(assets)) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(name)) return `design.theme.assets.${name}: a name is lower case letters, digits and _, from a letter, up to 32 characters`;
    if (typeof svg !== 'string' || svg.length > 51200) return `design.theme.assets.${name}: it must be text of up to 51200 characters`;
    if (!/^\s*<svg[\s>]/i.test(svg)) return `design.theme.assets.${name}: it is not an SVG`;
    if (/<script|<foreignObject|\son\w+\s*=|href\s*=\s*['"](?!#)/i.test(svg)) return `design.theme.assets.${name}: a script, a foreignObject, an event handler or an outside reference is not allowed`;
  }
  for (const [corner, text] of Object.entries(t.hud ?? {})) if (typeof text !== 'string' || text.length > 40) return `design.theme.hud.${corner}: it must be text of up to 40 characters`;
  return '';
}

/** The reason a design is refused, or ''. The accent is checked against the background of every mode in use. */
export function designProblem(d) {
  if (!d || typeof d !== 'object') return 'the design is missing';
  for (const k of ['dark', 'light', 'accent']) if (typeof d[k] !== 'string' || !HEX.test(d[k])) return `${k} is not a hexadecimal colour like #aabbcc`;
  for (const k of ['display', 'body']) if (!FONTS.includes(d[k])) return `${k} "${d[k]}" is not one of the typefaces: ${FONTS.join(', ')}`;
  if (!MODES.includes(d.default_mode)) return `default_mode "${d.default_mode}" is neither dark nor light`;
  for (const [tag, mode] of Object.entries(d.modes ?? {})) if (!MODES.includes(mode)) return `the mode of ${tag} is neither dark nor light`;
  if (d.verse_style !== undefined && !VERSE_STYLES.includes(d.verse_style)) return `verse_style "${d.verse_style}" is not one of ${VERSE_STYLES.join(', ')}`;
  if (d.hit_style !== undefined && !HIT_STYLES.includes(d.hit_style)) return `hit_style "${d.hit_style}" is not one of ${HIT_STYLES.join(', ')}`;
  if (typeof d.concept !== 'string') return 'concept is missing';
  if (d.concept.length > 200) return 'concept is longer than 200 characters';
  const themed = themeProblem(d);
  if (themed) return themed;
  const used = new Set([d.default_mode, ...Object.values(d.modes ?? {})]);
  for (const mode of used) {
    const background = mode === 'dark' ? d.dark : d.light;
    if (contrast(d.accent, background) < 3) return `accent ${d.accent} has less than 3:1 contrast with the background of mode ${mode} (${background})`;
  }
  return '';
}

const OVERRIDE_KEYS = ['dark', 'light', 'accent', 'display', 'body', 'verse_style', 'hit_style'];

/** The reason a piece's own design is refused, or ''. It is laid over the song's and the result is checked as a whole design. */
export function overrideProblem(own, song) {
  if (!own || typeof own !== 'object' || Array.isArray(own)) return 'it must be an object';
  for (const k of Object.keys(own)) if (!OVERRIDE_KEYS.includes(k)) return `${k} is not a field of a piece's design`;
  return designProblem({ ...song, ...own });
}

/** The song map of a library song: beats from the tempo, the sections of its lyrics and its words spread over them. */
export function songMapOf(song) {
  const duration = song.audio_seconds;
  const beat = 60 / song.bpm;
  const beats = Array.from({ length: Math.floor(duration / beat) }, (_, i) => Math.round(i * beat * 1000) / 1000);
  const blocks = (song.instrumental ? '' : song.lyrics).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const [head, ...lines] = b.split('\n');
    return { tag: head.replace(/[[\]]/g, ''), lines };
  });
  const sections = [];
  const words = [];
  const per = blocks.length ? duration / blocks.length : duration;
  let line = 0;
  if (!blocks.length) sections.push({ tag: 'instrumental', start: 0, end: duration });
  blocks.forEach((b, i) => {
    const start = Math.round(i * per * 100) / 100;
    const end = i === blocks.length - 1 ? duration : Math.round((i + 1) * per * 100) / 100;
    sections.push({ tag: b.tag.toLowerCase(), start, end });
    const lineLen = (end - start) / b.lines.length;
    b.lines.forEach((text, l) => {
      const ws = text.split(/\s+/).filter(Boolean);
      ws.forEach((w, k) => {
        words.push({ text: w, start: Math.round((start + l * lineLen + (k * lineLen) / ws.length) * 100) / 100, end: Math.round((start + l * lineLen + ((k + 1) * lineLen) / ws.length) * 100) / 100, line });
      });
      line++;
    });
  });
  const hop = 0.25;
  const loudness = Array.from({ length: Math.floor(duration / hop) }, (_, i) => Math.round((0.5 + 0.4 * Math.sin(i / 6)) * 100) / 100);
  return { version: 1, audio_key: song.key, duration, bpm: song.bpm, beats, beat_base: 4, grid_anchored: true, sections, words, words_estimated: !song.instrumental, loudness_hop: hop, loudness };
}

const linesOf = (map, from, to) => {
  const byLine = new Map();
  for (const w of map.words) if (w.start >= from - 1e-6 && w.start < to - 1e-6) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]);
  return [...byLine].map(([line, ws]) => ({ line, text: ws.map((w) => w.text).join(' '), start: ws[0].start, end: ws[ws.length - 1].end, keyword: ws.reduce((a, b) => (b.text.length > a.text.length ? b : a)).text.replace(/[^\p{L}\p{N}'-]/gu, '') }));
};

/** The fixed rule: one piece per section, the parts that the level supports taken in turn. */
/** A script that uses the sample's own parts (see `withOwnParts` of the library's fixtures): first piece main, last piece two extras. */
export function withOwnParts(script, own) {
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

export function scriptOf(map, level, design, parts = []) {
  const all = PARTS.filter((p) => !p.manual && p.levels.includes(level));
  // A preset's parts, when it has some the level supports; none (or none usable) means all the usual ones.
  const chosen = all.filter((p) => parts.includes(p.name));
  const usable = chosen.length ? chosen : all;
  const pieces = map.sections.map((s, i) => {
    const part = usable[i % usable.length];
    const piece = { id: `p${i + 1}`, start: s.start, end: s.end, section: s.tag, part: part.name, params: Object.fromEntries(part.params.map((q) => [q.name, readDefault(q)])), mode: design.modes?.[s.tag] ?? design.default_mode };
    const lines = linesOf(map, s.start, s.end);
    if (lines.length) piece.lines = lines;
    return piece;
  });
  return { version: 1, pieces };
}

/** A parameter's default read by its type. */
export function readDefault(q) {
  switch (q.type) {
    case 'int':
      return Number.parseInt(q.default, 10);
    case 'number':
      return Number(q.default);
    case 'bool':
      return q.default === 'true';
    default:
      return q.default;
  }
}

/** The reason a script is refused, or ''. Names the piece. */
export function scriptProblem(script, map, level, song = PALETTES[0], parts = PARTS) {
  if (!script || script.version !== 1 || !Array.isArray(script.pieces) || !script.pieces.length) return 'the script needs version 1 and at least one piece';
  let at = 0;
  for (const p of script.pieces) {
    if (!(p.end > p.start)) return `piece ${p.id}: it ends before it starts`;
    if (Math.abs(p.start - at) > 0.01) return `piece ${p.id}: ${p.start < at ? 'overlaps the one before' : `leaves a gap from ${at} to ${p.start} seconds`}`;
    at = p.end;
    const part = parts.find((x) => x.name === p.part);
    if (!part) return `piece ${p.id}: part "${p.part}" is not in the catalog`;
    for (const [name, value] of Object.entries(p.params ?? {})) {
      const q = part.params.find((x) => x.name === name);
      if (!q) return `piece ${p.id}: part ${part.name} has no parameter "${name}"`;
      const bad = paramProblem(q, value);
      if (bad) return `piece ${p.id}: parameter ${name} ${bad}`;
    }
    if (p.with !== undefined) {
      if (!Array.isArray(p.with) || p.with.length > 3) return `piece ${p.id}: with takes up to 3 parts`;
      const seen = new Set([p.part]);
      for (const ref of p.with) {
        const extra = parts.find((x) => x.name === ref?.part);
        if (!extra) return `piece ${p.id}: with: part "${ref?.part}" is not in the catalog`;
        if (seen.has(extra.name)) return `piece ${p.id}: with: part ${extra.name} is already drawn in the piece`;
        seen.add(extra.name);
        for (const [name, value] of Object.entries(ref.params ?? {})) {
          const q = extra.params.find((x) => x.name === name);
          if (!q) return `piece ${p.id}: with: part ${extra.name} has no parameter "${name}"`;
          const bad = paramProblem(q, value);
          if (bad) return `piece ${p.id}: with: parameter ${name} of ${extra.name} ${bad}`;
        }
      }
    }
    if (p.design !== undefined) {
      const why = overrideProblem(p.design, song);
      if (why) return `piece ${p.id}: design: ${why}`;
    }
    if (p.mode !== undefined && !MODES.includes(p.mode)) return `piece ${p.id}: mode "${p.mode}" is neither dark nor light`;
    for (const l of p.lines ?? []) if (l.keyword && !(l.text ?? '').split(/\s+/).some((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '') === l.keyword)) return `piece ${p.id}: keyword "${l.keyword}" is not a word of its line`;
    if (p.hit && !(p.hit.length > 0)) return `piece ${p.id}: the word hit needs a length above 0`;
    for (const c of p.stage?.characters ?? []) {
      const ch = CHARACTERS.find((x) => x.name === c.character);
      if (!ch) return `piece ${p.id}: character "${c.character}" is not in the library`;
      if (c.pose && !ch.poses.includes(c.pose)) return `piece ${p.id}: character ${ch.name} has no pose "${c.pose}"`;
      if (c.expression && !ch.expressions.includes(c.expression)) return `piece ${p.id}: character ${ch.name} has no expression "${c.expression}"`;
      if (c.action && !ACTIONS.includes(c.action)) return `piece ${p.id}: action "${c.action}" is not one of ${ACTIONS.join(', ')}`;
    }
    if (p.stage?.background && !BACKGROUNDS.some((b) => b.name === p.stage.background)) return `piece ${p.id}: background "${p.stage.background}" is not in the library`;
  }
  if (Math.abs(at - map.duration) > 0.01) return `the pieces end at ${at} seconds and the song at ${map.duration}`;
  void level;
  return '';
}

function paramProblem(q, v) {
  switch (q.type) {
    case 'string':
      return typeof v !== 'string' ? 'must be a text' : q.max_length && v.length > q.max_length ? `is longer than ${q.max_length} characters` : '';
    case 'int':
    case 'number':
      if (typeof v !== 'number' || (q.type === 'int' && !Number.isInteger(v))) return `must be ${q.type === 'int' ? 'a whole number' : 'a number'}`;
      return (q.min !== undefined && v < q.min) || (q.max !== undefined && v > q.max) ? `is outside ${q.min} to ${q.max}` : '';
    case 'bool':
      return typeof v === 'boolean' ? '' : 'must be true or false';
    default:
      return q.options.includes(v) ? '' : `must be one of ${q.options.join(', ')}`;
  }
}

// ------------------------------------------------------------------ references and styles

const YOUTUBE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;
const REF_COLOURS = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a'];
const REF_SHARES = [0.35, 0.25, 0.2, 0.12, 0.08];
export const MIN_RHYTHM = 2;
export const MAX_RHYTHM = 15;

/** The reason the data of a reference is refused, or ''. Only the fields that are there are looked at. */
export function referenceProblem({ title, notes, tags }) {
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 120)) return 'title must have 1 to 120 characters';
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) return 'notes must be a text of up to 2000 characters';
  if (tags !== undefined && (!Array.isArray(tags) || tags.length > 10 || tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > 40))) return 'tags must be up to 10 texts of up to 40 characters';
  return '';
}

/** What the analysis of a reference says: fixed, but with the kind of video (the address says it) deciding the description. */
function analysisOf(kind) {
  // `dark` is a video whose main colour is too dark to be an accent: a style from it has an adjustment to tell.
  const colours = REF_COLOURS.map((hex, i) => ({ hex: kind === 'dark' && i === 0 ? '#202030' : hex, share: REF_SHARES[i] }));
  return {
    duration: 90,
    fps: 30,
    width: 1280,
    height: 720,
    frames: REF_COLOURS.map((_, i) => `${String(i + 1).padStart(2, '0')}.jpg`),
    colours,
    thirds: [colours, [...colours].reverse(), colours],
    cuts: 24,
    mean_shot: 3.75,
    tempo: 112,
    key: 'A minor',
    ...(kind === 'nodesc' ? { description_note: 'there is no vision model to describe the video' } : { description: 'Warm colours on a dark ground, fast cuts and big type.' }),
  };
}

/** The design, rhythm and adjustments a style takes from the colours of a reference: always a valid design. */
function presetFrom(reference, name, id, now) {
  const base = PALETTES[0];
  const adjustments = [];
  let accent = reference.analysis.colours[0]?.hex ?? base.accent;
  if (contrast(accent, base.dark) < 3) {
    adjustments.push(`accent ${accent} had less than 3:1 contrast with the dark background and became ${base.accent}`);
    accent = base.accent;
  }
  return {
    id,
    name,
    reference_id: reference.id,
    created_at: now,
    design: { ...base, accent, modes: {} },
    rhythm: Math.min(MAX_RHYTHM, Math.max(MIN_RHYTHM, Math.round(reference.analysis.mean_shot * 2))),
    parts: [],
    adjustments,
  };
}

/** The reason a whole style is refused, with the field it is about at the start (`rhythm`, `design.accent`, `parts[0]`), or ''. */
export function presetProblem(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'the style must be an object';
  if (typeof p.name !== 'string' || !p.name.trim()) return 'name is empty';
  if (typeof p.rhythm !== 'number' || !(p.rhythm >= MIN_RHYTHM && p.rhythm <= MAX_RHYTHM)) return `rhythm ${p.rhythm} is not between ${MIN_RHYTHM} and ${MAX_RHYTHM} seconds`;
  const why = designProblem(p.design);
  if (why) return `design.${why}`;
  if (!Array.isArray(p.parts)) return 'parts must be a list';
  const bad = p.parts.findIndex((n) => !PARTS.some((x) => x.name === n));
  if (bad >= 0) return `parts[${bad}]: "${p.parts[bad]}" is not in the catalog`;
  return '';
}

// ------------------------------------------------------------------ part drafts

export const MAX_REQUEST = 500;
export const MAX_PICTURE_BYTES = 20 * 1024 * 1024;
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** What is wrong with the text of a draft, as the server's checks would say it (simplified); each problem is a line. */
export function draftTextProblems(manifest, fragment) {
  const problems = [];
  let name;
  try {
    const m = JSON.parse(manifest);
    name = typeof m?.name === 'string' && m.name.trim() ? m.name.trim() : undefined;
    if (!name) problems.push('manifest.json: name is missing');
    else if (PARTS.some((p) => p.name === name)) problems.push(`manifest.json: the name "${name}" is already in the catalog`);
  } catch {
    problems.push('manifest.json: it is not valid JSON');
  }
  if (typeof fragment !== 'string' || !fragment.trim()) problems.push('part.html: it is empty');
  else if (/transition|@keyframes|animation:/i.test(fragment)) problems.push('part.html: CSS transitions and animations are not allowed: the clock draws the frames');
  return { problems, name };
}

/**
 * Puts the dataset in the mock's data: its songs in the library `songs` (an array the caller owns), and its pieces in their states,
 * its ready references, the styles made from them and its approved parts in `db`. What is already there (a persisted mock) is left as it is.
 */
export function seedSample(db, songs, now = Date.now()) {
  for (const s of SAMPLE.songs) {
    if (songs.some((x) => x.project === s.project && x.track_id === s.trackId && x.variant === s.variant)) continue;
    songs.push({ ...songs[0], key: `${s.project}/${s.trackId}/${s.variant}`, project: s.project, track_id: s.trackId, variant: s.variant, title: s.title, lyrics: s.lyrics, instrumental: s.instrumental, bpm: s.bpm, audio_seconds: s.seconds, file: `out/${s.project}/${s.trackId}${s.variant ? `_v${s.variant}` : ''}.mp3` });
  }
  const at = (back) => new Date(now - back).toISOString();
  SAMPLE.pieces.forEach((p, i) => {
    if (db.pieces[p.id]) return;
    const song = songs.find((x) => x.project === p.song.project && x.track_id === p.song.trackId && x.variant === p.song.variant);
    const song_map = songMapOf(song);
    const [width, height] = p.resolution.split('x').map(Number);
    const design = { design: PALETTES[song.bpm >= 110 ? 1 : 0], source: 'fallback', edited: false };
    db.pieces[p.id] = {
      id: p.id, created_at: at(i * 60_000), title: song.title, source: { project: song.project, track_id: song.track_id, variant: song.variant },
      style: p.style, level: p.level, fps: p.fps, width, height, client: 'sample', design,
      script: i === 0 ? withOwnParts(scriptOf(song_map, p.level, design.design), SAMPLE.parts.filter((x) => x.manifest && x.fragment).map((x) => x.name)) : scriptOf(song_map, p.level, design.design), script_source: 'fallback', song_map,
      ...(p.state === 'done' ? { rendered_at: at(60_000) } : {}),
      ...(p.state === 'failed' ? { failure: p.error } : {}),
    };
  });
  SAMPLE.references.forEach((r, i) => {
    if (!db.references[r.id]) db.references[r.id] = { id: r.id, title: r.title, notes: r.notes, tags: [...r.tags], created_at: at(60_000 + i * 1000), kind: 'ok', source: r.source };
  });
  for (const p of SAMPLE.presets) {
    if (!db.presets[p.id]) db.presets[p.id] = presetFrom({ id: p.referenceId, analysis: analysisOf('ok') }, p.name, p.id, at(0));
  }
  for (const p of SAMPLE.parts) {
    if (!db.parts[p.name]) db.parts[p.name] = { name: p.name, description: p.description, levels: LEVELS, cost_ms: 60, source: 'user', params: [] };
  }
}

export function musicMotionHandlers({ db, save, ts, speed }) {
  const step = 600 / speed;
  const newId = () => `api-mm-${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;

  function stateOf(rec) {
    if (rec.failure) return { state: 'failed', progress: 0, error: rec.failure };
    if (!rec.rendered_at) return { state: 'draft', progress: 0 };
    const elapsed = Date.now() - Date.parse(rec.rendered_at);
    if (elapsed < step) return { state: 'queued', progress: 0 };
    const progress = Math.floor(((elapsed - step) / (step * RUN_STEPS)) * 100);
    if (progress < 100) return { state: 'running', progress: Math.min(99, progress) };
    return { state: 'done', progress: 100 };
  }
  const busy = (rec) => ['queued', 'running'].includes(stateOf(rec).state);

  /** A proposal for design and script is written in the background: waiting, writing, then done, by the clock; when it is done what it decided is applied once. */
  const MAX_PROMPT = 2000;
  const NO_ASSISTANT = 'there is no assistant in the mock, so the fixed rule wrote it.';
  const MOCK_MODELS = { default: 'qwen3:8b', models: [{ name: 'qwen3:8b', size_bytes: 5_200_000_000, fits: true }, { name: 'gemma4:26b', size_bytes: 17_000_000_000, fits: false }] };
  function proposalOf(rec) {
    const p = rec.proposal;
    if (!p) return undefined;
    const elapsed = Date.now() - Date.parse(p.started_at);
    const state = elapsed < p.wait_ms ? 'waiting' : elapsed < p.wait_ms + p.write_ms ? 'writing' : 'done';
    if (state === 'done' && !p.applied) {
      p.applied = true;
      rec.design = { design: PALETTES.find((x) => x.dark !== rec.design.design.dark) ?? PALETTES[0], source: 'fallback', edited: false };
      rec.script = scriptOf(rec.song_map, rec.level, rec.design.design);
      rec.script_source = 'fallback';
      save();
    }
    const out = { state, what: 'all', model: p.model, started_at: p.started_at };
    if (state === 'done') Object.assign(out, { finished_at: new Date(Date.parse(p.started_at) + p.wait_ms + p.write_ms).toISOString(), design_source: 'fallback', design_fallback_reason: p.reason, script_source: 'fallback', script_fallback_reason: p.reason });
    return out;
  }
  const proposing = (rec) => ['waiting', 'writing'].includes(proposalOf(rec)?.state);
  const proposalBusy = (id) => err(409, 'conflict', `piece "${id}" has a proposal being written: wait for it to end`);
  const promptProblem = (prompt) => (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > MAX_PROMPT) ? `prompt must be text of up to ${MAX_PROMPT} characters` : '');
  const frames = (rec) => Math.round(rec.song_map.duration * rec.fps);
  const estimateOf = (rec) => {
    const cost = { simple: 55, medium: 70, advanced: 85 }[rec.level] * (rec.fps === 60 ? 1.1 : 1);
    return { seconds: Math.round((frames(rec) * cost) / 1000), estimate: true, frames: frames(rec), corrected: false, factor: 1 };
  };

  const songOf = (rec) => fx.LIBRARY_SONGS.find((x) => x.project === rec.source.project && x.track_id === rec.source.track_id && x.variant === rec.source.variant);

  /** Hears the words of a piece: they stop being estimated and a script nobody edited is made again. Returns the warning, or ''. */
  function hear(rec) {
    rec.song_map = { ...rec.song_map, words_estimated: false };
    if (rec.script_source === 'user') return `${rec.script.pieces.length} pieces of your script were kept and may need adjusting`;
    rec.script = scriptOf(rec.song_map, rec.level, rec.design.design);
    return '';
  }

  /** A reference analyses for a few steps and then is ready (or failed): the state comes from the clock, like a render. */
  function referenceView(rec) {
    const elapsed = Date.now() - Date.parse(rec.created_at);
    const v = { id: rec.id, title: rec.title, notes: rec.notes, tags: rec.tags, state: 'analysing', created_at: rec.created_at };
    if (rec.source) v.source = rec.source;
    if (elapsed < step * 3) return v;
    if (rec.kind === 'broken') return { ...v, state: 'failed', error: 'the video has no video stream' };
    return { ...v, state: 'ready', analysis: analysisOf(rec.kind) };
  }

  /** A draft is written for a few steps and then is ready (or failed): the state comes from the clock, like a render. */
  function draftView(rec, full) {
    const elapsed = Date.now() - Date.parse(rec.created_at);
    const v = { id: rec.id, state: 'writing', request: rec.request, with_picture: rec.with_picture, attempts: rec.attempts, problems: [], created_at: rec.created_at, preview: [] };
    if (rec.source) v.source = rec.source;
    if (rec.replaces) v.replaces = rec.replaces;
    if (rec.model) v.model = rec.model;
    if (rec.description) v.description = rec.description;
    if (rec.scene) Object.assign(v, { scene: rec.scene, brief: rec.brief ?? '' });
    if (rec.review_ask) v.review_ask = rec.review_ask;
    if (elapsed < step * 4 && !rec.from_text) return v;
    if (rec.kind === 'invalid') return { ...v, state: 'failed', problems: rec.problems, error: rec.problems.join('\n'), manifest: rec.manifest, fragment: rec.fragment };
    if (rec.kind === 'minor') return { ...v, state: 'failed', error: 'the picture shows a minor, or an age that cannot be confirmed: it was not kept and the part was not written' };
    if (rec.kind === 'fail') return { ...v, state: 'failed', problems: ['part.html: it draws nothing that moves'], error: 'the assistant could not write a part that passes the checks after 3 attempts' };
    const ready = { ...v, state: 'ready', name: rec.name, preview: ['01.png', '02.png'] };
    if (rec.review) ready.review = draftReviewOf(rec);
    const warned = slotWarnings(rec);
    if (warned.length) ready.warnings = warned;
    return full ? { ...ready, manifest: rec.manifest, fragment: rec.fragment } : ready;
  }
  const draftLost = (rec) => rec.kind === 'minor';

  /** The text of a part of the user's: what was approved or put over it, or the sample's own. A part that was deleted has none. */
  const sampleOf = (name) => SAMPLE.parts.find((p) => p.name === name && p.manifest && p.fragment);
  /** A part of the user's: approved, or one of the sample's own that was not deleted (a deleted one leaves `null` in its text). */
  const isMine = (name) => !!db.parts[name] || (!!sampleOf(name) && db.partTexts[name] !== null);
  function readPartText(name) {
    if (!isMine(name)) return null;
    const own = db.partTexts[name];
    if (own) {
      try {
        return { manifest: JSON.parse(own.manifest), fragment: own.fragment };
      } catch {
        return null;
      }
    }
    const sample = sampleOf(name);
    return sample ? { manifest: sample.manifest, fragment: sample.fragment } : null;
  }

  /** What stops a replace or a delete before it starts: not a valid name or no such part (404), a part that comes with the program (409). */
  function partTouchProblem(name) {
    if (isMine(name)) return null;
    if (PARTS.some((p) => p.name === name)) return err(409, 'conflict', `the part "${name}" comes with the program: it cannot be changed or deleted`);
    return err(404, 'not_found', `part "${name}" not found`);
  }

  /** The pieces whose script has the part (main, extra or layer item) and the styles that list it, as the words of a refusal. */
  function partUsers(name) {
    const pieces = Object.values(db.pieces).filter((r) => (r.script?.pieces ?? []).some((s) => s.part === name || (s.with ?? []).some((w) => w.part === name)) || (r.script?.layers ?? []).some((l) => l.items.some((i) => i.part === name))).map((r) => `piece ${r.id}`);
    const styles = Object.values(db.presets).filter((p) => (p.parts ?? []).includes(name)).map((p) => `style ${p.id}`);
    return [...pieces, ...styles];
  }

  /** A request together with a text asks the assistant to change that text: the manifest needs a JSON with a name and the fragment some text (`422` otherwise). */
  function rewriteOf(input) {
    let manifest;
    try {
      manifest = JSON.parse(typeof input.manifest === 'string' ? input.manifest : '');
    } catch {
      manifest = null;
    }
    const name = typeof manifest?.name === 'string' && manifest.name.trim() ? manifest.name.trim() : '';
    if (!name || typeof input.fragment !== 'string' || !input.fragment.trim()) return { error: invalid('the manifest needs a name and the fragment cannot be empty') };
    return { manifest, name };
  }

  // A draft made from a manifest and a fragment, with no assistant: checked like a saved text, answered at once, `ready` or `failed` with its problems.
  function draftFromText(body) {
    if (body.reference_id !== undefined || body.frame !== undefined) return err(400, 'invalid_request', 'a text cannot come with a picture or a frame');
    // Half a text is not refused (the real server makes a failed draft that says what is missing): the other half is empty.
    const manifest = typeof body.manifest === 'string' ? body.manifest : '';
    const fragment = typeof body.fragment === 'string' ? body.fragment : '';
    if (/nochrome/i.test(manifest + fragment)) return err(503, 'unavailable', 'Chrome is not installed on this machine');
    const { problems, name } = draftTextProblems(manifest, fragment);
    if (name && db.parts[name]) problems.push(`manifest.json: a part named "${name}" already exists in your parts folder`);
    const id = `draft-${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
    const rec = { id, request: '(written by hand)', with_picture: false, created_at: ts(), attempts: 1, kind: problems.length ? 'invalid' : 'ok', from_text: true, name, manifest, fragment, ...(problems.length ? { problems } : {}) };
    db.drafts[id] = rec;
    save();
    return [200, draftView(rec, true)];
  }

  /** The `{{asset:name}}` slots of a scene draft that the theme of its piece has no drawing for: the slot would be empty. */
  function slotWarnings(rec) {
    if (!rec.scene) return [];
    const assets = db.pieces[rec.scene.piece]?.design?.design?.theme?.assets ?? {};
    return [...new Set([...String(rec.fragment).matchAll(/\{\{asset:([a-z][a-z0-9_]*)\}\}/g)].map((m) => m[1]))].filter((n) => !(n in assets)).map((n) => `{{asset:${n}}}: the theme has no drawing with that name`);
  }

  const verdictOf = (score) => (score >= 7 ? 'pass' : score >= 5 ? 'weak' : 'fail');
  /** The review of a draft by a rule: a short idea scores low. With a minimum a draft under it is rewritten (each version climbs a point) up to the attempts asked; the best stays. */
  function draftReviewOf(rec) {
    const ask = rec.review === true ? {} : rec.review;
    const first = Math.min(9, 3 + Math.floor(String(rec.brief ?? rec.request).length / 12));
    const max = Math.min(ask.attempts ?? 2, 3);
    const versions = [first];
    while (ask.min !== undefined && versions.at(-1) < ask.min && versions.length <= max) versions.push(Math.min(10, versions.at(-1) + 1));
    const score = Math.max(...versions);
    const notes = score >= 7 ? ['The metaphor reads at a glance.', 'The keyword lands on its word.'] : ['Say what the verse means with one image, not a list of words.', 'The accent is used twice: keep it for the keyword.'];
    return { score, verdict: verdictOf(score), notes, model: 'gemma4:26b', ...(versions.length > 1 ? { attempts: versions.map((v) => ({ score: v, verdict: verdictOf(v), notes: [] })) } : {}) };
  }

  const sceneReviewAsk = (review) => (review === true ? {} : review && typeof review === 'object' ? { ...(review.min !== undefined ? { min: review.min } : {}), ...(review.attempts !== undefined ? { attempts: review.attempts } : {}) } : undefined);

  /** A scene draft for one script piece: the idea as big words at the lines' times, named for the piece. `createdAt` lets a batch write them one after the other. */
  function makeSceneDraft(piece, scriptPiece, brief, createdAt, model, review) {
    const id = `draft-${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
    const count = Object.values(db.drafts).filter((d) => d.scene?.piece === piece.id).length + Object.values(db.parts).filter((q) => q.scene?.piece === piece.id).length + 1;
    const name = `scene-${piece.id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-12)}-${count}`.slice(0, 32);
    const words = (scriptPiece.lines ?? []).filter((l) => l.text).map((l, i) => `<div class="w w${i}" data-at="${l.start ?? scriptPiece.start}">${String(l.keyword || l.text.split(/\s+/)[0]).replace(/[<>&"]/g, '')}</div>`).join('\n');
    const rec = {
      id,
      request: brief,
      with_picture: false,
      created_at: new Date(createdAt).toISOString(),
      attempts: 1,
      kind: 'ok',
      name,
      scene: { piece: piece.id, script_piece: scriptPiece.id },
      brief,
      ...(sceneReviewAsk(review) ? { review_ask: sceneReviewAsk(review), review: sceneReviewAsk(review) } : {}),
      ...(model ? { model } : {}),
      manifest: JSON.stringify({ name, description: brief || `A scene for ${scriptPiece.id}`, version: 1, verse: 'own', scene: { piece: piece.id, script_piece: scriptPiece.id }, params: [] }, null, 2),
      fragment: `<div class="scene">${brief ? `<p class="idea">${brief.replace(/[<>&"]/g, '')}</p>\n` : ''}${words}</div>`,
    };
    db.drafts[id] = rec;
    return rec;
  }

  /** A draft asked for with `scene` (JSON only): the server builds the input from the saved piece. */
  function sceneDraft(body) {
    const { piece: pieceId, script_piece: scriptPieceId, brief = '' } = body.scene ?? {};
    if (body.reference_id !== undefined || body.frame !== undefined || body.manifest !== undefined || body.fragment !== undefined) return invalid('a scene cannot come with a reference, a frame or a text');
    if (typeof brief !== 'string' || brief.length > MAX_REQUEST) return invalid(`scene.brief must have up to ${MAX_REQUEST} characters`);
    const piece = db.pieces[pieceId];
    if (!piece) return err(404, 'not_found', `piece "${pieceId}" not found`);
    const scriptPiece = piece.script.pieces.find((q) => q.id === scriptPieceId);
    if (!scriptPiece) return err(404, 'not_found', `piece "${pieceId}" has no script piece "${scriptPieceId}"`);
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    if (model && !MOCK_MODELS.models.some((m) => m.name === model)) return invalid(`the model ${JSON.stringify(model)} is not installed`);
    const idea = brief || (typeof body.request === 'string' ? body.request.trim() : '');
    const rec = makeSceneDraft(piece, scriptPiece, idea, Date.now(), model, body.review);
    save();
    return [202, draftView(rec, false)];
  }

  /** The batch as the clock says it is now: each draft is pending until its turn, writing for a while, then ready; one that was approved is gone. */
  function batchOf(rec) {
    const b = rec.batch;
    const now = Date.now();
    const drafts = b.items.map((item) => {
      const d = db.drafts[item.draft_id];
      if (!d) return { script_piece: item.script_piece, state: 'approved' };
      if (b.cancelled_at !== undefined && Date.parse(d.created_at) > Date.parse(b.cancelled_at)) return { script_piece: item.script_piece, state: 'pending' };
      if (now < Date.parse(d.created_at)) return { script_piece: item.script_piece, state: 'pending' };
      const state = draftView(d, false).state;
      return { script_piece: item.script_piece, draft_id: item.draft_id, state, ...(state === 'failed' ? { error: 'the assistant could not write a scene that passes the checks' } : {}) };
    });
    const done = drafts.filter((d) => ['ready', 'failed', 'approved'].includes(d.state)).length;
    const state = b.cancelled_at !== undefined ? (drafts.some((d) => d.state === 'writing') ? 'writing' : 'cancelled') : done === drafts.length ? 'done' : 'writing';
    return { state, done, total: drafts.length, drafts, ...(b.model ? { model: b.model } : {}), brief_mode: b.brief_mode, ...(b.review ? { review: b.review } : {}), started_at: b.started_at, ...(state === 'done' || state === 'cancelled' ? { finished_at: ts() } : {}) };
  }

  /** The review of a piece: running for a few steps, then a score for each script piece by a rule and two fixed notes. */
  function reviewOf(rec) {
    const r = rec.review;
    if (Date.now() - Date.parse(r.started_at) < step * 2) return { state: 'running', started_at: r.started_at, model: r.model, scenes: [] };
    const scenes = rec.script.pieces.map((q) => {
      const score = 3 + ((q.lines ?? []).map((l) => l.text ?? '').join(' ').length % 7);
      return { script_piece: q.id, score, verdict: verdictOf(score), notes: score >= 7 ? [] : ['The keyword is not the biggest thing on the frame.', 'Two accents compete.'] };
    });
    const mean = scenes.length ? Math.round(scenes.reduce((a, x) => a + x.score, 0) / scenes.length) : 0;
    return { state: 'done', started_at: r.started_at, finished_at: ts(), model: r.model, scenes, overall: { score: mean, notes: ['Type and palette are consistent.', 'Two scenes use the same metaphor.'], repeated: scenes.length > 3 ? [[scenes[0].script_piece, scenes[2].script_piece]] : [] } };
  }

  /** The parts of the catalog: the ones the server has and the ones approved from drafts. */
  const allParts = () => [...PARTS, ...THEME_PARTS, ...Object.values(db.parts)];

  function view(rec, full) {
    const st = stateOf(rec);
    const v = {
      id: rec.id,
      state: st.state,
      progress: st.progress,
      title: rec.title,
      source: rec.source,
      style: rec.style,
      level: rec.level,
      fps: rec.fps,
      width: rec.width,
      height: rec.height,
      client: rec.client,
      created_at: rec.created_at,
      estimate: estimateOf(rec),
      size_bytes: st.state === 'done' ? Math.round(rec.song_map.duration * 700_000) : 0,
    };
    if (rec.preset) v.preset = rec.preset;
    if (rec.prompt) v.prompt = rec.prompt;
    if (full && rec.proposal) v.proposal = proposalOf(rec);
    if (full && rec.batch) v.scenes = batchOf(rec);
    if (full && rec.review) v.review = reviewOf(rec);
    if (rec.run_id) v.run_id = rec.run_id;
    if (st.state === 'done') v.video = `/api/projects/${rec.id}/artifacts/out/${rec.id}.mp4`;
    if (st.error) v.error = st.error;
    if (full) Object.assign(v, { design: rec.design, script: rec.script, script_source: rec.script_source, song_map: rec.song_map });
    return v;
  }
  const newest = (a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1);
  const find = (params) => {
    const rec = db.pieces[params.id] ?? null;
    if (rec) proposalOf(rec);
    return rec;
  };
  const notFound = (id) => err(404, 'not_found', `piece "${id}" not found`);
  const drawing = (id) => err(409, 'conflict', `piece "${id}" is being drawn: wait for it to end`);
  const body422 = (body) => (body && typeof body === 'object' ? null : err(400, 'invalid_request', 'invalid JSON body'));

  return {
    // The scenes written for the verses of a piece are not listed unless `include=scene` or `piece=<id>` asks for them.
    'GET /api/music-motion/catalog': ({ query }) => [200, { ...catalog(), parts: allParts().filter((p) => !p.scene || query?.get('include') === 'scene' || query?.get('piece') === p.scene.piece) }],

    'POST /api/music-motion/pieces': ({ body }) => {
      const bad = body422(body);
      if (bad) return bad;
      const song = fx.LIBRARY_SONGS.find((s) => s.project === body.project && s.track_id === body.track_id && s.variant === body.variant);
      if (!song) return invalid(`the song ${body.project}/${body.track_id} version ${body.variant} is unknown: pick one of GET /api/library`);
      const style = body.style ?? 'typographic';
      const level = body.level ?? 'simple';
      const fps = body.fps ?? (style === 'illustrated' ? 24 : 30);
      const resolution = body.resolution ?? '1280x720';
      if (!STYLES.includes(style)) return invalid(`style "${style}" is not one of ${STYLES.join(', ')}`);
      if (!LEVELS.includes(level)) return invalid(`level "${level}" is not one of ${LEVELS.join(', ')}`);
      if (!FRAME_RATES.includes(fps)) return invalid(`frame rate ${fps} is not one of ${FRAME_RATES.join(', ')}`);
      const size = /^(\d{3,4})x(\d{3,4})$/.exec(resolution);
      if (!size) return invalid(`resolution "${resolution}" is not like 1280x720`);
      if (body.client !== undefined && !(typeof body.client === 'string' && CLIENT_PATTERN.test(body.client))) return invalid(`client ${JSON.stringify(body.client)} is not a client name: use ^[a-z0-9-]{1,32}$`);
      if (body.design !== undefined) {
        const why = designProblem(body.design);
        if (why) return invalid(`design: ${why}`);
      }
      if (body.transcribe !== undefined && typeof body.transcribe !== 'boolean') return invalid('transcribe must be true or false');
      const badPrompt = promptProblem(body.prompt);
      if (badPrompt) return invalid(badPrompt);
      let preset;
      if (body.preset !== undefined) {
        preset = typeof body.preset === 'string' ? db.presets[body.preset] : undefined;
        if (!preset) return invalid(`preset ${JSON.stringify(body.preset)} does not exist: pick one of GET /api/music-motion/presets`);
      }
      const song_map = songMapOf(song);
      // The design of the request wins over the style's, which wins over the fixed palette.
      const design = body.design
        ? { design: body.design, source: 'user', edited: true }
        : { design: preset ? preset.design : PALETTES[song.bpm >= 110 ? 1 : 0], source: 'fallback', edited: false };
      const rec = {
        id: newId(),
        created_at: ts(),
        title: song.title,
        source: { project: song.project, track_id: song.track_id, variant: song.variant },
        style,
        level,
        fps,
        width: Number(size[1]),
        height: Number(size[2]),
        client: body.client ?? 'unknown',
        design,
        script: scriptOf(song_map, level, design.design, preset?.parts),
        script_source: 'fallback',
        song_map,
        ...(preset ? { preset: preset.id } : {}),
        ...(body.prompt ? { prompt: body.prompt } : {}),
      };
      db.pieces[rec.id] = rec;
      // Asked to hear the words and unable to: the piece is made anyway and the answer says why, only in this answer.
      let words_note;
      if (body.transcribe) {
        if (NO_WHISPER(song)) words_note = 'whisper-cli is not installed: the words keep their estimated times';
        else if (song.instrumental) words_note = 'no words were heard in the song: the words keep their estimated times';
        else hear(rec);
      }
      save();
      return [201, { ...view(rec, true), ...(words_note ? { words_note } : {}) }];
    },
    'GET /api/music-motion/pieces': () => [200, Object.values(db.pieces).sort(newest).map((r) => view(r, false))],
    'GET /api/music-motion/pieces/{id}': ({ params }) => {
      const rec = find(params);
      return rec ? [200, view(rec, true)] : notFound(params.id);
    },
    'DELETE /api/music-motion/pieces/{id}': ({ params }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (busy(rec)) return drawing(rec.id);
      delete db.pieces[rec.id];
      save();
      return [204];
    },

    'PUT /api/music-motion/pieces/{id}/design': ({ params, body }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      const bad = body422(body);
      if (bad) return bad;
      if (busy(rec)) return drawing(rec.id);
      if (proposing(rec)) return proposalBusy(rec.id);
      const why = designProblem(body);
      if (why) return invalid(why);
      rec.design = { design: body, source: 'user', edited: true };
      save();
      return [200, rec.design];
    },
    'PUT /api/music-motion/pieces/{id}/script': ({ params, body }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      const bad = body422(body);
      if (bad) return bad;
      if (busy(rec)) return drawing(rec.id);
      if (proposing(rec)) return proposalBusy(rec.id);
      const why = scriptProblem(body, rec.song_map, rec.level, rec.design.design, allParts());
      if (why) return invalid(why);
      rec.script = body;
      rec.script_source = 'user';
      save();
      return [200, rec.script];
    },
    // The pages a render would draw, built from the saved design and script or from the ones in the body, saving nothing.
    'POST /api/music-motion/pieces/{id}/preview': ({ params, query, body }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) return err(400, 'invalid_request', 'invalid JSON body');
      const design = body?.design ?? rec.design.design;
      if (body?.design) {
        const why = designProblem(body.design);
        if (why) return invalid(why);
      }
      const script = body?.script ?? rec.script;
      const why = scriptProblem(script, rec.song_map, rec.level, design, allParts());
      if (why) return invalid(why);
      const only = (query?.get('scenes') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      for (const id of only) if (!script.pieces.some((p) => p.id === id)) return invalid(`scenes: "${id}" is not a piece of the script`);
      const chosen = script.pieces.filter((p) => only.length === 0 || only.includes(p.id));
      const scenes = chosen.map((p) => {
        const song = {
          ...rec.song_map,
          beats: rec.song_map.beats.filter((b) => b >= p.start && b < p.end).map((b) => Math.round((b - p.start) * 1000) / 1000),
          words: rec.song_map.words.filter((w) => w.start >= p.start - 1e-6 && w.start < p.end - 1e-6).map((w) => ({ ...w, start: Math.round((w.start - p.start) * 100) / 100, end: Math.round((w.end - p.start) * 100) / 100 })),
          duration: Math.round((p.end - p.start) * 100) / 100,
        };
        const fragment = (SAMPLE.parts.find((x) => x.name === p.part && x.fragment)?.fragment) ?? builtinFragment(p.part);
        const mode = p.mode ?? design.default_mode;
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--bg:${mode === 'dark' ? design.dark : design.light};--fg:${mode === 'dark' ? design.light : design.dark};--accent:${design.accent};--display:${stackOf(design.display)};--body:${stackOf(design.body)}}html,body{margin:0;width:100%;height:100%;background:var(--bg);overflow:hidden;position:relative}</style></head><body>${fragment}<script>window.addEventListener('message',function(e){if(e.data&&e.data.type==='seek'&&window.__partSeek)window.__partSeek(e.data.t,{position:0});});</script></body></html>`;
        return { id: p.id, start: p.start, end: p.end, html, song };
      });
      return [200, { width: rec.width, height: rec.height, fps: rec.fps, scenes, replacements: [] }];
    },
    // A PNG of the saved piece at second t. The mock has no browser: it is always the placeholder picture.
    'GET /api/music-motion/pieces/{id}/frame': ({ params, query }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      const raw = query?.get('t');
      const t = raw === null || raw === undefined || raw.trim() === '' ? NaN : Number(raw);
      if (!Number.isFinite(t) || t < 0) return invalid('t must be a number of seconds, 0 or more');
      const end = rec.script.pieces[rec.script.pieces.length - 1].end;
      if (t >= end) return invalid(`t=${t} is outside the piece (0 to ${end})`);
      return [200, PLACEHOLDER_PNG(), 'image/png'];
    },
    'GET /api/music-motion/library/characters/{name}': ({ params }) => {
      const c = NAME_OK.test(params.name) ? libraryCharacter(params.name) : null;
      return c ? [200, c] : err(404, 'not_found', `character "${params.name}" not found`);
    },
    'GET /api/music-motion/library/backgrounds/{name}': ({ params }) => {
      const b = NAME_OK.test(params.name) ? libraryBackground(params.name) : null;
      return b ? [200, b] : err(404, 'not_found', `background "${params.name}" not found`);
    },
    // A part with its text, as the server reads it back: the sample's own parts carry theirs; a part that comes with the program gets a labelled card; any other name is a 404.
    'GET /api/music-motion/parts/{name}': ({ params }) => {
      const text = readPartText(params.name);
      if (text) return [200, { name: params.name, source: 'user', manifest: text.manifest, fragment: text.fragment }];
      const builtin = PARTS.find((p) => p.name === params.name);
      if (builtin) return [200, { name: builtin.name, source: 'builtin', manifest: { name: builtin.name, description: builtin.description, version: 1, cost_ms: builtin.cost_ms, levels: builtin.levels, params: builtin.params }, fragment: builtinFragment(builtin.name) }];
      return err(404, 'not_found', `part "${params.name}" not found`);
    },
    // Replaces the text of a part of the user's, checked like an approval; the manifest keeps the name. The text of the sample's own parts is replaced like any.
    'PUT /api/music-motion/parts/{name}': ({ params, body }) => {
      const refused = partTouchProblem(params.name);
      if (refused) return refused;
      const bad = body422(body);
      if (bad) return bad;
      // Half a text is not refused (the real server makes a failed draft that says what is missing): the other half is empty.
      const manifest = typeof body.manifest === 'string' ? body.manifest : '';
      const fragment = typeof body.fragment === 'string' ? body.fragment : '';
      if (/nochrome/i.test(manifest + fragment)) return err(503, 'unavailable', 'Chrome is not installed on this machine');
      const { problems, name } = draftTextProblems(body.manifest, body.fragment);
      if (name && name !== params.name) problems.push(`manifest.json: the name must stay "${params.name}"`);
      if (problems.length) return invalid(problems.join('\n'));
      const part = db.parts[params.name] ?? { name: params.name, description: sampleOf(params.name).description, levels: LEVELS, cost_ms: 60, source: 'user', params: [] };
      db.parts[params.name] = { ...part, description: JSON.parse(body.manifest).description ?? part.description };
      db.partTexts[params.name] = { manifest: body.manifest, fragment: body.fragment };
      save();
      return [200, db.parts[params.name]];
    },
    // Deletes a part of the user's; a part that a piece or a style uses is refused, naming them, unless `force=true`.
    'DELETE /api/music-motion/parts/{name}': ({ params, query }) => {
      const refused = partTouchProblem(params.name);
      if (refused) return refused;
      const users = partUsers(params.name);
      if (users.length && query?.get('force') !== 'true') return err(409, 'conflict', `the part "${params.name}" is used by ${users.join(', ')}: delete it anyway to leave them without it`);
      delete db.parts[params.name];
      if (sampleOf(params.name)) db.partTexts[params.name] = null;
      else delete db.partTexts[params.name];
      save();
      return [204];
    },
    'GET /api/music-motion/part-drafts': () => [200, { drafts: Object.values(db.drafts).sort(newest).map((d) => draftView(d, false)) }],
    'POST /api/music-motion/part-drafts': ({ body }) => {
      let input;
      let rewrite;
      if (body?.buffer) {
        const form = parseMultipart(body.buffer, body.type, 'file');
        if (!form) return err(400, 'invalid_request', 'invalid multipart body');
        if (form.image && !PICTURE_TYPES.includes(form.image.contentType)) return invalid(`${form.image.filename || 'the file'} is not a png, jpg or webp picture`);
        if (form.image && form.image.size > MAX_PICTURE_BYTES) return invalid('the picture is bigger than 20 MB');
        input = { request: form.fields.request, upload: form.image, model: form.fields.model };
      } else {
        const bad = body422(body);
        if (bad) return bad;
        if (body.scene !== undefined) return sceneDraft(body);
        if ((body.manifest !== undefined || body.fragment !== undefined) && body.request === undefined) return draftFromText(body);
        input = { request: body.request, reference_id: body.reference_id, frame: body.frame, manifest: body.manifest, fragment: body.fragment, model: body.model };
        if (input.manifest !== undefined || input.fragment !== undefined) {
          if (input.reference_id !== undefined || input.frame !== undefined) return err(400, 'invalid_request', 'a text cannot come with a picture or a frame');
          rewrite = rewriteOf(input);
          if (rewrite.error) return rewrite.error;
        }
      }
      const request = typeof input.request === 'string' ? input.request.trim() : '';
      if (!request || request.length > MAX_REQUEST) return invalid(`the request must have 1 to ${MAX_REQUEST} characters`);
      let source;
      if (input.upload) source = 'upload';
      else if (input.reference_id !== undefined || input.frame !== undefined) {
        const ref = db.references[input.reference_id];
        if (!ref) return invalid(`reference ${JSON.stringify(input.reference_id)} does not exist`);
        const frames = analysisOf(ref.kind).frames;
        if (!frames.includes(input.frame)) return invalid(`frame ${JSON.stringify(input.frame)} is not one of the frames of the reference: ${frames.join(', ')}`);
        source = `reference:${ref.id}/${input.frame}`;
      }
      const model = typeof input.model === 'string' ? input.model.trim() : '';
      if (model && !MOCK_MODELS.models.some((m) => m.name === model)) return invalid(`the model ${JSON.stringify(model)} is not installed (installed: ${MOCK_MODELS.models.map((m) => m.name).join(', ')})`);
      // The words of the request make the cases that cannot be reached otherwise (the real server has its own causes).
      if (/busy/i.test(request)) return err(409, 'conflict', 'a run is active and the model is local: wait for it to end');
      if (/nochrome/i.test(request)) return err(503, 'unavailable', 'Chrome is not installed on this machine');
      if (/noassistant/i.test(request)) return err(503, 'unavailable', 'there is no assistant to write the part');
      if (source && /novision/i.test(request)) return err(503, 'unavailable', 'there is no vision model to look at the picture');
      const kind = source && /minor/i.test(request) ? 'minor' : /fail/i.test(request) ? 'fail' : /problems/i.test(request) ? 'problems' : 'ok';
      const id = `draft-${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
      const name = rewrite ? rewrite.name : /clash/i.test(request) ? 'clash-part' : `part-${Object.keys(db.drafts).length + 1}-${randomBytes(2).toString('hex')}`;
      const rec = {
        id,
        request,
        with_picture: !!source,
        ...(source ? { source, description: 'A dark scene with warm colours and big type.' } : {}),
        created_at: ts(),
        attempts: 1,
        kind,
        name,
        manifest: rewrite ? JSON.stringify({ ...rewrite.manifest, description: `${rewrite.manifest.description ?? ''} (changed: ${request})`.trim() }, null, 2) : JSON.stringify({ name, description: request, params: [] }, null, 2),
        fragment: rewrite ? `${input.fragment}\n<!-- changed: ${request.replace(/--/g, '-')} -->` : `<div class="${name}">${request}</div>`,
        ...(rewrite ? { replaces: rewrite.name } : {}),
        ...(model ? { model } : {}),
      };
      db.drafts[id] = rec;
      save();
      return [202, draftView(rec, false)];
    },
    'GET /api/music-motion/part-drafts/{id}': ({ params }) => (db.drafts[params.id] ? [200, draftView(db.drafts[params.id], true)] : err(404, 'not_found', `draft "${params.id}" not found`)),
    'PUT /api/music-motion/part-drafts/{id}': ({ params, body }) => {
      const rec = db.drafts[params.id];
      if (!rec) return err(404, 'not_found', `draft "${params.id}" not found`);
      const bad = body422(body);
      if (bad) return bad;
      if (draftView(rec, false).state === 'writing') return err(409, 'conflict', `draft "${rec.id}" is being written: wait for it to end`);
      if (/nochrome/i.test(rec.request)) return err(503, 'unavailable', 'Chrome is not installed on this machine');
      const { problems, name } = draftTextProblems(body.manifest, body.fragment);
      // A draft asked for with `problems` is refused once as it was written, so the problems can be seen and fixed.
      if (!problems.length && rec.kind === 'problems' && body.manifest === rec.manifest && body.fragment === rec.fragment) problems.push('part.html: it draws nothing that moves');
      if (problems.length) return invalid(problems.join('\n'));
      rec.manifest = body.manifest;
      rec.fragment = body.fragment;
      rec.name = name;
      if (rec.kind === 'problems' || rec.kind === 'invalid') {
        rec.kind = 'ok';
        delete rec.problems;
      }
      save();
      return [200, draftView(rec, true)];
    },
    'DELETE /api/music-motion/part-drafts/{id}': ({ params }) => {
      if (!db.drafts[params.id]) return err(404, 'not_found', `draft "${params.id}" not found`);
      delete db.drafts[params.id];
      save();
      return [204];
    },
    'POST /api/music-motion/part-drafts/{id}/retry': ({ params }) => {
      const rec = db.drafts[params.id];
      if (!rec) return err(404, 'not_found', `draft "${params.id}" not found`);
      const state = draftView(rec, false).state;
      if (state === 'writing') return err(409, 'conflict', `draft "${rec.id}" is being written`);
      if (state !== 'failed') return invalid(`draft "${rec.id}" is not failed`);
      if (draftLost(rec)) return invalid('the picture was deleted by the age check: ask for the part again');
      if (/nochrome/i.test(rec.request)) return err(503, 'unavailable', 'Chrome is not installed on this machine');
      rec.kind = 'ok';
      rec.attempts += 1;
      rec.created_at = ts();
      save();
      return [202, draftView(rec, false)];
    },
    'POST /api/music-motion/part-drafts/{id}/approve': ({ params }) => {
      const rec = db.drafts[params.id];
      if (!rec) return err(404, 'not_found', `draft "${params.id}" not found`);
      const state = draftView(rec, false).state;
      if (state === 'writing') return err(409, 'conflict', `draft "${rec.id}" is being written`);
      if (state !== 'ready') return invalid(`draft "${rec.id}" is not ready`);
      const { problems, name } = draftTextProblems(rec.manifest, rec.fragment);
      if (problems.length) return invalid(problems.join('\n'));
      if (db.parts[name]) return err(409, 'conflict', `a part named "${name}" already exists in your parts folder: change the name by editing the draft`);
      const manifest = JSON.parse(rec.manifest);
      const part = { name, description: manifest.description ?? rec.request, levels: LEVELS, cost_ms: 60, source: 'user', ...(manifest.verse === 'own' ? { verse: 'own' } : {}), ...(manifest.hit === 'own' ? { hit: 'own' } : {}), ...(manifest.scene ? { scene: manifest.scene } : {}), params: [] };
      db.parts[name] = part;
      db.partTexts[name] = { manifest: rec.manifest, fragment: rec.fragment };
      delete db.drafts[rec.id];
      save();
      return [200, part];
    },
    'GET /api/music-motion/part-drafts/{id}/preview/{name}': ({ params }) => {
      const rec = db.drafts[params.id];
      if (!rec) return err(404, 'not_found', `draft "${params.id}" not found`);
      if (!draftView(rec, false).preview.includes(params.name)) return err(404, 'not_found', `preview "${params.name}" not found`);
      return [200, readFileSync(resolve(here, 'assets/placeholder.png')), 'image/png'];
    },

    'GET /api/music-motion/references': () => [200, { references: Object.values(db.references).sort(newest).map(referenceView) }],
    'POST /api/music-motion/references': ({ body }) => {
      let input;
      if (body?.buffer) {
        const form = parseMultipart(body.buffer, body.type, 'file');
        if (!form) return err(400, 'invalid_request', 'invalid multipart body');
        if (!form.image) return invalid('the form needs the video in the file field');
        if (!form.image.contentType.startsWith('video/')) return invalid(`${form.image.filename || 'the file'} is not a video`);
        let tags;
        try {
          tags = form.fields.tags === undefined ? undefined : form.fields.tags.trim().startsWith('[') ? JSON.parse(form.fields.tags) : form.fields.tags.split(',').map((t) => t.trim()).filter(Boolean);
        } catch {
          return err(400, 'invalid_request', 'tags is not a JSON list');
        }
        input = { title: form.fields.title, notes: form.fields.notes, tags, fileName: form.image.filename };
      } else {
        const bad = body422(body);
        if (bad) return bad;
        if (typeof body.url !== 'string' || !body.url.trim()) return invalid('the request needs a YouTube address (url) or a video file');
        if (!YOUTUBE.test(body.url.trim())) return invalid(`${body.url} is not a YouTube address`);
        if (/noytdlp/i.test(body.url)) return err(503, 'unavailable', 'yt-dlp is not installed on this machine');
        if (/long/i.test(body.url)) return invalid('the video lasts more than 20 minutes');
        input = { title: body.title, notes: body.notes, tags: body.tags, url: body.url.trim() };
      }
      const why = referenceProblem(input);
      if (why) return invalid(why);
      const id = `ref-${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
      const kind = input.url && /nodesc/i.test(input.url) ? 'nodesc' : input.url && /broken/i.test(input.url) ? 'broken' : input.url && /dark/i.test(input.url) ? 'dark' : 'ok';
      const rec = { id, title: input.title?.trim() || (input.url ? `Video ${Object.keys(db.references).length + 1}` : input.fileName), notes: input.notes ?? '', tags: input.tags ?? [], created_at: ts(), kind, ...(input.url ? { source: input.url } : {}) };
      db.references[id] = rec;
      save();
      return [202, referenceView(rec)];
    },
    'GET /api/music-motion/references/{id}': ({ params }) => {
      const rec = db.references[params.id];
      return rec ? [200, referenceView(rec)] : err(404, 'not_found', `reference "${params.id}" not found`);
    },
    'PATCH /api/music-motion/references/{id}': ({ params, body }) => {
      const rec = db.references[params.id];
      if (!rec) return err(404, 'not_found', `reference "${params.id}" not found`);
      const bad = body422(body);
      if (bad) return bad;
      const why = referenceProblem(body);
      if (why) return invalid(why);
      if (body.title !== undefined) rec.title = body.title.trim();
      if (body.notes !== undefined) rec.notes = body.notes;
      if (body.tags !== undefined) rec.tags = body.tags;
      save();
      return [200, referenceView(rec)];
    },
    'DELETE /api/music-motion/references/{id}': ({ params }) => {
      if (!db.references[params.id]) return err(404, 'not_found', `reference "${params.id}" not found`);
      delete db.references[params.id];
      save();
      return [204];
    },
    // A placeholder: the mock has only one small picture (a PNG) and answers it as the JPEG the contract describes; a browser shows it.
    'GET /api/music-motion/references/{id}/frames/{name}': ({ params }) => {
      const rec = db.references[params.id];
      if (!rec) return err(404, 'not_found', `reference "${params.id}" not found`);
      if (!analysisOf(rec.kind).frames.includes(params.name)) return err(404, 'not_found', `frame "${params.name}" not found`);
      return [200, readFileSync(resolve(here, 'assets/placeholder.png')), 'image/jpeg'];
    },

    'GET /api/music-motion/presets': () => [200, { presets: Object.values(db.presets).sort(newest) }],
    'POST /api/music-motion/presets': ({ body }) => {
      const bad = body422(body);
      if (bad) return bad;
      const rec = typeof body.reference_id === 'string' ? db.references[body.reference_id] : undefined;
      if (!rec) return invalid(`reference ${JSON.stringify(body.reference_id)} does not exist`);
      const reference = referenceView(rec);
      if (reference.state !== 'ready') return invalid(`reference "${rec.id}" is not ready: it is ${reference.state}`);
      const id = `preset-${ts().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
      const preset = presetFrom(reference, typeof body.name === 'string' && body.name.trim() ? body.name.trim() : rec.title, id, ts());
      db.presets[id] = preset;
      save();
      return [201, preset];
    },
    'GET /api/music-motion/presets/{id}': ({ params }) => (db.presets[params.id] ? [200, db.presets[params.id]] : err(404, 'not_found', `preset "${params.id}" not found`)),
    'PUT /api/music-motion/presets/{id}': ({ params, body }) => {
      const preset = db.presets[params.id];
      if (!preset) return err(404, 'not_found', `preset "${params.id}" not found`);
      const bad = body422(body);
      if (bad) return bad;
      const why = presetProblem(body);
      if (why) return invalid(why);
      db.presets[params.id] = { ...preset, name: body.name.trim(), design: body.design, rhythm: body.rhythm, parts: body.parts };
      save();
      return [200, db.presets[params.id]];
    },
    'DELETE /api/music-motion/presets/{id}': ({ params }) => {
      if (!db.presets[params.id]) return err(404, 'not_found', `preset "${params.id}" not found`);
      delete db.presets[params.id];
      save();
      return [204];
    },

    'POST /api/music-motion/pieces/{id}/transcribe': ({ params }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (busy(rec)) return drawing(rec.id);
      const song = songOf(rec);
      if (song && NO_WHISPER(song)) return err(503, 'unavailable', 'whisper-cli is not installed on this machine');
      // A song with no words: the piece comes back as it was, with the note.
      if (song?.instrumental) return [200, { ...view(rec, true), words_note: 'no words were heard in the song: the piece stays as it was' }];
      const script_warning = hear(rec);
      save();
      return [200, { ...view(rec, true), ...(script_warning ? { script_warning } : {}) }];
    },
    'POST /api/music-motion/pieces/{id}/propose': ({ params, body }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      const bad = body422(body);
      if (bad) return bad;
      if (busy(rec)) return drawing(rec.id);
      if (proposing(rec)) return proposalBusy(rec.id);
      if (!['design', 'script', 'all'].includes(body.what)) return invalid('what must be design, script or all');
      const badPrompt = promptProblem(body.prompt);
      if (badPrompt) return invalid(badPrompt);
      if (body.model !== undefined && !MOCK_MODELS.models.some((m) => m.name === body.model)) return invalid(`model ${JSON.stringify(body.model)} is not installed: ${MOCK_MODELS.models.map((m) => m.name).join(', ')}`);
      // A prompt sent with a proposal replaces the one kept with the piece.
      if (body.prompt !== undefined) {
        if (body.prompt) rec.prompt = body.prompt;
        else delete rec.prompt;
      }
      const reason = NO_ASSISTANT + (rec.prompt ? ' The fixed rule does not read the prompt.' : '');
      if (body.what === 'all' || body.async === true) {
        // Always written in the background; the mock only has the fixed rule, so it ends with the reason.
        rec.proposal = { started_at: new Date().toISOString(), model: body.model ?? MOCK_MODELS.default, wait_ms: 0, write_ms: step * 3, reason, applied: false };
        save();
        return [202, proposalOf(rec)];
      }
      // With a provider named the mock plays the assistant; without one it is the fixed rule, which is not an error.
      const source = body.provider ? 'assistant' : 'fallback';
      const named = { ...(body.model ? { model: body.model } : {}), ...(source === 'fallback' ? { fallback_reason: reason } : {}) };
      if (body.what === 'design') {
        const palette = PALETTES.find((p) => p.dark !== rec.design.design.dark) ?? PALETTES[0];
        rec.design = { design: palette, source, edited: false };
        save();
        return [200, { what: 'design', source, ...named, design: rec.design }];
      }
      rec.script = scriptOf(rec.song_map, rec.level, rec.design.design);
      rec.script_source = source;
      save();
      return [200, { what: 'script', source, ...named, script: rec.script, replacements: [] }];
    },
    // A drawing from a description: the mock picks one by a word (circle, bars, logo, else a square); `refuse` and `noassistant` play the failures.
    'POST /api/assist/svg': ({ body }) => {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return err(400, 'invalid_request', 'the text is empty');
      if ([...text].length > 2000) return err(400, 'invalid_request', 'the text is longer than 2000 characters');
      if (body.model !== undefined && !MOCK_MODELS.models.some((m) => m.name === body.model)) return err(503, 'unavailable', `the model ${JSON.stringify(body.model)} is not installed in Ollama`);
      if (/noassistant/i.test(text)) return err(503, 'unavailable', 'Ollama is not responding');
      if (/refuse/i.test(text)) return err(422, 'assist_refused', `${body.model ?? MOCK_MODELS.default} refused to write this text. The refusal comes from the model, not from the application`);
      if (/notsvg/i.test(text)) return err(422, 'validation_failed', 'the model did not write a usable SVG: the reply has no <svg> element');
      const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">';
      const drawing = /circle|círculo|circulo|ring/i.test(text)
        ? `${open}<circle id="ring" cx="960" cy="540" r="260" fill="none" stroke="#7fd1a8" stroke-width="24"/><circle id="dot" cx="960" cy="540" r="60" fill="#7fd1a8"/></svg>`
        : /bars|barras/i.test(text)
          ? `${open}<g id="bars">${[0, 1, 2, 3, 4].map((i) => `<rect id="bar-${i + 1}" x="${560 + i * 160}" y="${700 - (i % 3) * 120}" width="100" height="${240 + (i % 3) * 120}" fill="#7fd1a8"/>`).join('')}</g></svg>`
          : /logo/i.test(text)
            ? `${open}<g id="logo"><path id="mark" d="M760 700 L960 340 L1160 700 Z" fill="#7fd1a8"/><rect id="base" x="760" y="740" width="400" height="36" fill="#e6f3ec"/></g></svg>`
            : `${open}<rect id="square" x="710" y="290" width="500" height="500" fill="#7fd1a8"/></svg>`;
      return [200, { svg: drawing, ...(body.model !== undefined ? { model: body.model } : {}) }];
    },
    // The installed models of the assistant: the mock has two, one of which does not fit the memory rule.
    'GET /api/assist/models': () => [200, MOCK_MODELS],
    'POST /api/music-motion/pieces/{id}/scenes': ({ params, body }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (busy(rec)) return drawing(rec.id);
      if (proposing(rec)) return proposalBusy(rec.id);
      if (rec.batch && batchOf(rec).state === 'writing') return err(409, 'conflict', `piece "${rec.id}" is writing a batch of scenes: wait for it to end or stop it`);
      if (!rec.script?.pieces?.length) return invalid(`piece "${rec.id}" has no script`);
      const input = body && typeof body === 'object' ? body : {};
      const wanted = Array.isArray(input.script_pieces) && input.script_pieces.length ? input.script_pieces : rec.script.pieces.map((q) => q.id);
      const missing = wanted.find((w) => !rec.script.pieces.some((q) => q.id === w));
      if (missing) return err(404, 'not_found', `piece "${rec.id}" has no script piece "${missing}"`);
      if (input.brief_mode !== undefined && !['metaphor', 'literal'].includes(input.brief_mode)) return invalid('brief_mode is metaphor or literal');
      const model = typeof input.model === 'string' ? input.model.trim() : '';
      if (model && !MOCK_MODELS.models.some((m) => m.name === model)) return invalid(`the model ${JSON.stringify(model)} is not installed`);
      const started = Date.now();
      const items = wanted.map((id, i) => {
        const q = rec.script.pieces.find((x) => x.id === id);
        const brief = input.brief_mode === 'literal' ? (q.lines ?? []).map((l) => l.text).join(' ').slice(0, MAX_REQUEST) : '';
        return { script_piece: id, draft_id: makeSceneDraft(rec, q, brief, started + i * step * 4, model, input.review).id };
      });
      rec.batch = { started_at: new Date(started).toISOString(), brief_mode: input.brief_mode ?? 'metaphor', ...(model ? { model } : {}), ...(sceneReviewAsk(input.review) ? { review: sceneReviewAsk(input.review) } : {}), items };
      save();
      return [202, batchOf(rec)];
    },
    'DELETE /api/music-motion/pieces/{id}/scenes': ({ params }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (!rec.batch) return err(404, 'not_found', `piece "${rec.id}" has no batch of scenes`);
      rec.batch.cancelled_at ??= ts();
      save();
      return [202, batchOf(rec)];
    },
    'POST /api/music-motion/pieces/{id}/scenes/approve': ({ params }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (!rec.batch) return err(404, 'not_found', `piece "${rec.id}" has no batch of scenes`);
      const batch = batchOf(rec);
      if (batch.state === 'writing') return err(409, 'conflict', `the batch of piece "${rec.id}" is still being written`);
      const gone = batch.drafts.find((d) => !rec.script.pieces.some((q) => q.id === d.script_piece));
      if (gone) return invalid(`script piece "${gone.script_piece}" is not in the script any more: the scenes were written for another one`);
      const approved = [];
      const notApproved = [];
      const pieces = rec.script.pieces.map((q) => ({ ...q }));
      for (const d of batch.drafts) {
        if (d.state !== 'ready') {
          if (d.state !== 'approved' && d.state !== 'pending') notApproved.push({ script_piece: d.script_piece, draft_id: d.draft_id, state: d.state, ...(d.error ? { error: d.error } : {}) });
          continue;
        }
        const draft = db.drafts[d.draft_id];
        const manifest = JSON.parse(draft.manifest);
        const part = { name: manifest.name, description: manifest.description ?? '', levels: LEVELS, cost_ms: 60, source: 'user', verse: 'own', scene: manifest.scene, params: [] };
        db.parts[part.name] = part;
        db.partTexts[part.name] = { manifest: draft.manifest, fragment: draft.fragment };
        delete db.drafts[d.draft_id];
        const target = pieces.find((q) => q.id === d.script_piece);
        target.part = part.name;
        delete target.params;
        delete target.animate;
        approved.push({ script_piece: d.script_piece, part: part.name, draft_id: d.draft_id });
      }
      rec.script = { ...rec.script, pieces };
      rec.script_source = 'user';
      save();
      return [200, { approved, not_approved: notApproved, script: rec.script }];
    },
    'POST /api/music-motion/pieces/{id}/review': ({ params }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (busy(rec)) return drawing(rec.id);
      if (proposing(rec)) return proposalBusy(rec.id);
      if (rec.review && reviewOf(rec).state === 'running') return err(409, 'conflict', `piece "${rec.id}" is being reviewed`);
      if (rec.batch && batchOf(rec).state === 'writing') return err(409, 'conflict', `piece "${rec.id}" is writing a batch of scenes`);
      if (!rec.script?.pieces?.length) return invalid(`piece "${rec.id}" has no script`);
      rec.review = { started_at: ts(), model: 'gemma4:26b' };
      save();
      return [202, reviewOf(rec)];
    },
    'POST /api/music-motion/pieces/{id}/render': ({ params }) => {
      const rec = find(params);
      if (!rec) return notFound(params.id);
      if (busy(rec)) return drawing(rec.id);
      const why = scriptProblem(rec.script, rec.song_map, rec.level, rec.design.design, allParts());
      if (why) return invalid(why);
      rec.rendered_at = ts();
      rec.run_id = `run-mock-mm-${Object.keys(db.pieces).length}${randomBytes(2).toString('hex')}`;
      save();
      return [202, { run_id: rec.run_id, estimate: estimateOf(rec) }];
    },
  };
}
