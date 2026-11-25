// The one-sentence dataset writer and the 3D scenes of a dataset, simulated: `assist/dataset` with `picture: "blender"`, and the `descriptions`
// that `import/preview` and `import/confirm` take, with the contract's refusals (400, 404, 422) and nothing created by a refused confirm.
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
  return { send, json, stop: () => child.kill() };
}

test('the catalog lists dataset and blender', async () => {
  const m = await start();
  try {
    const catalog = (await m.json(await m.send('GET', '/api/music-motion/catalog'))).body;
    assert.ok(catalog.features.includes('dataset'));
    assert.ok(catalog.features.includes('blender'));
  } finally {
    m.stop();
  }
});

test('picture blender writes a Blender line and its description for every scene, and keeps six', async () => {
  const m = await start();
  try {
    const sentence = Array.from({ length: 8 }, (_, i) => `scene number ${i + 1}`).join('. ');
    const out = await m.json(await m.send('POST', '/api/assist/dataset', { mode: 'video', text: sentence, picture: 'blender' }));
    assert.equal(out.status, 200);
    assert.equal(out.body.entries.length, 6);
    assert.deepEqual(Object.keys(out.body.descriptions), out.body.entries.map((e) => `${e[0]}.scene.json`));
    assert.match(out.body.entries[0][3], /^Blender: s01\.scene\.json\n/);
    assert.ok(!/Motion:|Negative:|Variants:/.test(out.body.entries.map((e) => e[3]).join('\n')));
    assert.deepEqual(out.body.warnings, ['only the first 6 are kept']);
  } finally {
    m.stop();
  }
});

test('a scene whose description does not pass is left out with a warning, and 422 when none is left', async () => {
  const m = await start();
  try {
    const some = await m.json(await m.send('POST', '/api/assist/dataset', { mode: 'video', text: 'a fine scene. a bad one [fail]', picture: 'blender' }));
    assert.equal(some.status, 200);
    assert.equal(some.body.entries.length, 1);
    assert.equal(some.body.warnings.length, 1);
    assert.match(some.body.warnings[0], /s02 left out/);
    const none = await m.json(await m.send('POST', '/api/assist/dataset', { mode: 'video', text: 'only a bad one [fail]', picture: 'blender' }));
    assert.equal(none.status, 422);
  } finally {
    m.stop();
  }
});

test('refuses what the contract refuses: 400 for a text, a mode, a picture or a mode of another kind, 404 for a project that is not there', async () => {
  const m = await start();
  try {
    const call = async (body) => (await m.send('POST', '/api/assist/dataset', body)).status;
    assert.equal(await call({ mode: 'video', text: '  ' }), 400);
    assert.equal(await call({ mode: 'poetry', text: 'x' }), 400);
    assert.equal(await call({ mode: 'video', text: 'x', picture: 'cycles' }), 400);
    assert.equal(await call({ mode: 'music', text: 'x', picture: 'blender' }), 400);
    assert.equal(await call({ mode: 'video', text: 'x', picture: 'blender', project: 'not-there' }), 404);
    assert.equal(await call({ mode: 'video', text: 'x' }), 200, 'without a picture it is the plain storyboard');
  } finally {
    m.stop();
  }
});

test('the preview warns about a line with no file, a file no line names and a description that does not pass', async () => {
  const m = await start();
  try {
    const written = (await m.json(await m.send('POST', '/api/assist/dataset', { mode: 'video', text: 'one. two', picture: 'blender' }))).body;
    const content = JSON.stringify(written.entries);
    const clean = (await m.json(await m.send('POST', '/api/import/preview', { content, descriptions: written.descriptions }))).body;
    assert.deepEqual(clean.warnings, []);
    assert.equal(clean.imported, 2);
    assert.match(clean.yaml, /blender:\n {6}build: s01\.scene\.json/);
    const { 's02.scene.json': _dropped, ...one } = written.descriptions;
    const missing = (await m.json(await m.send('POST', '/api/import/preview', { content, descriptions: one }))).body;
    assert.match(missing.warnings.join('\n'), /s02\.scene\.json, which is not in descriptions/);
    const extra = (await m.json(await m.send('POST', '/api/import/preview', { content, descriptions: { ...written.descriptions, 'z.scene.json': example() } }))).body;
    assert.deepEqual(extra.warnings, ['description z.scene.json is not named by any scene']);
    const broken = (await m.json(await m.send('POST', '/api/import/preview', { content, descriptions: { ...written.descriptions, 's01.scene.json': { version: 2 } } }))).body;
    assert.match(broken.warnings.join('\n'), /s01\.scene\.json does not pass: version: must be 1/);
  } finally {
    m.stop();
  }
});

