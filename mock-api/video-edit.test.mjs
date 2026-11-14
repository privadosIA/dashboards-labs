// The video editing operations of the mock: the answers fit the contract (closed objects), an edit goes through its
// states, the refusals are the contract's and nothing is created by a refused request, and the library of motions works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { closeObjects } from './strict.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = process.env.SPEC ?? resolve(here, '../contract/openapi.yaml');
const spec = closeObjects(yaml.load(readFileSync(specPath, 'utf8')));
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });

const deref = (s) => {
  for (let i = 0; s?.$ref && i < 20; i++) s = s.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec);
  return s;
};
const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

async function start() {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath, '--speed', '100'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, no) => {
    child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
    child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const get = (path) => fetch(base + path);
  const del = (path) => fetch(base + path, { method: 'DELETE' });
  const form = (path, request, files = {}) => {
    const f = new FormData();
    f.set('request', JSON.stringify(request));
    for (const [part, name] of Object.entries(files)) f.set(part, new Blob([new Uint8Array([1, 2, 3, 4])]), name);
    return fetch(base + path, { method: 'POST', body: f });
  };
  return { base, get, del, form, stop: () => child.kill() };
}

function fits(path, method, status, body) {
  const schema = deref(spec.paths[path][method].responses[String(status)])?.content?.['application/json']?.schema;
  assert.ok(schema, `${method} ${path} has no JSON ${status} response in the contract`);
  const validate = ajv.compile({ ...schema, components: spec.components });
  assert.ok(validate(body), `${method.toUpperCase()} ${path} ${status}: ${ajv.errorsText(validate.errors, { dataVar: '' })}`);
}
const until = async (read, ok, what) => {
  for (let i = 0; i < 200; i++) {
    const v = await read();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`never reached: ${what}`);
};

test('the options list the seven tools in order and fit the contract', async () => {
  const m = await start();
  try {
    const body = await (await m.get('/api/video-edits/options')).json();
    fits('/api/video-edits/options', 'get', 200, body);
    assert.deepEqual(body.tools.map((t) => t.id), ['scale', 'interpolate', 'reframe', 'remove-background', 'depth', 'extend', 'motion-control']);
    const depth = body.tools.find((t) => t.id === 'depth');
    assert.equal(depth.available, false);
    assert.ok(depth.reason);
  } finally {
    m.stop();
  }
});

test('an edit goes queued, running, done with a result, and can be listed and deleted', async () => {
  const m = await start();
  try {
    const res = await m.form('/api/video-edits', { tool: 'scale', settings: { factor: 2 }, client: 'video-studio' }, { video: 'a.mp4' });
    assert.equal(res.status, 202);
    const created = await res.json();
    fits('/api/video-edits', 'post', 202, created);
    assert.equal(created.client, 'video-studio');
    const done = await until(async () => (await m.get(`/api/video-edits/${created.id}`)).json(), (e) => e.state === 'done', 'done');
    fits('/api/video-edits/{id}', 'get', 200, done);
    assert.equal(done.result.has_audio, true);
    assert.equal(done.result.width, 1280);
    const list = await (await m.get('/api/video-edits')).json();
    fits('/api/video-edits', 'get', 200, list);
    assert.equal(list.length, 1);
    assert.equal((await m.del(`/api/video-edits/${created.id}`)).status, 204);
    assert.equal((await m.get(`/api/video-edits/${created.id}`)).status, 404);
    assert.equal((await m.del(`/api/video-edits/${created.id}`)).status, 404);
  } finally {
    m.stop();
  }
});

test('remove-background with alpha makes a webm, and [fail] ends failed with no result', async () => {
  const m = await start();
  try {
    const a = await (await m.form('/api/video-edits', { tool: 'remove-background', settings: { alpha: true } }, { video: 'a.mov' })).json();
    const doneA = await until(async () => (await m.get(`/api/video-edits/${a.id}`)).json(), (e) => e.state === 'done', 'done');
    assert.equal(doneA.result.format, 'webm');
    const b = await (await m.form('/api/video-edits', { tool: 'extend', settings: { prompt: 'x [fail]' } }, { video: 'a.mp4' })).json();
    const failed = await until(async () => (await m.get(`/api/video-edits/${b.id}`)).json(), (e) => e.state === 'failed', 'failed');
    fits('/api/video-edits/{id}', 'get', 200, failed);
    assert.ok(failed.error);
    assert.equal(failed.result, undefined);
  } finally {
    m.stop();
  }
});

