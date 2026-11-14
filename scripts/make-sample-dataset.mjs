#!/usr/bin/env node
// Writes the dataset of the animation screens (libs/music-motion/sample/sample.json) from the compact, themed descriptors below.
// Nothing is random: running it twice writes the same file. The facts of the video (its length, size and dimensions) are kept from
// the file already there; `npm run sample:sync` refreshes them after the video is replaced.
//
//   node scripts/make-sample-dataset.mjs      (or: npm run sample:dataset)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DATASET_FILE = resolve(here, '../libs/music-motion/sample/sample.json');

const SONGS = [
  { project: 'sample-beat', trackId: 'track-1', variant: 0, title: 'Sample Beat', bpm: 96, instrumental: false, lines: [['A beat is all it takes', 'To make the picture move'], ['Light on the one', 'Colour on the two']] },
  { project: 'sample-beat', trackId: 'track-1', variant: 1, title: 'Sample Beat (instrumental)', bpm: 96, instrumental: true, lines: [] },
  { project: 'neon-drive', trackId: 'track-1', variant: 0, title: 'Neon Drive', bpm: 120, instrumental: false, lines: [['Streetlights bleeding red', 'Engines hum ahead'], ['Take the long way home', 'Never feel alone']] },
  { project: 'paper-boats', trackId: 'track-1', variant: 0, title: 'Paper Boats', bpm: 84, instrumental: false, lines: [['Fold the evening small', 'Let the river call'], ['Float away with me', 'Down to the quiet sea']] },
];

// One piece per row: [song index, level, style, fps, resolution, state, failure]. The first is the sample's own piece.
const PIECES = [
  [0, 'medium', 'typographic', 30, '1280x720', 'done'],
  [2, 'advanced', 'typographic', 60, '1280x720', 'done'],
  [3, 'simple', 'typographic', 30, '1280x720', 'done'],
  [0, 'advanced', 'illustrated', 24, '1280x720', 'done'],
  [2, 'medium', 'illustrated', 24, '1920x1080', 'done'],
  [3, 'medium', 'typographic', 24, '1280x720', 'done'],
  [1, 'simple', 'typographic', 30, '1280x720', 'done'],
  [2, 'simple', 'typographic', 30, '1920x1080', 'done'],
  [3, 'advanced', 'illustrated', 30, '1280x720', 'done'],
  [0, 'simple', 'typographic', 30, '1280x720', 'draft'],
  [2, 'medium', 'typographic', 30, '1280x720', 'draft'],
  [1, 'medium', 'illustrated', 24, '1280x720', 'draft'],
  [3, 'advanced', 'typographic', 60, '1920x1080', 'failed', 'the render ran out of memory: try a lower resolution or a simpler level'],
  [2, 'advanced', 'illustrated', 60, '1920x1080', 'failed', 'the render was interrupted: the machine was restarted'],
];

const REFERENCES = [
  ['Neon city at night', 'Wet streets, pink and cyan signs, slow camera.', ['city', 'neon']],
  ['Typography on a beat', 'Big words that land on the kick.', ['type', 'fast']],
  ['Paper cut-out forest', 'Layered paper, warm light, gentle parallax.', ['paper', 'calm']],
  ['Old terminal boot', 'Green text on black, glitches at the cuts.', ['retro', 'terminal']],
  ['Sunrise timelapse', 'Orange to blue, long shots, no cuts.', ['nature', 'calm']],
  ['Pop art collage', 'Halftone dots, flat colours, jump cuts.', ['pop', 'collage']],
  ['Ink in water', 'Slow dark clouds of colour.', ['abstract', 'slow']],
  ['Road trip dashboard', 'Night driving, instruments glowing.', ['car', 'night']],
  ['Hand-drawn doodles', 'Quick sketches that redraw themselves.', ['doodle', 'light']],
  ['Glass and light', 'Prisms, bokeh and soft flares.', ['glass', 'light']],
  ['Retro grid sunset', 'Striped sun over a moving grid.', ['synthwave', 'retro']],
  ['Rain on a window', 'Drops running down, city lights out of focus.', ['rain', 'calm']],
];

const STYLES = [
  ['Neon night', 0],
  ['Paper calm', 2],
  ['Retro terminal', 3],
  ['Pop collage', 5],
];

const LEVELS = ['simple', 'medium', 'advanced'];

/**
 * The three own parts of the sample, with the text a part has: `manifest` (what `manifest.json` says) and `fragment` (`part.html`).
 * They follow the part contract: read `window.__params`, define `window.__partSeek(t, beat)` as a pure function of time, draw with the
 * design's CSS variables, no wall clock, no random numbers, nothing loaded from outside. They are this repository's own test parts.
 */
