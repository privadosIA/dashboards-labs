// The video track of a music-motion script, as the contract describes it: items `{id, clip, start, end, clip_start?, clip_end?, clip_speed?, scrim?, transition_seconds?}` in seconds of the song,
// in order and without overlapping, under the pieces. The pure parts of the mock's answer: the shorthand `background` of a piece turned into an item, the checks the server makes with `422`,
// cut and join, the preview's list of the track, `verse_layout`, and the pictures of a clip (a strip and one frame) made without any tool.
import { deflateSync } from 'node:zlib';

export const MAX_ITEMS = 64;
export const SCRIM_MAX = 0.8;
export const SCRIM_DEFAULT = 0.3;
const ID = /^[a-z0-9-]+$/;
const EPS = 1e-6;
const err = (status, code, message) => [status, { error: { code, message } }];
const round = (n) => Math.round(n * 1e6) / 1e6;

export const POSITIONS = ['top', 'center', 'bottom'];
export const ALIGNS = ['left', 'center', 'right'];

/** The reason a `verse_layout` is refused (`422`, naming the field), or ''. */
export function verseLayoutProblem(layout, where = 'verse_layout') {
  if (layout === undefined) return '';
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return `${where} must be an object`;
  if (layout.position !== undefined && !POSITIONS.includes(layout.position)) return `${where}.position must be one of ${POSITIONS.join(', ')}`;
  if (layout.align !== undefined && !ALIGNS.includes(layout.align)) return `${where}.align must be one of ${ALIGNS.join(', ')}`;
  if (layout.scale !== undefined && !(typeof layout.scale === 'number' && layout.scale >= 0.6 && layout.scale <= 1.6)) return `${where}.scale must be a number from 0.6 to 1.6`;
  return '';
}

/** The pieces of the saved script that play clip `name`: the ones an item of that clip touches. */
export function playedBy(script, name) {
  const plays = (script?.video ?? []).filter((it) => it.clip === name);
  return (script?.pieces ?? []).filter((p) => plays.some((it) => it.start < p.end - EPS && it.end > p.start + EPS)).map((p) => p.id);
}

/**
 * A piece's `background` is a shorthand: it becomes the item `bg-<piece id>` over that piece when the script is saved, and the script never returns it. The script is returned as it came
 * when no piece has one.
 */
export function normalise(script) {
  if (!script || !Array.isArray(script.pieces) || !script.pieces.some((p) => p && typeof p === 'object' && p.background !== undefined)) return script;
  const made = [];
  const pieces = script.pieces.map((p) => {
    if (!p || typeof p !== 'object' || p.background === undefined) return p;
    const { background: b, ...rest } = p;
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      const { clip, ...fields } = b;
      made.push({ id: `bg-${p.id}`, clip, start: p.start, end: p.end, ...fields });
    }
    return rest;
  });
  return { ...script, pieces, video: [...(Array.isArray(script.video) ? script.video : []), ...made].sort((a, b) => a.start - b.start) };
}

