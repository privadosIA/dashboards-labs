// The 3D pieces of the music motion mock: a piece of the script that is a scene Blender draws (no part), its writer and its frame without saving, the
// preview that marks it, the review that leaves it out, and the refusals of the server (quoting the piece by its id), checked against the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';

import { example } from './blender-descriptions.mjs';
import { closeObjects } from './strict.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = process.env.SPEC ?? resolve(here, '../contract/openapi.yaml');
const spec = closeObjects(yaml.load(readFileSync(specPath, 'utf8')));
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
  const send = (method, path, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const piece = (await json(await send('GET', '/api/music-motion/pieces/sample-piece'))).body;
  return { send, json, piece, script: piece.script, stop: () => child.kill() };
}

/** The script with its first piece made a 3D scene, as the editor would send it. */
const withScene = (script, patch = {}, i = 0) => ({ ...script, pieces: script.pieces.map((p, n) => (n === i ? { id: p.id, start: p.start, end: p.end, ...(p.section ? { section: p.section } : {}), blender: { description: example() }, ...patch } : p)) });
const PATH = '/api/music-motion/pieces/sample-piece';

test('the catalog lists blender-motion, apart from blender', async () => {
  const m = await start();
  try {
    const { features } = (await m.json(await m.send('GET', '/api/music-motion/catalog'))).body;
    assert.ok(features.includes('blender-motion'));
    assert.ok(features.includes('blender'));
  } finally {
    m.stop();
  }
});

test('a script with a 3D piece is saved as it comes and read back, with its description and no part', async () => {
  const m = await start();
  try {
    const saved = await m.json(await m.send('PUT', `${PATH}/script`, withScene(m.script)));
    assert.equal(saved.status, 200);
    fits('/api/music-motion/pieces/{id}/script', 'put', 200, saved.body);
    const read = (await m.json(await m.send('GET', PATH))).body.script;
    assert.deepEqual(read.pieces[0].blender, { description: example() });
    assert.equal(read.pieces[0].part, undefined);
  } finally {
    m.stop();
  }
});

test('refuses a 3D piece the way the server does, quoting the piece: with a part, with a field of a part, with a description that does not pass', async () => {
  const m = await start();
  try {
    const id = m.script.pieces[0].id;
    const both = await m.json(await m.send('PUT', `${PATH}/script`, withScene(m.script, { part: 'toggle' })));
    assert.equal(both.status, 422);
    assert.match(both.body.error.message, new RegExp(`^"${id}":`));
    const params = await m.json(await m.send('PUT', `${PATH}/script`, withScene(m.script, { params: { a: 1 } })));
    assert.match(params.body.error.message, /a 3D piece has no params/);
    const broken = await m.json(await m.send('PUT', `${PATH}/script`, withScene(m.script, { blender: { description: { version: 2 } } })));
    assert.equal(broken.status, 422);
    assert.match(broken.body.error.message, new RegExp(`^"${id}": the 3D scene does not pass the checks: .*version: must be 1`));
    assert.deepEqual((await m.json(await m.send('GET', PATH))).body.script, m.script, 'a refused save leaves the script as it was');
  } finally {
    m.stop();
  }
});

test('the writer answers a description for a piece, with the one it is given changed, and saves only when asked to', async () => {
  const m = await start();
  try {
    const id = m.script.pieces[0].id;
    const unsaved = await m.json(await m.send('POST', `${PATH}/script/${id}/blender`, { idea: 'a title', save: false }));
    assert.equal(unsaved.status, 200);
    fits('/api/music-motion/pieces/{id}/script/{piece}/blender', 'post', 200, unsaved.body);
    assert.equal(unsaved.body.saved, false);
    assert.deepEqual(unsaved.body.piece.blender.description, example());
    assert.equal((await m.json(await m.send('GET', PATH))).body.script.pieces[0].part, m.script.pieces[0].part, 'the script is as it was');
    const changed = await m.json(await m.send('POST', `${PATH}/script/${id}/blender`, { idea: 'closer', description: example(), save: false }));
    assert.ok(changed.body.piece.blender.description.camera.lens < example().camera.lens);
    const kept = await m.json(await m.send('POST', `${PATH}/script/${id}/blender`, { idea: 'a title' }));
    assert.equal(kept.body.saved, true);
    const read = (await m.json(await m.send('GET', PATH))).body.script.pieces[0];
    assert.deepEqual(read.blender, { description: example() });
    assert.equal(read.part, undefined, 'the piece stops being made from a part');
  } finally {
    m.stop();
  }
});

