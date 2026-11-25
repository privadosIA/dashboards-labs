// The library of 3D models and the `.glb` models of a project and of a piece, as the mock simulates them, checked against the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { closeObjects } from './strict.mjs';
import { startMock } from './testkit.mjs';
import { makeGlb, parseGlb } from './models3d.mjs';

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
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const fast = { MOCK_MODELS_MS: '200' };
const P = '/api/models3d/packs';
const raw = (mock, method, path, body, type = 'application/octet-stream') => fetch(mock.base + path, { method, headers: { 'content-type': type }, body });
const installed = async (mock, id) => {
  assert.equal((await mock.json('POST', `${P}/${id}/install`)).status, 202);
  await until(async () => (await mock.json('GET', `${P}/${id}`)).body.state === 'installed');
};
const zip = (...names) => Buffer.concat([Buffer.from('PK\u0003\u0004'), ...names.map((n) => Buffer.from(`\u0000\u0000${n}\u0000`))]);

test('the six packs of the list are available at first, with their licence and author', async () => {
  const mock = await startMock({ env: fast });
  try {
    const { status, body } = await mock.json('GET', P);
    assert.equal(status, 200);
    fits(P, 'get', 200, body);
    assert.equal(body.packs.length, 6);
    for (const p of body.packs) assert.deepEqual([p.state, p.licence, p.author, p.source, p.attribution, p.models], ['available', 'CC0', 'Kenney', 'catalog', false, 0]);
  } finally {
    mock.stop();
  }
});

test('an install answers 202, reports its progress and ends installed; a second one is a 409; the catalog then has its models', async () => {
  const mock = await startMock({ env: { MOCK_MODELS_MS: '600' } });
  try {
    const first = await mock.json('POST', `${P}/kenney-food-kit/install`);
    assert.equal(first.status, 202);
    fits(`${P}/{id}/install`, 'post', 202, first.body);
    assert.equal(first.body.state, 'installing');
    assert.equal((await mock.json('GET', '/api/models3d/models')).body.total, 0);
    assert.equal((await mock.json('POST', `${P}/kenney-food-kit/install`)).status, 409);
    const polling = await mock.json('GET', `${P}/kenney-food-kit`);
    assert.equal(polling.body.state, 'installing');
    assert.equal(polling.body.progress.total, 4_800_000); // the bytes of the zip
    assert.ok(polling.body.progress.total > polling.body.progress.done);
    const done = await until(async () => {
      const r = await mock.json('GET', `${P}/kenney-food-kit`);
      return r.body.state === 'installed' ? r.body : null;
    });
    fits(`${P}/{id}`, 'get', 200, done);
    assert.equal(done.models, 10);
    assert.equal((await mock.json('POST', `${P}/kenney-food-kit/install`)).status, 409);
    assert.equal((await mock.json('GET', '/api/models3d/models')).body.total, 10);
  } finally {
    mock.stop();
  }
});