test('the refusals are the contract\'s and create nothing', async () => {
  const m = await start();
  try {
    const refuse = async (request, files, status, about) => {
      const res = await m.form('/api/video-edits', request, files);
      assert.equal(res.status, status, about);
      fits('/api/video-edits', 'post', status, await res.json());
    };
    await refuse({ tool: 'extend', settings: { seconds: 12 } }, { video: 'a.mp4' }, 422, 'seconds out of limits');
    await refuse({ tool: 'scale', settings: { factor: 3 } }, { video: 'a.mp4' }, 422, 'factor not a choice');
    await refuse({ tool: 'scale', settings: { speed: 1 } }, { video: 'a.mp4' }, 422, 'unknown setting');
    await refuse({ tool: 'scale' }, {}, 422, 'no video');
    await refuse({ tool: 'scale' }, { video: 'a.txt' }, 422, 'not a video');
    await refuse({ tool: 'scale' }, { video: 'a.mp4', image: 'p.png' }, 422, 'surplus image');
    await refuse({ tool: 'motion-control' }, { video: 'a.mp4' }, 422, 'missing image');
    await refuse({ tool: 'scale', client: 'Bad Name' }, { video: 'a.mp4' }, 422, 'bad client');
    await refuse({ tool: 'nope' }, { video: 'a.mp4' }, 422, 'unknown tool');
    await refuse({ tool: 'depth' }, { video: 'a.mp4' }, 503, 'unavailable tool');
    assert.deepEqual(await (await m.get('/api/video-edits')).json(), []);
  } finally {
    m.stop();
  }
});

test('the library starts empty; a motion is processing, then ready, has a preview and can be used instead of a video', async () => {
  const m = await start();
  try {
    assert.deepEqual(await (await m.get('/api/motions')).json(), []);
    const res = await m.form('/api/motions', { title: 'Walk', tags: ['walk'] }, { video: 'walk.mp4' });
    assert.equal(res.status, 202);
    const motion = await res.json();
    fits('/api/motions', 'post', 202, motion);
    assert.equal(motion.state, 'processing');
    // not ready yet: refused as a motion of an edit
    const early = await m.form('/api/video-edits', { tool: 'motion-control', motion: motion.id }, { image: 'p.png' });
    assert.equal(early.status, 422);
    const ready = await until(async () => (await m.get(`/api/motions/${motion.id}`)).json(), (x) => x.state === 'ready', 'ready');
    fits('/api/motions/{id}', 'get', 200, ready);
    const preview = await m.get(ready.preview);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'video/mp4');
    const both = await m.form('/api/video-edits', { tool: 'motion-control', motion: motion.id }, { image: 'p.png', video: 'a.mp4' });
    assert.equal(both.status, 422);
    const used = await m.form('/api/video-edits', { tool: 'motion-control', motion: motion.id, settings: { strength: 0.8 } }, { image: 'p.png' });
    assert.equal(used.status, 202);
    assert.equal((await m.del(`/api/motions/${motion.id}`)).status, 204);
    assert.equal((await m.get(`/api/motions/${motion.id}/preview`)).status, 404);
  } finally {
    m.stop();
  }
});

test('a motion can be added from an address, and a video under 2.1 seconds is refused', async () => {
  const m = await start();
  try {
    const res = await m.form('/api/motions', { source: 'https://example.com/clips/dance.mp4', tags: ['dance'] }, {});
    assert.equal(res.status, 202);
    const motion = await res.json();
    fits('/api/motions', 'post', 202, motion);
    assert.equal(motion.title, 'dance');
    assert.deepEqual(motion.tags, ['dance']);
    const short = await m.form('/api/motions', {}, { video: 'short-clip.mp4' });
    assert.equal(short.status, 422);
    assert.equal((await (await m.get('/api/motions')).json()).length, 1);
  } finally {
    m.stop();
  }
});

test('a motion that cannot be added is refused with a reason and not kept', async () => {
  const m = await start();
  try {
    const res = await m.form('/api/motions', {}, { video: 'empty-room.mp4' });
    assert.equal(res.status, 422);
    fits('/api/motions', 'post', 422, await res.json());
    assert.deepEqual(await (await m.get('/api/motions')).json(), []);
  } finally {
    m.stop();
  }
});
