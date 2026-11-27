// The video track of a music-motion script, as the mock simulates it, checked against the contract: items kept and checked with the server's refusals, cut and join,
// the strip and the frame of a clip, the preview's list of the track, and `verse_layout`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { closeObjects } from './strict.mjs';
import { startMock } from './testkit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spec = closeObjects(yaml.load(readFileSync(process.env.SPEC ?? resolve(here, '../contract/openapi.yaml'), 'utf8')));
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
const deref = (s) => {
  for (let i = 0; s?.$ref && i < 20; i++) s = s.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec);
  return s;
};
const fits = (path, method, status, body) => {
  const schema = deref(spec.paths[path][method].responses[String(status)])?.content?.['application/json']?.schema;
  assert.ok(schema, `${method} ${path} has no JSON ${status} response in the contract`);
  const validate = ajv.compile({ ...schema, components: spec.components });
  assert.ok(validate(body), `${method.toUpperCase()} ${path} ${status}: ${ajv.errorsText(validate.errors, { dataVar: '' })}`);
};
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const P = '/api/music-motion/pieces';
const SONG = { project: 'demo-musica', track_id: 'track-1', variant: 0 };
/** An MP4 as far as the mock can tell: `ftyp` at the fourth byte. */
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
const upload = (mock, id, name, body = MP4, query = '') => fetch(`${mock.base}${P}/${id}/backgrounds/${name}${query}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body });

async function open(env = {}) {
  const mock = await startMock({ env: { MOCK_SAMPLE: 'off', ...env }, args: ['--speed', '200'] });
  const made = await mock.json('POST', P, SONG);
  return { mock, id: made.body.id, piece: made.body };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A piece with the clip `a.mp4` (4 s) and the script as the server has it. */
async function withClip() {
  const o = await open();
  assert.equal((await upload(o.mock, o.id, 'a.mp4')).status, 201);
  const duration = o.piece.script.pieces.at(-1).end;
  const put = (video, pieces = o.piece.script.pieces) => o.mock.json('PUT', `${P}/${o.id}/script`, { ...o.piece.script, pieces, ...(video ? { video } : {}) });
  return { ...o, duration, put };
}

test('the catalog lists video-track', async () => {
  const { mock } = await open();
  try {
    const catalog = (await mock.json('GET', '/api/music-motion/catalog')).body;
    assert.ok(catalog.features.includes('video-track'));
  } finally {
    mock.stop();
  }
});

test('a script keeps its track as it came, and a script without one has none', async () => {
  const { mock, id, put, piece } = await withClip();
  try {
    const video = [{ id: 'v1', clip: 'a.mp4', start: 0, end: 4, scrim: 0.5 }, { id: 'v2', clip: 'a.mp4', start: 4, end: 9, clip_start: 1, transition_seconds: 1 }];
    const saved = await put(video);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.video, video);
    fits(`${P}/{id}/script`, 'put', 200, saved.body);
    assert.deepEqual((await mock.json('GET', `${P}/${id}`)).body.script.video, video);
    const bare = await put(undefined);
    assert.equal(bare.status, 200);
    assert.equal('video' in bare.body, false);
    assert.equal(piece.script.video, undefined);
  } finally {
    mock.stop();
  }
});

test('a track is refused (422, naming the item) for a clip the piece does not keep, an item outside the song, overlap, order, an id, values out of range, a part that hides the video and more than 64 items', async () => {
  const { mock, put, piece, duration } = await withClip();
  try {
    const bad = async (video, text, pieces) => {
      const r = await put(video, pieces);
      assert.equal(r.status, 422, JSON.stringify(video));
      assert.ok(r.body.error.message.includes(text), r.body.error.message);
    };
    await bad([{ id: 'v1', clip: 'nope.mp4', start: 0, end: 4 }], 'does not keep a video named "nope.mp4"');
    await bad([{ id: 'v1', clip: 'a.mp4', start: duration - 1, end: duration + 5 }], 'ends after the song does');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 0, end: 5 }, { id: 'v2', clip: 'a.mp4', start: 4, end: 8 }], 'overlaps "v1"');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 5, end: 8 }, { id: 'v2', clip: 'a.mp4', start: 0, end: 4 }], 'out of order');
    await bad([{ id: 'V 1', clip: 'a.mp4', start: 0, end: 4 }], 'lower case letters');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 0, end: 2 }, { id: 'v1', clip: 'a.mp4', start: 2, end: 4 }], 'repeated');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 0, end: 4, clip_start: 9 }], 'past the end');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 0, end: 4, clip_speed: 5 }], 'clip_speed');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 0, end: 4, scrim: 0.9 }], 'scrim');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 0, end: 4, transition_seconds: -1 }], 'transition_seconds');
    await bad([{ id: 'v1', clip: 'a.mp4', start: 0, end: 4 }], '"sunburst"', piece.script.pieces.map((p, n) => (n === 0 ? { ...p, part: 'sunburst', params: {} } : p)));
    await bad(Array.from({ length: 65 }, (_, n) => ({ id: `v${n}`, clip: 'a.mp4', start: n * 0.1, end: n * 0.1 + 0.1 })), 'at most 64');
    assert.equal((await put([{ id: 'v1', clip: 'a.mp4', start: 0, end: 4 }], piece.script.pieces.map((p, n) => (n === 0 ? { ...p, part: 'blank', params: {} } : p)))).status, 200);
  } finally {
    mock.stop();
  }
});

test('the clips say which pieces play them through the track, and one a piece plays is not deleted', async () => {
  const { mock, id, put, piece } = await withClip();
  try {
    const first = piece.script.pieces[0];
    assert.equal((await put([{ id: 'v1', clip: 'a.mp4', start: first.start, end: first.end }])).status, 200);
    const listed = (await mock.json('GET', `${P}/${id}/backgrounds`)).body.backgrounds;
    assert.deepEqual(listed.find((b) => b.name === 'a.mp4').used_by, [first.id]);
    const refused = await mock.json('DELETE', `${P}/${id}/backgrounds/a.mp4`);
    assert.equal(refused.status, 409);
    assert.ok(refused.body.error.message.includes(first.id));
    assert.equal((await put(undefined)).status, 200);
    assert.equal((await mock.json('DELETE', `${P}/${id}/backgrounds/a.mp4`)).status, 204);
  } finally {
    mock.stop();
  }
});

test('an item is cut in two where the second takes up the clip, and the two are joined again', async () => {
  const { mock, id, put } = await withClip();
  try {
    await put([{ id: 'v1', clip: 'a.mp4', start: 0, end: 4 }]);
    const cut = await mock.json('POST', `${P}/${id}/video/split`, { item: 'v1', at: 1 });
    assert.equal(cut.status, 200, JSON.stringify(cut.body));
    fits(`${P}/{id}/video/split`, 'post', 200, cut.body);
    assert.deepEqual(cut.body.video, [{ id: 'v1-a', clip: 'a.mp4', start: 0, end: 1, clip_end: 1 }, { id: 'v1-b', clip: 'a.mp4', start: 1, end: 4, clip_start: 1 }]);
    assert.deepEqual((await mock.json('GET', `${P}/${id}`)).body.script.video.map((i) => i.id), ['v1-a', 'v1-b']);
    const joined = await mock.json('POST', `${P}/${id}/video/join`, { first: 'v1-a', second: 'v1-b' });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    fits(`${P}/{id}/video/join`, 'post', 200, joined.body);
    assert.deepEqual(joined.body.video, [{ id: 'v1-a', clip: 'a.mp4', start: 0, end: 4 }]);
    const named = await mock.json('POST', `${P}/${id}/video/split`, { item: 'v1-a', at: 2, ids: ['left', 'right'] });
    assert.deepEqual(named.body.video.map((i) => i.id), ['left', 'right']);
  } finally {
    mock.stop();
  }
});

test('cut and join refuse as the server does: 422 leaves the script as it was, 404 an unknown item, 400 a body without what it needs', async () => {
  const { mock, id, put } = await withClip();
  try {
    await put([{ id: 'v1', clip: 'a.mp4', start: 0, end: 2 }, { id: 'v2', clip: 'a.mp4', start: 3, end: 5 }]);
    const before = (await mock.json('GET', `${P}/${id}`)).body.script;
    const post = (route, body) => mock.json('POST', `${P}/${id}/video/${route}`, body);
    assert.equal((await post('split', { item: 'v1', at: 2 })).status, 422);
    assert.equal((await post('split', { item: 'v1', at: 1, ids: ['v2', 'x'] })).status, 422);
    assert.equal((await post('split', { item: 'nope', at: 1 })).status, 404);
    assert.equal((await post('split', {})).status, 400);
    assert.equal((await post('join', { first: 'v1', second: 'v2' })).status, 422);
    assert.equal((await post('join', { first: 'v1', second: 'nope' })).status, 404);
    assert.equal((await mock.json('POST', `${P}/nope/video/split`, { item: 'v1', at: 1 })).status, 404);
    assert.deepEqual((await mock.json('GET', `${P}/${id}`)).body.script, before);
  } finally {
    mock.stop();
  }
});

test('the strip of a clip is a PNG with the headers that say how to cut it, and a picture is one frame; the refusals are the contract\'s', async () => {
  const { mock, id } = await withClip();
  try {
    const url = `${mock.base}${P}/${id}/backgrounds/a.mp4`;
    const strip = await fetch(`${url}/thumbs?count=6&height=40`);
    assert.equal(strip.status, 200);
    assert.equal(strip.headers.get('content-type'), 'image/png');
    assert.equal(strip.headers.get('x-frame-count'), '6');
    assert.equal(strip.headers.get('x-frame-width'), '71');
    assert.deepEqual(Buffer.from(await strip.arrayBuffer()).subarray(0, 8), PNG);
    assert.equal((await fetch(`${url}/thumbs`)).headers.get('x-frame-count'), '12');
    assert.equal((await fetch(`${url}/thumbs?count=1`)).status, 422);
    assert.equal((await fetch(`${url}/thumbs?count=61`)).status, 422);
    assert.equal((await fetch(`${url}/thumbs?height=15`)).status, 422);
    assert.equal((await fetch(`${mock.base}${P}/${id}/backgrounds/other.mp4/thumbs`)).status, 404);
    const frame = await fetch(`${url}/frame?t=2&width=320`);
    assert.equal(frame.status, 200);
    assert.deepEqual(Buffer.from(await frame.arrayBuffer()).subarray(0, 8), PNG);
    assert.equal((await fetch(`${url}/frame?t=99`)).status, 422);
    assert.equal((await fetch(`${url}/frame`)).status, 422);
    assert.equal((await fetch(`${url}/frame?t=1&width=10`)).status, 422);
    assert.equal((await fetch(`${mock.base}${P}/nope/backgrounds/a.mp4/frame?t=1`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('the preview lists the track with the time of the file mapped and says layer on the pieces an item touches', async () => {
  const { mock, id, put, piece } = await withClip();
  try {
    const [first, second] = piece.script.pieces;
    await put([{ id: 'v1', clip: 'a.mp4', start: first.start, end: first.end, scrim: 0.5 }, { id: 'v2', clip: 'a.mp4', start: first.end, end: first.end + 2, clip_start: 1, clip_end: 3, clip_speed: 2, transition_seconds: 1 }]);
    const preview = await mock.json('POST', `${P}/${id}/preview`, {});
    assert.equal(preview.status, 200, JSON.stringify(preview.body).slice(0, 300));
    fits(`${P}/{id}/preview`, 'post', 200, preview.body);
    assert.equal(preview.body.scenes.find((s) => s.id === first.id).layer, true);
    assert.equal(preview.body.scenes.find((s) => s.id === second.id).layer, true);
    const [v1, v2] = preview.body.video;
    assert.equal(v1.url, `${P}/${id}/backgrounds/a.mp4/file`);
    assert.equal(v1.file_seconds, 4);
    assert.equal(v1.scrim, 0.5);
    assert.deepEqual([v2.from, v2.to, v2.speed, v2.transition_seconds, v2.scrim], [1, 3, 2, 1, 0.3]);
    assert.equal(v1.build_seconds, Math.round((first.end - first.start + 1) * 1e6) / 1e6);
    assert.equal(v1.repeats, first.end - first.start > 4);
    // A script from the body is previewed without being saved, and a script with no track says none.
    const bare = await mock.json('POST', `${P}/${id}/preview`, { script: { ...piece.script } });
    assert.equal('video' in bare.body, false);
    assert.equal(bare.body.scenes.some((s) => s.layer), false);
  } finally {
    mock.stop();
  }
});

test('the verse layout is kept in the design and in a piece, and refused with the field named', async () => {
  const { mock, id, piece } = await withClip();
  try {
    const design = piece.design.design;
    const ok = await mock.json('PUT', `${P}/${id}/design`, { ...design, verse_layout: { position: 'top', scale: 1.2, align: 'left' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual((await mock.json('GET', `${P}/${id}`)).body.design.design.verse_layout, { position: 'top', scale: 1.2, align: 'left' });
    for (const [layout, field] of [[{ position: 'middle' }, 'position'], [{ scale: 2 }, 'scale'], [{ align: 'justify' }, 'align']]) {
      const bad = await mock.json('PUT', `${P}/${id}/design`, { ...design, verse_layout: layout });
      assert.equal(bad.status, 422);
      assert.ok(bad.body.error.message.includes(field), bad.body.error.message);
    }
    const own = await mock.json('PUT', `${P}/${id}/script`, { ...piece.script, pieces: piece.script.pieces.map((p, n) => (n === 0 ? { ...p, design: { verse_layout: { position: 'center' } } } : p)) });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.deepEqual(own.body.pieces[0].design, { verse_layout: { position: 'center' } });
    const worse = await mock.json('PUT', `${P}/${id}/script`, { ...piece.script, pieces: piece.script.pieces.map((p, n) => (n === 0 ? { ...p, design: { verse_layout: { scale: 0.1 } } } : p)) });
    assert.equal(worse.status, 422);
  } finally {
    mock.stop();
  }
});
