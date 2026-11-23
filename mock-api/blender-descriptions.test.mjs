// The 3D scene descriptions of the mock: written from an idea, changed, read, saved by hand and previewed, with the contract's refusals
// (400, 404, 422) and the stored description untouched by a refused request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = process.env.SPEC ?? resolve(here, '../contract/openapi.yaml');
const NAME = 'titulo.scene.json';

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
  for (const id of ['blender-a', 'blender-b']) assert.equal((await send('POST', '/api/projects', { id })).status, 201);
  const url = (tail = '', project = 'blender-a') => `/api/projects/${project}/blender/descriptions${tail}`;
  return { send, url, stop: () => child.kill() };
}

test('writing stores the example, answers who wrote it and resolves beats and colours', async () => {
  const m = await start();
  try {
    const res = await m.send('POST', m.url(), { name: NAME, idea: 'a title on a studio floor', seconds: 5, revise: false });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.deepEqual([out.name, out.provider, out.model, out.attempts], [NAME, 'mock', 'mock-model', 1]);
    assert.equal(out.description.version, 1);
    assert.ok(JSON.stringify(out.description).includes('"beat"'));
    assert.ok(!JSON.stringify(out.resolved).includes('"beat"'));
    assert.ok(JSON.stringify(out.resolved).includes('#ff5a36'));
    const read = await (await m.send('GET', m.url(`/${NAME}`))).json();
    assert.deepEqual(read.description, out.description);
  } finally {
    m.stop();
  }
});

test('changing it adjusts the camera and keeps the file', async () => {
  const m = await start();
  try {
    const first = await (await m.send('POST', m.url(), { name: NAME, idea: 'a title', seconds: 5 })).json();
    const res = await m.send('POST', m.url(), { name: NAME, idea: 'the camera further away', seconds: 5, revise: true });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.ok(out.description.camera.lens < first.description.camera.lens);
    assert.deepEqual((await (await m.send('GET', m.url(`/${NAME}`))).json()).description, out.description);
  } finally {
    m.stop();
  }
});

test('a description is stored per project', async () => {
  const m = await start();
  try {
    await m.send('POST', m.url(), { name: NAME, idea: 'a title', seconds: 5 });
    assert.equal((await m.send('GET', m.url(`/${NAME}`, 'blender-b'))).status, 404);
  } finally {
    m.stop();
  }
});

test('writing refuses a bad name, an empty or too long idea and seconds out of range with 400', async () => {
  const m = await start();
  try {
    const ok = { name: NAME, idea: 'x', seconds: 5 };
    for (const bad of [{ name: 'a.json' }, { name: '../a.scene.json' }, { idea: '  ' }, { idea: 'x'.repeat(2001) }, { seconds: 0.4 }, { seconds: 601 }, { seconds: '5' }]) {
      assert.equal((await m.send('POST', m.url(), { ...ok, ...bad })).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    assert.equal((await m.send('GET', m.url(`/${NAME}`))).status, 404, 'nothing was stored');
  } finally {
    m.stop();
  }
});

test('changing a description that is not there is 404, and [fail] is 422 and leaves the stored one', async () => {
  const m = await start();
  try {
    assert.equal((await m.send('POST', m.url(), { name: NAME, idea: 'closer', seconds: 5, revise: true })).status, 404);
    const first = await (await m.send('POST', m.url(), { name: NAME, idea: 'a title', seconds: 5 })).json();
    const failed = await m.send('POST', m.url(), { name: NAME, idea: 'a cube [fail]', seconds: 5, revise: true });
    assert.equal(failed.status, 422);
    assert.match((await failed.json()).error.message, /after 3 attempts/);
    assert.deepEqual((await (await m.send('GET', m.url(`/${NAME}`))).json()).description, first.description);
  } finally {
    m.stop();
  }
});

test('saving by hand stores it and names each fault by its place', async () => {
  const m = await start();
  try {
    const first = await (await m.send('POST', m.url(), { name: NAME, idea: 'a title', seconds: 5 })).json();
    const edited = structuredClone(first.description);
    edited.camera.lens = 35;
    const saved = await m.send('PUT', m.url(`/${NAME}`), { description: edited, seconds: 5 });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).description.camera.lens, 35);

    const bad = structuredClone(edited);
    bad.objects[1].keys[1] = { t: 7, location: [0, 0, 0] };
    const refused = await m.send('PUT', m.url(`/${NAME}`), { description: bad, seconds: 5 });
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).error.message, /objects\[1\]\.keys\[1\]\.t: 7 is outside the scene \(0 to 5 s\)/);
    assert.equal((await (await m.send('GET', m.url(`/${NAME}`))).json()).description.camera.lens, 35, 'a refused save keeps the stored one');

    assert.equal((await m.send('PUT', m.url(`/${NAME}`), { description: { version: 2 }, seconds: 5 })).status, 400);
    assert.equal((await m.send('PUT', m.url(`/${NAME}`), { description: edited, seconds: 0 })).status, 400);
  } finally {
    m.stop();
  }
});

test('a hand-written description can be saved before any was written', async () => {
  const m = await start();
  try {
    const saved = await m.send('PUT', m.url('/hand.scene.json'), { description: { version: 1, objects: [] }, seconds: 3 });
    assert.equal(saved.status, 200);
    assert.equal((await m.send('GET', m.url('/hand.scene.json'))).status, 200);
  } finally {
    m.stop();
  }
});

test('the preview is a PNG, and is refused without a description or with bad arguments', async () => {
  const m = await start();
  try {
    assert.equal((await m.send('POST', m.url(`/${NAME}/preview`), { t: 1, seconds: 5 })).status, 404);
    await m.send('POST', m.url(), { name: NAME, idea: 'a title', seconds: 5 });
    const res = await m.send('POST', m.url(`/${NAME}/preview`), { t: 1.5, seconds: 5, width: 480 });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual([...bytes.slice(1, 4)], [0x50, 0x4e, 0x47]);
    for (const bad of [{ t: -1, seconds: 5 }, { t: 1, seconds: 0 }, { t: 1, seconds: 5, width: 2000 }, { seconds: 5 }]) {
      assert.equal((await m.send('POST', m.url(`/${NAME}/preview`), bad)).status, 400, JSON.stringify(bad));
    }
  } finally {
    m.stop();
  }
});

test('an unknown project is 404 in the four operations', async () => {
  const m = await start();
  try {
    assert.equal((await m.send('POST', m.url('', 'nope'), { name: NAME, idea: 'x', seconds: 5 })).status, 404);
    assert.equal((await m.send('GET', m.url(`/${NAME}`, 'nope'))).status, 404);
    assert.equal((await m.send('PUT', m.url(`/${NAME}`, 'nope'), { description: { version: 1 }, seconds: 5 })).status, 404);
    assert.equal((await m.send('POST', m.url(`/${NAME}/preview`, 'nope'), { t: 0, seconds: 5 })).status, 404);
  } finally {
    m.stop();
  }
});