const PARTS = [
  {
    name: 'confetti-burst',
    description: 'Confetti that bursts from the bottom on the loud beats',
    cost_ms: 60,
    params: [
      { name: 'count', type: 'int', default: '24', min: 4, max: 60 },
      { name: 'spread', type: 'number', default: '1', min: 0.2, max: 2 },
    ],
    fragment: `<style>#cb{position:absolute;inset:0;overflow:hidden}#cb i{position:absolute;bottom:0;width:1.2%;height:2.4%;background:var(--accent);opacity:0}#cb i:nth-child(3n){background:var(--fg)}</style>
<div id="cb"></div>
<script>
(function () {
  var p = window.__params || {};
  var count = Math.max(4, Math.min(60, parseInt(p.count, 10) || 24));
  var spread = Number(p.spread) || 1;
  var root = document.getElementById('cb');
  var bits = [];
  for (var i = 0; i < count; i++) {
    var el = document.createElement('i');
    root.appendChild(el);
    bits.push({ el: el, x: ((i * 37) % 100) / 100, v: 0.5 + ((i * 53) % 50) / 100, d: ((i * 29) % 100) / 100 - 0.5 });
  }
  window.__partSeek = function (t, beat) {
    var n = beat && beat.number >= 0 ? beat.number : 0;
    var pos = beat && beat.position ? beat.position : 0;
    var age = pos + (n % 4 === 0 ? 0 : 1);
    bits.forEach(function (b) {
      var life = age / 2;
      var up = Math.sin(Math.min(1, life) * Math.PI) * 70 * b.v;
      b.el.style.left = (b.x * 100 + b.d * 30 * spread * life) + '%';
      b.el.style.bottom = up + '%';
      b.el.style.opacity = life < 1 ? 1 - life * 0.6 : 0;
      b.el.style.transform = 'rotate(' + Math.round(life * 360 * b.d) + 'deg)';
    });
  };
})();
</script>`,
  },
  {
    name: 'ticker-tape',
    description: 'A strip of words that scrolls along the bottom of the frame',
    cost_ms: 50,
    params: [
      { name: 'text', type: 'string', default: 'LIVE • ON AIR • LIVE •', max_length: 60 },
      { name: 'speed', type: 'number', default: '1', min: 0.25, max: 4 },
    ],
    fragment: `<style>#tt{position:absolute;left:0;right:0;bottom:6%;height:9%;overflow:hidden;background:var(--accent);color:var(--bg);font-family:var(--display);white-space:nowrap}#tt span{position:absolute;top:0;line-height:2.4;font-size:3.4vh;letter-spacing:.1em}</style>
<div id="tt"><span id="tt-run"></span></div>
<script>
(function () {
  var p = window.__params || {};
  var text = String(p.text || 'LIVE • ON AIR • LIVE •');
  var speed = Number(p.speed) || 1;
  var run = document.getElementById('tt-run');
  run.textContent = text + '  ' + text + '  ' + text;
  window.__partSeek = function (t) {
    var width = run.scrollWidth / 3 || 1;
    run.style.left = (-((t * 120 * speed) % width)) + 'px';
  };
})();
</script>`,
  },
  {
    name: 'pulse-ring',
    description: 'Rings that expand from the centre on every beat',
    cost_ms: 55,
    params: [
      { name: 'rings', type: 'int', default: '3', min: 1, max: 6 },
      { name: 'weight', type: 'number', default: '1', min: 0.5, max: 3 },
    ],
    fragment: `<style>#pr{position:absolute;inset:0}#pr b{position:absolute;left:50%;top:50%;border:solid var(--accent);border-radius:50%;transform:translate(-50%,-50%);box-sizing:border-box}</style>
<div id="pr"></div>
<script>
(function () {
  var p = window.__params || {};
  var rings = Math.max(1, Math.min(6, parseInt(p.rings, 10) || 3));
  var weight = Number(p.weight) || 1;
  var root = document.getElementById('pr');
  var els = [];
  for (var i = 0; i < rings; i++) { var b = document.createElement('b'); root.appendChild(b); els.push(b); }
  window.__partSeek = function (t, beat) {
    var pos = beat && beat.position ? beat.position : 0;
    els.forEach(function (el, i) {
      var life = (pos + i / rings) % 1;
      var size = 8 + life * 70;
      el.style.width = size + 'vmin';
      el.style.height = size + 'vmin';
      el.style.borderWidth = (0.6 * weight * (1 - life)) + 'vmin';
      el.style.opacity = 1 - life;
    });
  };
})();
</script>`,
  },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The dataset: the lists written out from the descriptors above, with the facts of the video the file already carries. */
export function buildDataset(video) {
  const songs = SONGS.map((s) => ({
    project: s.project,
    trackId: s.trackId,
    variant: s.variant,
    title: s.title,
    seconds: video.seconds,
    bpm: s.bpm,
    instrumental: s.instrumental,
    lyrics: s.instrumental ? '' : `[Verse]\n${s.lines[0].join('\n')}\n\n[Chorus]\n${s.lines[1].join('\n')}`,
  }));
  const pieces = PIECES.map(([song, level, style, fps, resolution, state, error], i) => ({
    id: i === 0 ? 'sample-piece' : `sample-piece-${i + 1}`,
    song: { project: SONGS[song].project, trackId: SONGS[song].trackId, variant: SONGS[song].variant },
    level,
    style,
    fps,
    resolution,
    state,
    ...(error ? { error } : {}),
  }));
  const references = REFERENCES.map(([title, notes, tags], i) => ({
    id: i === 0 ? 'sample-reference' : `sample-reference-${i + 1}`,
    title,
    notes,
    tags,
    source: `https://www.youtube.com/watch?v=sample-ref-${slug(title)}`,
  }));
  const presets = STYLES.map(([name, ref], i) => ({ id: i === 0 ? 'sample-style' : `sample-style-${i + 1}`, name, referenceId: references[ref].id }));
  const parts = PARTS.map(({ name, description, cost_ms, params, fragment }) => ({ name, description, manifest: { name, description, version: 1, cost_ms, levels: LEVELS, params }, fragment }));
  return { songs, pieces, references, presets, parts, video };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const kept = JSON.parse(readFileSync(DATASET_FILE, 'utf8')).video;
  const data = buildDataset(kept);
  writeFileSync(DATASET_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`sample.json: ${data.songs.length} songs, ${data.pieces.length} pieces, ${data.references.length} references, ${data.presets.length} styles, ${data.parts.length} parts`);
}