/** What the track of a script is refused for (`422`, naming the item or the piece and the part), or ''. `parts` is the catalog; `files` what the piece keeps; `duration` the song's length. */
export function trackProblem(script, duration, parts, files) {
  const video = script.video;
  if (video === undefined) return '';
  if (!Array.isArray(video)) return 'video must be a list';
  if (video.length > MAX_ITEMS) return `video: at most ${MAX_ITEMS} items`;
  const seen = new Set();
  let before = null;
  for (const it of video) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return 'video: every item must be an object';
    const at = `video item "${it.id}"`;
    if (typeof it.id !== 'string' || !ID.test(it.id)) return `${at}: the id may have only lower case letters, digits and dashes`;
    if (seen.has(it.id)) return `${at}: the id is repeated`;
    seen.add(it.id);
    if (typeof it.clip !== 'string' || !it.clip) return `${at}: clip is needed`;
    const file = files[it.clip];
    if (!file) return `${at}: the piece does not keep a video named "${it.clip}"`;
    for (const k of ['start', 'end', 'clip_start', 'clip_end', 'clip_speed', 'scrim', 'transition_seconds']) if (it[k] !== undefined && typeof it[k] !== 'number') return `${at}: ${k} must be a number`;
    if (typeof it.start !== 'number' || typeof it.end !== 'number' || !(it.start >= 0) || !(it.end > it.start)) return `${at}: it must start at 0 or later and end after it starts`;
    if (it.end > duration + 0.01) return `${at}: it ends after the song does (${duration} s)`;
    if (it.clip_start !== undefined && it.clip_start < 0) return `${at}: clip_start is below 0`;
    if (it.clip_start !== undefined && it.clip_start >= file.seconds) return `${at}: clip_start ${it.clip_start} is past the end of ${it.clip} (${file.seconds} s)`;
    if (it.clip_end !== undefined && it.clip_end <= (it.clip_start ?? 0)) return `${at}: clip_end must be after clip_start`;
    if (it.clip_speed !== undefined && !(it.clip_speed >= 0.25 && it.clip_speed <= 4)) return `${at}: clip_speed is not between 0.25 and 4`;
    if (it.scrim !== undefined && !(it.scrim >= 0 && it.scrim <= SCRIM_MAX)) return `${at}: scrim is not between 0 and ${SCRIM_MAX}`;
    if (it.transition_seconds !== undefined && it.transition_seconds < 0) return `${at}: transition_seconds is below 0`;
    if (before && it.start < before.start - EPS) return `${at}: the items are out of order`;
    if (before && it.start < before.end - EPS) return `${at}: it overlaps "${before.id}"`;
    before = it;
  }
  const hides = (p, name, what) => {
    const part = parts.find((x) => x.name === name);
    return part && part.over_video !== true ? `"${p.id}": video: the part "${name}" (${what}) is not marked over_video: it can hide the video behind the piece` : '';
  };
  for (const p of script.pieces) {
    if (!video.some((it) => it.start < p.end - EPS && it.end > p.start + EPS)) continue;
    if (p.blender !== undefined) return `"${p.id}": a 3D piece has no video behind it`;
    const main = hides(p, p.part, 'the main part');
    if (main) return main;
    for (const w of p.with ?? []) {
      const why = hides(p, w?.part, 'an extra part (with)');
      if (why) return why;
    }
    for (const layer of script.layers ?? []) {
      for (const item of layer.items ?? []) {
        if (item.start < p.end && item.end > p.start) {
          const why = hides(p, item.part, 'a layer item');
          if (why) return why;
        }
      }
    }
  }
  return '';
}

/** The seconds of the file one second of an item plays: the speed given, or the slowdown that fills the item with the part of the file it plays (at most 2x). */
export function speedOf(it, file) {
  if (it.clip_speed !== undefined) return it.clip_speed;
  const to = it.clip_end !== undefined && it.clip_end < file.seconds ? it.clip_end : file.seconds;
  const part = to - (it.clip_start ?? 0);
  const length = it.end - it.start;
  return part > 0 && length > part ? 1 / Math.min(2, length / part) : 1;
}

const sameId = (a, b) => a === b;

/** Cuts item `item` in two at `at`: the second takes up the clip where the first stops and both keep the speed the whole had. `{script}` or `{refused: [status, body]}`. */
export function splitItem(script, files, item, at, ids) {
  const video = script.video ?? [];
  const it = video.find((x) => x.id === item);
  if (typeof item !== 'string' || typeof at !== 'number') return { refused: err(400, 'invalid_request', 'item and at are needed') };
  if (!it) return { refused: err(404, 'not_found', `the track has no item "${item}"`) };
  if (!(at > it.start + EPS && at < it.end - EPS)) return { refused: err(422, 'validation_failed', `at: ${at} is not inside the item "${item}" (${it.start} to ${it.end} seconds)`) };
  const [a, b] = ids ?? [`${item}-a`, `${item}-b`];
  const others = new Set(video.filter((x) => x.id !== item).map((x) => x.id));
  if (typeof a !== 'string' || typeof b !== 'string' || !ID.test(a) || !ID.test(b) || sameId(a, b) || others.has(a) || others.has(b)) return { refused: err(422, 'validation_failed', `ids: "${a}" and "${b}" must be free, different and of lower case letters, digits and dashes`) };
  const file = files[it.clip] ?? { seconds: 0 };
  const mid = round((it.clip_start ?? 0) + (at - it.start) * speedOf(it, file));
  const { transition_seconds: _fade, ...whole } = it;
  const first = { ...it, id: a, end: at, clip_end: mid };
  const second = { ...whole, id: b, start: at, clip_start: mid };
  return { script: { ...script, video: video.flatMap((x) => (x.id === item ? [first, second] : [x])) } };
}

