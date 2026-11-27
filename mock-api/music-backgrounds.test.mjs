// The video backgrounds of a music-motion piece, as the mock simulates them, checked against the contract: copy from a finished generation, upload, list with `used_by`,
// delete, the file with `Range`, and the check of a script that puts a video behind a piece.
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
const B = `${P}/{id}/backgrounds`;
const SONG = { project: 'demo-musica', track_id: 'track-1', variant: 0 };
/** An MP4 as far as the mock can tell: `ftyp` at the fourth byte. */
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
const upload = (mock, id, name, body = MP4, query = '') => fetch(`${mock.base}${P}/${id}/backgrounds/${name}${query}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body });

async function open(env = {}) {
  const mock = await startMock({ env: { MOCK_SAMPLE: 'off', ...env }, args: ['--speed', '200'] });
  const made = await mock.json('POST', P, SONG);
  return { mock, id: made.body.id, piece: made.body };
}
/** A generation of the API that is done by now. */
async function generation(mock, extra = {}) {
  const made = await mock.json('POST', '/api/generations', { prompt: 'a quiet town', option: 'wan-low', duration: 6.5, aspect_ratio: '16:9', client: 'dashboard-full', ...extra });
  assert.equal(made.status, 202, JSON.stringify(made.body));
  await until(async () => (await mock.json('GET', `/api/generations/${made.body.id}`)).body.state === 'done');
  return made.body.id;
}

test('the catalog lists video-background and says over_video of every part', async () => {
  const { mock } = await open();
  try {
    const catalog = (await mock.json('GET', '/api/music-motion/catalog')).body;
    assert.ok(catalog.features.includes('video-background'));
    assert.ok(catalog.parts.every((p) => typeof p.over_video === 'boolean'));
  } finally {
    mock.stop();
  }
});

test('a finished generation is copied into the piece, and the list says which pieces of the saved script play it', async () => {
  const { mock, id, piece } = await open();
  try {
    assert.deepEqual((await mock.json('GET', `${P}/${id}/backgrounds`)).body, { backgrounds: [] });
    const gen = await generation(mock);
    const made = await mock.json('POST', `${P}/${id}/backgrounds`, { from: `generation:${gen}`, name: 'verso1.mp4' });
    assert.equal(made.status, 201);
    fits(B, 'post', 201, made.body);
    assert.deepEqual([made.body.name, made.body.seconds, made.body.width, made.body.height], ['verso1.mp4', 6.5, 1280, 720]);
    const defaulted = await mock.json('POST', `${P}/${id}/backgrounds`, { from: `generation:${gen}` });
    assert.equal(defaulted.body.name, `${gen}.mp4`);

    const listed = await mock.json('GET', `${P}/${id}/backgrounds`);
    fits(B, 'get', 200, listed.body);
    assert.deepEqual(listed.body.backgrounds.map((b) => [b.name, b.source, b.used_by]), [[`${gen}.mp4`, `generation:${gen}`, []], ['verso1.mp4', `generation:${gen}`, []]].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

    const script = { ...piece.script, pieces: piece.script.pieces.map((p, n) => (n === 0 ? { ...p, background: { clip: 'verso1.mp4', clip_start: 1, clip_speed: 0.5, scrim: 0.4 } } : p)) };
    const saved = await mock.json('PUT', `${P}/${id}/script`, script);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    // The shorthand of a piece becomes the item bg-<piece id> and is never returned.
    assert.equal(saved.body.pieces[0].background, undefined);
    assert.deepEqual(saved.body.video, [{ id: `bg-${script.pieces[0].id}`, clip: 'verso1.mp4', start: script.pieces[0].start, end: script.pieces[0].end, clip_start: 1, clip_speed: 0.5, scrim: 0.4 }]);
    const used = (await mock.json('GET', `${P}/${id}/backgrounds`)).body.backgrounds.find((b) => b.name === 'verso1.mp4');
    assert.deepEqual(used.used_by, [script.pieces[0].id]);
  } finally {
    mock.stop();
  }
});

test('a copy is refused as the server refuses it: not generation:<id>, not there, not done, a name that exists or is not accepted', async () => {
  const { mock, id } = await open();
  try {
    const url = `${P}/${id}/backgrounds`;
    assert.equal((await mock.json('POST', url, { from: 'somewhere' })).status, 422);
    assert.equal((await mock.json('POST', url, { from: 'generation:api-gen-nope' })).status, 404);
    const running = await mock.json('POST', '/api/generations', { prompt: 'x', duration: 5, client: 'dashboard-full' });
    assert.equal((await mock.json('POST', url, { from: `generation:${running.body.id}` })).status, 409);
    const gen = await generation(mock);
    assert.equal((await mock.json('POST', url, { from: `generation:${gen}`, name: 'a/b.mp4' })).status, 400);
    assert.equal((await mock.json('POST', url, { from: `generation:${gen}`, name: 'a.mp4' })).status, 201);
    assert.equal((await mock.json('POST', url, { from: `generation:${gen}`, name: 'a.mp4' })).status, 409);
    assert.equal((await mock.json('POST', `${P}/nope/backgrounds`, { from: `generation:${gen}` })).status, 404);
  } finally {
    mock.stop();
  }
});

test('an upload keeps a video, and refuses a name, a file that is not a video and a name that exists', async () => {
  const { mock, id } = await open();
  try {
    const ok = await upload(mock, id, 'mine.mp4');
    assert.equal(ok.status, 201);
    fits(`${P}/{id}/backgrounds/{name}`, 'put', 201, await ok.json());
    assert.equal((await upload(mock, id, 'mine.mp4')).status, 409);
    assert.equal((await upload(mock, id, 'mine.gif')).status, 400);
    assert.equal((await upload(mock, id, 'text.mp4', Buffer.from('not a video at all, just text'))).status, 422);
    assert.equal((await upload(mock, 'nope', 'x.mp4')).status, 404);
    assert.deepEqual((await mock.json('GET', `${P}/${id}/backgrounds`)).body.backgrounds.map((b) => b.name), ['mine.mp4']);
  } finally {
    mock.stop();
  }
});

test('a video is deleted unless a piece of the saved script plays it (409 naming the piece)', async () => {
  const { mock, id, piece } = await open();
  try {
    await upload(mock, id, 'mine.mp4');
    const script = { ...piece.script, pieces: piece.script.pieces.map((p, n) => (n === 0 ? { ...p, background: { clip: 'mine.mp4' } } : p)) };
    assert.equal((await mock.json('PUT', `${P}/${id}/script`, script)).status, 200);
    const refused = await mock.json('DELETE', `${P}/${id}/backgrounds/mine.mp4`);
    assert.equal(refused.status, 409);
    assert.ok(refused.body.error.message.includes(script.pieces[0].id));
    assert.equal((await mock.json('PUT', `${P}/${id}/script`, piece.script)).status, 200);
    assert.equal((await mock.json('DELETE', `${P}/${id}/backgrounds/mine.mp4`)).status, 204);
    assert.equal((await mock.json('DELETE', `${P}/${id}/backgrounds/mine.mp4`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('the file is served with its type, an ETag, Range and 304, and is a 404 for a video the piece does not keep', async () => {
  const { mock, id } = await open();
  try {
    await upload(mock, id, 'mine.mp4');
    const url = `${mock.base}${P}/${id}/backgrounds/mine.mp4/file`;
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'video/mp4');
    const etag = res.headers.get('etag');
    assert.match(etag, /^"[0-9a-f]+"$/);
    const whole = Buffer.from(await res.arrayBuffer());
    const part = await fetch(url, { headers: { range: 'bytes=0-9' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 0-9/${whole.length}`);
    assert.equal((await fetch(url, { headers: { 'if-none-match': etag } })).status, 304);
    assert.equal((await fetch(`${mock.base}${P}/${id}/backgrounds/other.mp4/file`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('a script is refused (422, naming the piece) for a video the piece does not keep, a start past its end, values out of range, a 3D piece, and a part that hides the video', async () => {
  const { mock, id, piece } = await open();
  try {
    await upload(mock, id, 'mine.mp4');
    const put = (change) => mock.json('PUT', `${P}/${id}/script`, { ...piece.script, pieces: piece.script.pieces.map((p, n) => (n === 0 ? { ...p, ...change } : p)) });
    const first = piece.script.pieces[0].id;
    const bad = async (change, text) => {
      const r = await put(change);
      assert.equal(r.status, 422, JSON.stringify(change));
      assert.ok(r.body.error.message.includes(first), r.body.error.message);
      assert.ok(r.body.error.message.includes(text), r.body.error.message);
    };
    await bad({ background: { clip: 'nope.mp4' } }, 'does not keep a video named "nope.mp4"');
    await bad({ background: { clip: 'mine.mp4', clip_start: 9 } }, 'past the end');
    await bad({ background: { clip: 'mine.mp4', clip_speed: 5 } }, 'clip_speed');
    await bad({ background: { clip: 'mine.mp4', scrim: 0.9 } }, 'scrim');
    await bad({ part: 'sunburst', params: {}, background: { clip: 'mine.mp4' } }, 'sunburst');
    const scene = await mock.json('PUT', `${P}/${id}/script`, { ...piece.script, pieces: piece.script.pieces.map((p, n) => (n === 0 ? { id: p.id, start: p.start, end: p.end, blender: { description: { version: 1 } }, background: { clip: 'mine.mp4' } } : p)) });
    assert.equal(scene.status, 422);
    assert.ok(scene.body.error.message.includes(`"${first}": a 3D piece has no video behind it`), scene.body.error.message);
    assert.equal((await put({ part: 'blank', params: {}, background: { clip: 'mine.mp4' } })).status, 200);
  } finally {
    mock.stop();
  }
});

test('a video for adults makes the piece one, and a server that does not keep adult content refuses it (422 content_not_allowed)', async () => {
  const closed = await open();
  try {
    const refused = await upload(closed.mock, closed.id, 'a.mp4', MP4, '?adult=true');
    assert.equal(refused.status, 422);
    assert.equal((await refused.json()).error.code, 'content_not_allowed');
    assert.equal((await closed.mock.json('GET', `${P}/${closed.id}`)).body.adult, false);
  } finally {
    closed.mock.stop();
  }
  const open2 = await open({ MOCK_ADULT: '1' });
  try {
    assert.equal((await upload(open2.mock, open2.id, 'a.mp4', MP4, '?adult=true')).status, 201);
    const piece = await open2.mock.json('GET', `${P}/${open2.id}`);
    fits(`${P}/{id}`, 'get', 200, piece.body);
    assert.equal(piece.body.adult, true);
    const gen = await generation(open2.mock, { adult: true });
    assert.equal((await open2.mock.json('POST', `${P}/${open2.id}/backgrounds`, { from: `generation:${gen}` })).status, 201);
  } finally {
    open2.mock.stop();
  }
});
