// The 3D scene in the single-call generation, simulated: the option `blender`, `blender.description` on `POST /api/generations`, the scene as an
// input a generation lists and serves, its reuse, and the writer and the preview with no project, with the contract's refusals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { example } from './blender-descriptions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = process.env.SPEC ?? resolve(here, '../contract/openapi.yaml');

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
  const send = (method, path, body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const make = (body) => send('POST', '/api/generations', { option: 'blender', duration: 5, client: 'dashboard-full', ...body }).then(json);
  return { send, json, make, stop: () => child.kill() };
}

test('the option blender is the last, never the default, and takes only a scene', async () => {
  const m = await start();
  try {
    const { video } = (await m.json(await m.send('GET', '/api/generation/options'))).body;
    const blender = video[video.length - 1];
    assert.equal(blender.id, 'blender');
    assert.equal(blender.engine, 'blender');
    assert.equal(blender.default, false);
    assert.equal(blender.available, true);
    assert.deepEqual(blender.inputs, { start_image: false, end_image: false, scene: true });
    assert.deepEqual(blender.duration, { min: 1, max: 30, default: 5 });
    assert.equal(blender.estimate, undefined);
  } finally {
    m.stop();
  }
});

test('a description makes a generation with no prompt, which lists it as a scene input the page can read back', async () => {
  const m = await start();
  try {
    const made = await m.make({ blender: { description: example() } });
    assert.equal(made.status, 202);
    assert.deepEqual(made.body.request.blender, {});
    assert.equal(made.body.request.prompt, undefined);
    assert.equal(made.body.inputs.length, 1);
    assert.equal(made.body.inputs[0].kind, 'scene');
    assert.match(made.body.inputs[0].name, /\.scene\.json$/);
    const read = await m.json(await m.send('GET', made.body.inputs[0].address));
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, example());
  } finally {
    m.stop();
  }
});

test('refuses what the contract refuses: no description, a description that does not pass, a description for another option', async () => {
  const m = await start();
  try {
    assert.equal((await m.make({})).status, 422);
    const broken = await m.make({ blender: { description: { version: 2 } } });
    assert.equal(broken.status, 422);
    assert.match(broken.body.error.message, /version: must be 1/);
    const notObject = await m.make({ blender: { description: [] } });
    assert.equal(notObject.status, 422);
    const other = await m.make({ option: 'ltx', prompt: 'a fox', blender: { description: example() } });
    assert.equal(other.status, 422);
    assert.match(other.body.error.message, /does not take a 3D scene/);
  } finally {
    m.stop();
  }
});

test('the description is checked against the duration of the request', async () => {
  const m = await start();
  try {
    const long = example();
    long.objects[0].keys = [{ t: 9, x: 1 }];
    const refused = await m.make({ duration: 5, blender: { description: long } });
    assert.equal(refused.status, 422);
    assert.match(refused.body.error.message, /outside the scene/);
    assert.equal((await m.make({ duration: 12, blender: { description: long } })).status, 202);
  } finally {
    m.stop();
  }
});

test('reuse_inputs_of copies the scene, a description sent with it wins, and another option cannot reuse a scene', async () => {
  const m = await start();
  try {
    const first = (await m.make({ blender: { description: example() } })).body;
    const same = await m.make({ reuse_inputs_of: first.id });
    assert.equal(same.status, 202);
    assert.deepEqual((await m.json(await m.send('GET', same.body.inputs[0].address))).body, example());
    assert.notEqual(same.body.inputs[0].address, first.inputs[0].address);
    const changed = example();
    changed.camera.lens = 24;
    const wins = await m.make({ reuse_inputs_of: first.id, blender: { description: changed } });
    assert.equal(wins.status, 202);
    assert.equal((await m.json(await m.send('GET', wins.body.inputs[0].address))).body.camera.lens, 24);
    const other = await m.make({ option: 'ltx', prompt: 'a fox', reuse_inputs_of: first.id });
    assert.equal(other.status, 422);
    assert.match(other.body.error.message, /used a 3D scene/);
  } finally {
    m.stop();
  }
});

test('the writer with no project writes, changes the one it is given and refuses what the contract refuses', async () => {
  const m = await start();
  try {
    const written = await m.json(await m.send('POST', '/api/blender/descriptions', { idea: 'a title', seconds: 5 }));
    assert.equal(written.status, 200);
    assert.deepEqual(written.body.description, example());
    assert.deepEqual([written.body.provider, written.body.attempts], ['mock', 1]);
    const changed = await m.json(await m.send('POST', '/api/blender/descriptions', { idea: 'the camera further away', seconds: 5, description: example() }));
    assert.ok(changed.body.description.camera.lens < example().camera.lens);
    for (const body of [{ idea: '', seconds: 5 }, { idea: 'x', seconds: 0 }, { idea: 'x', seconds: 5, aspect_ratio: '5:4' }, { idea: 'x', seconds: 5, description: 'no' }]) {
      assert.equal((await m.send('POST', '/api/blender/descriptions', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await m.send('POST', '/api/blender/descriptions', { idea: 'x [fail]', seconds: 5 })).status, 422);
  } finally {
    m.stop();
  }
});

test('the preview with no project draws the description of the body, and says which fault stops it', async () => {
  const m = await start();
  try {
    const ok = await m.send('POST', '/api/blender/preview', { description: example(), t: 1, seconds: 5 });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    const bad = await m.json(await m.send('POST', '/api/blender/preview', { description: { version: 2 }, t: 1, seconds: 5 }));
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, /version: must be 1/);
    assert.equal((await m.send('POST', '/api/blender/preview', { description: example(), t: 9, seconds: 5 })).status, 400);
    assert.equal((await m.send('POST', '/api/blender/preview', { description: example(), t: 1, seconds: 5, width: 2000 })).status, 400);
  } finally {
    m.stop();
  }
});