/** Joins two items that follow each other and touch, play the same clip at the same speed and where the second takes up the file where the first stops. */
export function joinItems(script, files, first, second) {
  const video = script.video ?? [];
  if (typeof first !== 'string' || typeof second !== 'string') return { refused: err(400, 'invalid_request', 'first and second are needed') };
  const i = video.findIndex((x) => x.id === first);
  const j = video.findIndex((x) => x.id === second);
  if (i < 0 || j < 0) return { refused: err(404, 'not_found', `the track has no item "${i < 0 ? first : second}"`) };
  const a = video[i];
  const b = video[j];
  const file = files[a.clip] ?? { seconds: 0 };
  if (j !== i + 1 || Math.abs(a.end - b.start) > EPS) return { refused: err(422, 'validation_failed', `"${first}" and "${second}" do not follow each other and touch`) };
  if (a.clip !== b.clip || Math.abs(speedOf(a, file) - speedOf(b, file)) > EPS) return { refused: err(422, 'validation_failed', `"${first}" and "${second}" do not play the same clip at the same speed`) };
  const stops = a.clip_end ?? (a.clip_start ?? 0) + (a.end - a.start) * speedOf(a, file);
  if (Math.abs((b.clip_start ?? 0) - stops) > 1e-3) return { refused: err(422, 'validation_failed', `"${second}" does not take up the clip where "${first}" stops`) };
  const { clip_end: _stops, ...rest } = a;
  const joined = { ...rest, end: b.end, ...(b.clip_end !== undefined ? { clip_end: b.clip_end } : {}) };
  return { script: { ...script, video: video.flatMap((x, n) => (n === i ? [joined] : n === j ? [] : [x])) } };
}

/** The ids of the pieces an item of the track touches: their pages are drawn on a transparent background (`layer`). */
export function layerPieces(script) {
  const video = script.video ?? [];
  return new Set((script.pieces ?? []).filter((p) => video.some((it) => it.start < p.end - EPS && it.end > p.start + EPS)).map((p) => p.id));
}

/** The track as the preview lists it: each item with the file's time mapped (`from`, `to`, `speed`, `repeats`), the crossfade that applies and how long it is built. */
export function previewVideo(script, files, pieceId) {
  const video = script.video ?? [];
  return video.map((it, n) => {
    const file = files[it.clip] ?? { seconds: 0 };
    const from = it.clip_start ?? 0;
    const to = it.clip_end !== undefined && it.clip_end < file.seconds ? it.clip_end : file.seconds;
    const speed = speedOf(it, file);
    const before = video[n - 1];
    const next = video[n + 1];
    const touches = before && Math.abs(before.end - it.start) < EPS;
    const fade = touches ? Math.min(it.transition_seconds ?? 0, it.end - it.start, before.end - before.start) : 0;
    const nextTouches = next && Math.abs(it.end - next.start) < EPS;
    const nextFade = nextTouches ? Math.min(next.transition_seconds ?? 0, next.end - next.start, it.end - it.start) : 0;
    return {
      id: it.id,
      clip: it.clip,
      url: `/api/music-motion/pieces/${pieceId}/backgrounds/${it.clip}/file`,
      media_type: 'video/mp4',
      file_seconds: file.seconds,
      start: it.start,
      end: it.end,
      build_seconds: round(it.end - it.start + nextFade),
      scrim: it.scrim ?? SCRIM_DEFAULT,
      transition_seconds: fade,
      from,
      to,
      speed: round(speed),
      repeats: (it.end - it.start) * speed > to - from + EPS,
    };
  });
}

// --- pictures --------------------------------------------------------------------------------------------------------------------------------------

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

/** A PNG (8-bit RGB) of `width` x `height` whose pixel at `(x, y)` is `pixel(x, y)` as `[r, g, b]`. */
export function png(width, height, pixel) {
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const at = y * row + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

const shade = (hue, y, height) => {
  const k = 0.55 + 0.35 * (1 - y / Math.max(1, height - 1));
  const c = (o) => Math.round(255 * k * (0.5 + 0.5 * Math.sin(hue + o)));
  return [c(0), c(2.1), c(4.2)];
};

/** The strip of a clip: `count` pictures side by side, each `height` high and as wide as the clip's shape gives, the colour changing along the file so that each picture can be told. */
export function thumbsStrip(count, height, shape) {
  const width = Math.max(1, Math.round((height * shape.width) / shape.height));
  const image = png(width * count, height, (x, y) => shade((Math.floor(x / width) / Math.max(1, count)) * Math.PI * 2, y, height));
  return { image, count, width };
}

/** One picture of a clip at second `t`: `width` pixels wide and as tall as the clip's shape gives. */
export function framePicture(t, width, shape, seconds) {
  const height = Math.max(1, Math.round((width * shape.height) / shape.width));
  return png(width, height, (_x, y) => shade((t / Math.max(0.001, seconds)) * Math.PI * 2, y, height));
}