test('an install can be cancelled, a pack that is not in the list is a 404, and cancelling what is not installing is a 409', async () => {
  const mock = await startMock({ env: { MOCK_MODELS_MS: '5000' } });
  try {
    await mock.json('POST', `${P}/kenney-furniture-kit/install`);
    const cancelled = await mock.json('POST', `${P}/kenney-furniture-kit/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.state, 'available');
    assert.equal((await mock.json('POST', `${P}/kenney-furniture-kit/cancel`)).status, 409);
    assert.equal((await mock.json('POST', `${P}/nope/install`)).status, 404);
    await mock.json('POST', `${P}/kenney-furniture-kit/install`);
    assert.equal((await mock.json('DELETE', `${P}/kenney-furniture-kit`)).status, 409);
  } finally {
    mock.stop();
  }
});

test('MOCK_MODELS_FAIL makes a pack fail once with its reason and a repeat works', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODELS_FAIL: 'kenney-blocky-characters' } });
  try {
    await mock.json('POST', `${P}/kenney-blocky-characters/install`);
    const failed = await until(async () => {
      const r = await mock.json('GET', `${P}/kenney-blocky-characters`);
      return r.body.state === 'failed' ? r.body : null;
    });
    assert.match(failed.error, /changed/);
    await installed(mock, 'kenney-blocky-characters');
  } finally {
    mock.stop();
  }
});

test('removing a pack of the list makes it available again and takes its models out of the catalog', async () => {
  const mock = await startMock({ env: fast });
  try {
    await installed(mock, 'kenney-platformer-kit');
    assert.ok((await mock.json('GET', '/api/models3d/models?pack=kenney-platformer-kit')).body.total > 0);
    assert.equal((await mock.json('DELETE', `${P}/kenney-platformer-kit`)).status, 204);
    assert.equal((await mock.json('GET', `${P}/kenney-platformer-kit`)).body.state, 'available');
    assert.equal((await mock.json('GET', '/api/models3d/models')).body.total, 0);
  } finally {
    mock.stop();
  }
});

test('the catalog searches, filters by pack, tag and animations, and pages with its headers', async () => {
  const mock = await startMock({ env: fast });
  try {
    await installed(mock, 'kenney-mini-characters');
    await installed(mock, 'kenney-food-kit');
    const all = await mock.json('GET', '/api/models3d/models');
    fits('/api/models3d/models', 'get', 200, all.body);
    assert.equal(all.body.total, 25);
    assert.equal((await mock.json('GET', '/api/models3d/models?has_clips=true')).body.total, 15);
    assert.deepEqual((await mock.json('GET', '/api/models3d/models?q=pizza')).body.models.map((m) => m.id), ['kenney-food-kit/pizza']);
    assert.equal((await mock.json('GET', '/api/models3d/models?tag=zombie')).body.total, 1);
    assert.equal((await mock.json('GET', '/api/models3d/models?pack=kenney-food-kit')).body.total, 10);
    const page = await mock.json('GET', '/api/models3d/models?limit=5&offset=10');
    assert.equal(page.body.models.length, 5);
    assert.equal(page.body.total, 25);
    assert.equal(page.headers.get('x-total-count'), '25');
    assert.match(page.headers.get('link'), /rel="next"/);
    const one = await mock.json('GET', '/api/models3d/models/kenney-food-kit/pizza');
    fits('/api/models3d/models/{pack}/{name}', 'get', 200, one.body);
    assert.equal((await mock.json('GET', '/api/models3d/models/kenney-food-kit/nothing')).status, 404);
  } finally {
    mock.stop();
  }
});

test('a thumbnail is a picture, and the pack with no previews answers 503', async () => {
  const mock = await startMock({ env: fast });
  try {
    await installed(mock, 'kenney-food-kit');
    await installed(mock, 'kenney-retro-urban-kit');
    const ok = await mock.get('/api/models3d/models/kenney-food-kit/pizza/thumbnail');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal((await mock.get('/api/models3d/models/kenney-retro-urban-kit/building-a/thumbnail')).status, 503);
    assert.equal((await mock.get('/api/models3d/models/kenney-food-kit/none/thumbnail')).status, 404);
  } finally {
    mock.stop();
  }
});

test('importing a zip needs its licence, refuses a zip with no .glb (422) and an id in use (409), and the pack asks for attribution unless it is CC0', async () => {
  const mock = await startMock({ env: fast });
  try {
    const url = (q) => `${P}/import?${new URLSearchParams(q)}`;
    assert.equal((await raw(mock, 'POST', url({ id: 'mine' }), zip('a.glb'), 'application/zip')).status, 400);
    assert.equal((await raw(mock, 'POST', url({ id: 'mine', licence: 'CC-BY 4.0' }), zip('readme.txt'), 'application/zip')).status, 422);
    const res = await raw(mock, 'POST', url({ id: 'mine', licence: 'CC-BY 4.0', name: 'Mine', author: 'Someone', source_url: 'https://example.org' }), zip('models/hero.glb', 'models/tree.glb'), 'application/zip');
    assert.equal(res.status, 201);
    const pack = await res.json();
    fits(`${P}/import`, 'post', 201, pack);
    assert.deepEqual([pack.state, pack.source, pack.attribution, pack.models, pack.author], ['installed', 'user', true, 2, 'Someone']);
    assert.equal((await raw(mock, 'POST', url({ id: 'mine', licence: 'CC0' }), zip('a.glb'), 'application/zip')).status, 409);
    assert.equal((await mock.json('GET', '/api/models3d/models?pack=mine')).body.total, 2);
    assert.equal((await mock.json('DELETE', `${P}/mine`)).status, 204);
    assert.equal((await mock.json('GET', `${P}/mine`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('a .glb is read for its clips, triangles and pictures, and a file that is not a model is refused', () => {
  assert.deepEqual(parseGlb(makeGlb({ clips: ['idle', 'walk'], triangles: 30, pictures: ['Textures/colormap.png'] })), { ok: true, clips: ['idle', 'walk'], triangles: 30, needs: ['colormap.png'] });
  assert.equal(parseGlb(Buffer.from('not a model at all, really')).ok, false);
  assert.match(parseGlb(makeGlb({ pictures: ['http://x/y.png'] })).message, /scheme/);
  assert.match(parseGlb(makeGlb({ pictures: ['../y.png'] })).message, /\.\./);
});

test('the sources of a project: a .glb is a model with its clips and needs, copying from the library brings the pictures, and the refusals are the contract\'s', async () => {
  const mock = await startMock({ env: fast });
  try {
    const S = '/api/projects/demo/sources';
    const up = await raw(mock, 'PUT', `${S}/hero.glb`, makeGlb({ clips: ['idle', 'sprint'], triangles: 40, pictures: ['colormap.png'] }));
    assert.equal(up.status, 201);
    assert.equal((await raw(mock, 'PUT', `${S}/hero.glb`, makeGlb())).status, 409);
    assert.equal((await raw(mock, 'PUT', `${S}/bad.glb`, Buffer.from('nope'))).status, 400);
    const listed = await mock.json('GET', S);
    fits('/api/projects/{id}/sources', 'get', 200, listed.body);
    assert.deepEqual(listed.body.sources.find((s) => s.name === 'hero.glb'), { ...listed.body.sources.find((s) => s.name === 'hero.glb'), kind: 'model', clips: ['idle', 'sprint'], triangles: 40, needs: ['colormap.png'] });

    await installed(mock, 'kenney-mini-characters');
    const add = await mock.json('POST', `${S}/model`, { from: 'kenney-mini-characters/character-female-a' });
    assert.equal(add.status, 201);
    fits('/api/projects/{id}/sources/model', 'post', 201, add.body);
    assert.deepEqual(add.body, { name: 'character-female-a.glb', pictures: ['kenney-mini-characters--colormap.png'] });
    assert.equal((await mock.json('POST', `${S}/model`, { from: 'kenney-mini-characters/character-female-a' })).status, 200);
    assert.equal((await mock.json('POST', `${S}/model`, { from: 'kenney-mini-characters/character-female-b', name: 'character-female-a.glb' })).status, 409);
    assert.equal((await mock.json('POST', `${S}/model`, { from: 'kenney-mini-characters/none' })).status, 404);
    assert.equal((await mock.json('POST', `${S}/model`, {})).status, 400);
    assert.equal((await mock.json('POST', '/api/projects/none/sources/model', { from: 'kenney-mini-characters/character-female-a' })).status, 404);
    const after = (await mock.json('GET', S)).body.sources.map((s) => s.name);
    assert.ok(after.includes('character-female-a.glb') && after.includes('kenney-mini-characters--colormap.png'));
    // a scene that places the model keeps it, and the picture it needs
    await raw(mock, 'PUT', `${S}/colormap.png`, Buffer.from('png'));
    const placed = { version: 1, objects: [{ id: 'h', type: 'model', file: 'hero.glb', size: 1 }] };
    assert.equal((await mock.json('PUT', '/api/projects/demo/blender/descriptions/titulo.scene.json', { description: placed, seconds: 5 })).status, 200);
    const refused = await mock.json('DELETE', `${S}/hero.glb`);
    assert.equal(refused.status, 409);
    assert.match(refused.body.error.message, /titulo\.scene\.json/);
    assert.equal((await mock.json('DELETE', `${S}/colormap.png`)).status, 409);
    await mock.json('PUT', '/api/projects/demo/blender/descriptions/titulo.scene.json', { description: { version: 1, objects: [] }, seconds: 5 });
    assert.equal((await mock.json('DELETE', `${S}/hero.glb`)).status, 204);
    assert.ok(!(await mock.json('GET', S)).body.sources.some((s) => s.name === 'hero.glb'));
  } finally {
    mock.stop();
  }
});

test('the models of a piece: listed, uploaded, copied from the library and removed, with the feature in the catalog and the 409 of a script that places the model', async () => {
  const mock = await startMock({ env: fast });
  try {
    const M = '/api/music-motion/pieces/sample-piece/models';
    const T = '/api/music-motion/pieces/{id}/models';
    assert.ok((await mock.json('GET', '/api/music-motion/catalog')).body.features.includes('blender-models'));
    const empty = await mock.json('GET', M);
    fits(T, 'get', 200, empty.body);
    assert.deepEqual(empty.body, { models: [] });
    assert.equal((await raw(mock, 'PUT', `${M}/hero.glb`, makeGlb({ clips: ['idle'], pictures: ['skin.png'] }))).status, 201);
    assert.equal((await raw(mock, 'PUT', `${M}/skin.png`, Buffer.from('png'))).status, 201);
    assert.equal((await raw(mock, 'PUT', `${M}/hero.glb`, makeGlb())).status, 409);
    assert.equal((await raw(mock, 'PUT', `${M}/x.fbx`, Buffer.from('x'))).status, 400);
    assert.equal((await raw(mock, 'PUT', `${M}/bad.glb`, Buffer.from('nope'))).status, 400);
    await installed(mock, 'kenney-platformer-kit');
    const add = await mock.json('POST', M, { from: 'kenney-platformer-kit/chest' });
    assert.equal(add.status, 201);
    fits(T, 'post', 201, add.body);
    const listed = (await mock.json('GET', M)).body;
    fits(T, 'get', 200, listed);
    assert.deepEqual(listed.models.map((m) => [m.name, m.kind]), [['chest.glb', 'model'], ['hero.glb', 'model'], ['kenney-platformer-kit--colormap.png', 'picture'], ['skin.png', 'picture']]);
    assert.deepEqual(listed.models[0].clips, ['open', 'close']);

    // a saved 3D piece that places the model keeps it
    const piece = (await mock.json('GET', '/api/music-motion/pieces/sample-piece')).body;
    const script = { ...piece.script, pieces: piece.script.pieces.map((p, i) => (i === 0 ? { id: p.id, start: p.start, end: p.end, blender: { description: { version: 1, objects: [{ id: 'h', type: 'model', file: 'hero.glb' }] } } } : p)) };
    const saved = await mock.json('PUT', '/api/music-motion/pieces/sample-piece/script', script);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const refused = await mock.json('DELETE', `${M}/hero.glb`);
    assert.equal(refused.status, 409);
    assert.match(refused.body.error.message, new RegExp(piece.script.pieces[0].id));
    assert.equal((await mock.json('DELETE', `${M}/skin.png`)).status, 409); // the model that needs it is placed
    assert.equal((await mock.json('DELETE', `${M}/chest.glb`)).status, 204);
    assert.equal((await mock.json('DELETE', `${M}/chest.glb`)).status, 404);
    assert.equal((await mock.json('GET', '/api/music-motion/pieces/none/models')).status, 404);
  } finally {
    mock.stop();
  }
});

test('every operation of the library is in the contract and served by the mock', async () => {
  const mock = await startMock({ env: fast });
  try {
    for (const path of Object.keys(spec.paths).filter((p) => p.startsWith('/api/models3d/'))) {
      for (const method of Object.keys(spec.paths[path])) {
        const url = path.replace('{id}', 'kenney-food-kit').replace('{pack}', 'kenney-food-kit').replace('{name}', 'pizza');
        const res = await fetch(mock.base + url, { method: method.toUpperCase() });
        assert.notEqual(res.status, 405, `${method} ${path}`);
        assert.notEqual(res.status, 500, `${method} ${path}`);
      }
    }
  } finally {
    mock.stop();
  }
});

test('a scene that places a model is refused by its place: no project, no file, a clip it does not have, a picture it misses', async () => {
  const mock = await startMock({ env: fast });
  try {
    const scene = (object) => ({ version: 1, objects: [{ id: 'h', type: 'model', size: 1.7, ...object }] });
    const preview = (description) => mock.json('POST', '/api/blender/preview', { description, seconds: 5, aspect_ratio: '16:9', t: 1 });
    const none = await preview(scene({ file: 'hero.glb' }));
    assert.equal(none.status, 400);
    assert.match(none.body.error.message, /objects\[0\]\.file: a model needs the sources of a project/);

    const S = '/api/projects/demo/sources';
    await raw(mock, 'PUT', `${S}/hero.glb`, makeGlb({ clips: ['idle', 'sprint'], pictures: ['colormap.png'] }));
    const save = (description) => mock.json('PUT', '/api/projects/demo/blender/descriptions/titulo.scene.json', { description, seconds: 5 });
    assert.match((await save(scene({ file: 'other.glb' }))).body.error.message, /objects\[0\]\.file: "other.glb" is not a model of the sources/);
    assert.match((await save(scene({ file: 'hero.glb', animation: { clip: 'run' } }))).body.error.message, /objects\[0\]\.animation\.clip: "run" is not in hero.glb \(clips: idle, sprint\)/);
    assert.match((await save(scene({ file: 'hero.glb', animation: { clip: 'idle' } }))).body.error.message, /hero.glb needs the picture colormap.png, which is not in the sources/);
    await raw(mock, 'PUT', `${S}/colormap.png`, Buffer.from('png'));
    assert.equal((await save(scene({ file: 'hero.glb', animation: { clip: 'idle' } }))).status, 200);
    // `fit` says what `size` means: the height (the default) or the largest dimension; anything else is refused by its place
    assert.equal((await save(scene({ file: 'hero.glb', fit: 'largest' }))).status, 200);
    assert.equal((await save(scene({ file: 'hero.glb', fit: 'height' }))).status, 200);
    assert.match((await save(scene({ file: 'hero.glb', fit: 'widest' }))).body.error.message, /objects\[0\]\.fit: "widest" is not accepted/);
  } finally {
    mock.stop();
  }
});