test('the preview refuses descriptions that are not plain .scene.json names or are too many', async () => {
  const m = await start();
  try {
    const content = JSON.stringify([['s01', 'a', '', 'Blender: s01.scene.json\na']]);
    assert.equal((await m.send('POST', '/api/import/preview', { content, descriptions: { 'a/b.scene.json': {} } })).status, 400);
    assert.equal((await m.send('POST', '/api/import/preview', { content, descriptions: { 'a.json': {} } })).status, 400);
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`s${i}.scene.json`, {}]));
    assert.equal((await m.send('POST', '/api/import/preview', { content, descriptions: many })).status, 400);
  } finally {
    m.stop();
  }
});

test('the confirm writes the descriptions with the project and is 422, creating nothing, when one is missing, does not pass or is not named', async () => {
  const m = await start();
  try {
    const written = (await m.json(await m.send('POST', '/api/assist/dataset', { mode: 'video', text: 'one. two', picture: 'blender' }))).body;
    const yaml = (await m.json(await m.send('POST', '/api/import/preview', { content: JSON.stringify(written.entries), descriptions: written.descriptions }))).body.yaml;
    const { 's02.scene.json': _dropped, ...one } = written.descriptions;
    const refused = [
      { id: 'blender-no-file', yaml, descriptions: one },
      { id: 'blender-broken', yaml, descriptions: { ...written.descriptions, 's01.scene.json': { version: 2 } } },
      { id: 'blender-extra', yaml, descriptions: { ...written.descriptions, 'z.scene.json': example() } },
    ];
    for (const body of refused) {
      assert.equal((await m.send('POST', '/api/import/confirm', body)).status, 422, body.id);
      assert.equal((await m.send('GET', `/api/projects/${body.id}`)).status, 404, `${body.id} is not created`);
    }
    const ok = await m.send('POST', '/api/import/confirm', { id: 'blender-ok', yaml, descriptions: written.descriptions });
    assert.equal(ok.status, 201);
    const stored = await m.json(await m.send('GET', '/api/projects/blender-ok/blender/descriptions/s01.scene.json'));
    assert.equal(stored.status, 200);
    assert.equal(stored.body.description.version, 1);
  } finally {
    m.stop();
  }
});

test('picture blender writes graphics in the motion mode: a line that says what is built, its Duration and a Blender line, with their own ids', async () => {
  const m = await start();
  try {
    const out = await m.json(await m.send('POST', '/api/assist/dataset', { mode: 'motion', text: 'a title card. a closing card', picture: 'blender' }));
    assert.equal(out.status, 200);
    assert.deepEqual(out.body.entries.map((e) => e[0]), ['g01', 'g02']);
    assert.equal(out.body.entries[0][3], 'a title card\nDuration: 4\nBlender: g01.scene.json');
    assert.deepEqual(Object.keys(out.body.descriptions), ['g01.scene.json', 'g02.scene.json']);
    assert.equal((await m.send('POST', '/api/assist/dataset', { mode: 'music', text: 'a song', picture: 'blender' })).status, 400);
  } finally {
    m.stop();
  }
});

test('the import reads graphics with a Blender line in the motion mode: a graphics project, the warnings, and a confirm that writes the descriptions', async () => {
  const m = await start();
  try {
    const written = (await m.json(await m.send('POST', '/api/assist/dataset', { mode: 'motion', text: 'one. two', picture: 'blender' }))).body;
    const content = JSON.stringify(written.entries);
    const preview = (await m.json(await m.send('POST', '/api/import/preview', { content, mode: 'motion', descriptions: written.descriptions }))).body;
    assert.deepEqual(preview.warnings, []);
    assert.equal(preview.imported, 2);
    assert.match(preview.yaml, /graphics:/);
    assert.match(preview.yaml, /duration: 4/);
    assert.match(preview.yaml, /blender:\n {6}build: g01\.scene\.json/);
    const { 'g02.scene.json': _dropped, ...one } = written.descriptions;
    const missing = (await m.json(await m.send('POST', '/api/import/preview', { content, mode: 'motion', descriptions: one }))).body;
    assert.match(missing.warnings.join('\n'), /g02\.scene\.json, which is not in descriptions/);
    assert.equal((await m.send('POST', '/api/import/confirm', { id: 'graphics-no-file', yaml: preview.yaml, descriptions: one })).status, 422);
    assert.equal((await m.send('POST', '/api/import/confirm', { id: 'graphics-ok', yaml: preview.yaml, descriptions: written.descriptions })).status, 201);
  } finally {
    m.stop();
  }
});