test('the writer refuses what the contract refuses: 400 for an idea, 404 for a piece or a change of one that is not 3D, 422 for [fail]', async () => {
  const m = await start();
  try {
    const id = m.script.pieces[0].id;
    const call = (piece, body) => m.send('POST', `${PATH}/script/${piece}/blender`, body).then((r) => r.status);
    assert.equal(await call(id, { idea: '  ' }), 400);
    assert.equal(await call(id, { idea: 'x', description: 'no' }), 400);
    assert.equal(await call('nope', { idea: 'x' }), 404);
    assert.equal(await call(id, { idea: 'x', revise: true }), 404, 'a piece that is a part has nothing to change');
    const failed = await m.json(await m.send('POST', `${PATH}/script/${id}/blender`, { idea: 'a cube [fail]', save: false }));
    assert.equal(failed.status, 422);
    assert.match(failed.body.error.message, new RegExp(`^"${id}":`));
  } finally {
    m.stop();
  }
});

test('a frame of a description in the body is drawn for the length of the piece, and the faults are named by piece and place', async () => {
  const m = await start();
  try {
    const id = m.script.pieces[0].id;
    const ok = await m.send('POST', `${PATH}/script/${id}/blender/frame`, { description: example(), t: 1 });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    const bad = await m.json(await m.send('POST', `${PATH}/script/${id}/blender/frame`, { description: { version: 2 }, t: 1 }));
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, new RegExp(`^"${id}": the 3D scene does not pass the checks`));
    assert.equal((await m.send('POST', `${PATH}/script/${id}/blender/frame`, { description: example(), t: 99999 })).status, 400);
    assert.equal((await m.send('POST', `${PATH}/script/${id}/blender/frame`, { description: example(), t: 1, width: 2000 })).status, 400);
    assert.equal((await m.send('POST', `${PATH}/script/nope/blender/frame`, { description: example(), t: 1 })).status, 404);
  } finally {
    m.stop();
  }
});

test('the preview marks a 3D piece and gives it no page, and the review leaves it out and says so', async () => {
  const m = await start();
  try {
    assert.equal((await m.send('PUT', `${PATH}/script`, withScene(m.script))).status, 200);
    const id = m.script.pieces[0].id;
    const preview = await m.json(await m.send('POST', `${PATH}/preview`));
    assert.equal(preview.status, 200);
    fits('/api/music-motion/pieces/{id}/preview', 'post', 200, preview.body);
    assert.deepEqual(preview.body.scenes[0], { id, start: m.script.pieces[0].start, end: m.script.pieces[0].end, html: '', song: {}, blender: true });
    assert.ok(preview.body.scenes[1].html.length > 0 && preview.body.scenes[1].blender === undefined);
    assert.equal((await m.send('POST', `${PATH}/review`)).status, 202);
    let review;
    for (let i = 0; i < 100 && review?.state !== 'done'; i++) {
      await new Promise((r) => setTimeout(r, 30));
      review = (await m.json(await m.send('GET', PATH))).body.review;
    }
    assert.deepEqual(review.skipped, [id]);
    assert.ok(!review.scenes.some((s) => s.script_piece === id));
  } finally {
    m.stop();
  }
});

test('the review is refused when every piece is a 3D scene', async () => {
  const m = await start();
  try {
    const all = { ...m.script, pieces: m.script.pieces.map((p) => ({ id: p.id, start: p.start, end: p.end, blender: { description: example() } })) };
    assert.equal((await m.send('PUT', `${PATH}/script`, all)).status, 200);
    assert.equal((await m.send('POST', `${PATH}/review`)).status, 422);
  } finally {
    m.stop();
  }
});
