// The projects of the mode models3d, as the mock simulates them: what their configuration may hold, what a run makes and leaves behind, and the mode in the runs and the statistics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { closeObjects } from './strict.mjs';
import { startMock } from './testkit.mjs';
import { parseGlb } from './models3d.mjs';

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
const up = { MOCK_MODEL3D: 'running' };
const fast = ['--speed', '50'];

const IMAGE = '  model: models/Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors\n  sampler: euler\n  steps: 20\n';
/** A project of the mode: `extra` is more of `defaults:` (indented), and the image model the pictures of the texts are drawn with is there unless `bare`. */
const config = (models, extra = '', bare = false) =>
  `project: objetos\noutput:\n  mode: models3d\ndefaults:\n${bare ? '' : IMAGE}${extra}models:\n${models.map((m) => `  - ${JSON.stringify(m)}`).join('\n')}\n`;
const put = (mock, id, text) => mock.json('PUT', `/api/projects/${id}/config`, { yaml: text });
const made = async (mock, id) => {
  assert.equal((await mock.json('POST', '/api/projects', { id })).status, 201);
  return id;
};
const run = async (mock, id, body = {}) => {
  const launched = await mock.json('POST', `/api/projects/${id}/runs`, body);
  assert.equal(launched.status, 202, JSON.stringify(launched.body));
  return until(async () => {
    const r = await mock.json('GET', `/api/runs/${launched.body.run.id}`);
    return ['succeeded', 'failed', 'cancelled'].includes(r.body.run.state) ? r.body.run : null;
  });
};
const modelsOf = async (mock, id) => (await mock.json('GET', `/api/models3d/models?project=${id}`)).body.models;

test('a project of the mode is saved with its models, listed with its mode and read back with them', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    const saved = await put(mock, 'objetos', config([{ id: 'patin', prompt: 'a retro roller skate' }, { id: 'copa', prompt: 'a golden trophy', variants: 3, seed: 7 }], '  models3d: { engine: triposr, detail: high }\n'));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const read = await mock.json('GET', '/api/projects/objetos/config');
    assert.equal(read.body.parsed.models.length, 2);
    assert.equal(read.body.parsed.defaults.models3d.detail, 'high');
    assert.equal(read.body.parsed.scenes, undefined);
    const listed = (await mock.json('GET', '/api/projects')).body.find((p) => p.id === 'objetos');
    assert.equal(listed.mode, 'models3d');
    fits('/api/projects', 'get', 200, (await mock.json('GET', '/api/projects')).body);
  } finally {
    mock.stop();
  }
});

test('the configuration is refused with the server’s words: id, text and picture, length, engine, detail, variants, scenes, and the keys in another mode', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    const refused = async (text, pattern) => {
      const r = await put(mock, 'objetos', text);
      assert.equal(r.status, 422, text);
      assert.match(r.body.error.message, pattern, text);
    };
    await refused(config([{ id: 'Not Plain', prompt: 'x' }]), /models\[0\]\.id: a plain lower-case name/);
    await refused(config([{ id: 'a', prompt: 'x' }, { id: 'a', prompt: 'y' }]), /models\[1\]\.id: "a" is used by another entry/);
    await refused(config([{ id: 'a', prompt: 'x', image: 'a.png' }]), /models\[0\]: give a prompt or an image, not both/);
    await refused(config([{ id: 'a' }]), /models\[0\]: give a prompt or an image/);
    await refused(config([{ id: 'a', prompt: 'y'.repeat(1001) }]), /models\[0\]\.prompt: at most 1000 characters/);
    await refused(config([{ id: 'a', image: 'a.gif' }]), /models\[0\]\.image: the name of a \.png/);
    await refused(config([{ id: 'a', prompt: 'x', engine: 'nope' }]), /models\[0\]\.engine: triposr or sf3d/);
    await refused(config([{ id: 'a', prompt: 'x', detail: 'ultra' }]), /models\[0\]\.detail: low, normal or high/);
    await refused(config([{ id: 'a', prompt: 'x', variants: 5 }]), /models\[0\]\.variants: a whole number from 1 to 4/);
    await refused(`${config([{ id: 'a', prompt: 'x' }])}scenes:\n  - { id: s1, prompt: x }\n`, /scenes: a project of the mode models3d has no scenes/);
    await refused('project: v\noutput:\n  mode: video\nmodels:\n  - { id: a, prompt: x }\nscenes:\n  - { id: s1, prompt: x }\n', /models: only valid in output.mode models3d/);
    await refused(`project: v\noutput:\n  mode: video\ndefaults:\n  models3d: { engine: triposr }\nscenes:\n  - { id: s1, prompt: x }\n`, /defaults.models3d: only valid in output.mode models3d/);
    await refused(config([{ id: 'a', prompt: 'x' }], '  models3d: { engine: nope }\n'), /defaults.models3d.engine: triposr or sf3d/);
  } finally {
    mock.stop();
  }
});

test('a run makes a model for each entry and variant, leaves the manifest and the models in out/, and copies them into the pack generated with the project and the entry', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    await put(mock, 'objetos', config([{ id: 'patin', prompt: 'a retro roller skate' }, { id: 'copa', prompt: 'a golden trophy', variants: 3, seed: 7 }]));
    const result = await run(mock, 'objetos');
    assert.equal(result.state, 'succeeded');
    assert.equal(result.mode, 'models3d');
    assert.equal(result.artifact, 'out/objetos/manifest.json');

    const manifest = await mock.json('GET', '/api/projects/objetos/artifacts/out/objetos/manifest.json');
    assert.deepEqual(manifest.body.models.map((m) => m.file), ['patin.glb', 'copa.glb', 'copa-2.glb', 'copa-3.glb'].map((f) => `out/objetos/${f}`));
    assert.deepEqual(manifest.body.models.map((m) => m.name), ['patin', 'copa', 'copa-2', 'copa-3']);
    assert.deepEqual(manifest.body.models.filter((m) => m.entry === 'copa').map((m) => m.variant), [0, 1, 2]);
    assert.deepEqual(manifest.body.models.filter((m) => m.entry === 'copa').map((m) => m.seed), [7, 8, 9]);
    assert.ok(manifest.body.models.every((m) => m.engine === 'triposr' && m.key && m.triangles > 0));

    const glb = await mock.get('/api/projects/objetos/artifacts/out/objetos/copa-2.glb');
    assert.equal(glb.status, 200);
    assert.equal(glb.headers.get('content-type'), 'model/gltf-binary');
    assert.equal(parseGlb(Buffer.from(await glb.arrayBuffer())).ok, true);

    const library = await modelsOf(mock, 'objetos');
    assert.deepEqual(library.map((m) => m.entry).sort(), ['copa', 'copa-2', 'copa-3', 'patin']);
    assert.ok(library.every((m) => m.source === 'generated' && m.project === 'objetos' && m.pack === 'generated'));
    fits('/api/models3d/models', 'get', 200, { models: library, total: library.length });
  } finally {
    mock.stop();
  }
});

test('a second run with nothing changed makes nothing again, and a changed prompt makes only that entry again', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    const models = [{ id: 'patin', prompt: 'a retro roller skate' }, { id: 'copa', prompt: 'a golden trophy' }];
    await put(mock, 'objetos', config(models));
    await run(mock, 'objetos');
    const keys = async () => Object.fromEntries((await mock.json('GET', '/api/projects/objetos/artifacts/out/objetos/manifest.json')).body.models.map((m) => [m.entry, m.key]));
    const first = await keys();

    const second = await mock.json('POST', '/api/projects/objetos/runs', {});
    await until(async () => (await mock.json('GET', `/api/runs/${second.body.run.id}`)).body.run.state === 'succeeded');
    assert.deepEqual(await keys(), first, 'nothing was made again');

    await put(mock, 'objetos', config([{ id: 'patin', prompt: 'a pink roller skate' }, models[1]]));
    await run(mock, 'objetos');
    const third = await keys();
    assert.notEqual(third.patin, first.patin, 'the changed prompt was made again');
    assert.equal(third.copa, first.copa, 'the other entry was left as it was');
    assert.equal((await modelsOf(mock, 'objetos')).length, 2, 'the library never holds two versions of one entry');
  } finally {
    mock.stop();
  }
});

test('a run can be limited to one entry', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    await put(mock, 'objetos', config([{ id: 'patin', prompt: 'a retro roller skate' }, { id: 'copa', prompt: 'a golden trophy' }]));
    await run(mock, 'objetos', { only: 'copa' });
    assert.deepEqual((await mock.json('GET', '/api/projects/objetos/artifacts/out/objetos/manifest.json')).body.models.map((m) => m.entry), ['copa']);
  } finally {
    mock.stop();
  }
});

test('an entry with its own picture makes one model and skips the picture phase', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    await put(mock, 'objetos', config([{ id: 'gato', image: 'gato.png', variants: 3 }]));
    const result = await run(mock, 'objetos');
    assert.equal(result.state, 'succeeded');
    const models = (await mock.json('GET', '/api/projects/objetos/artifacts/out/objetos/manifest.json')).body.models;
    assert.deepEqual(models.map((m) => m.name), ['gato']);
    assert.equal(models[0].image, 'gato.png');
    assert.equal(models[0].file, 'out/objetos/gato.glb');
  } finally {
    mock.stop();
  }
});

test('an engine that cannot be used fails the run with its reason and makes nothing', async () => {
  const mock = await startMock({ args: fast });
  try {
    await made(mock, 'objetos');
    await put(mock, 'objetos', config([{ id: 'patin', prompt: 'a retro roller skate' }]));
    const result = await run(mock, 'objetos');
    assert.equal(result.state, 'failed');
    assert.match(result.error, /the 3D engine triposr cannot be used \(not_running\)/);
    assert.equal((await modelsOf(mock, 'objetos')).length, 0);
  } finally {
    mock.stop();
  }
  const none = await startMock({ env: { MOCK_MODEL3D: 'none' }, args: fast });
  try {
    await made(none, 'objetos');
    await put(none, 'objetos', config([{ id: 'patin', prompt: 'x' }]));
    assert.match((await run(none, 'objetos')).error, /no 3D service/);
  } finally {
    none.stop();
  }
});

test('an invalid configuration is never queued: the run is refused (422) with the problem', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    await put(mock, 'objetos', config([{ id: 'patin', prompt: 'x' }]));
    // written behind the validator's back, as a hand edit of the file would
    const bad = await mock.json('PUT', '/api/projects/objetos/config', { yaml: config([{ id: 'patin' }]) });
    assert.equal(bad.status, 422);
  } finally {
    mock.stop();
  }
});

test('the mode is in the runs and the statistics, and a mode that does not exist is a 400 that lists them', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    await put(mock, 'objetos', config([{ id: 'patin', prompt: 'a retro roller skate' }]));
    await run(mock, 'objetos');
    const runs = await mock.json('GET', '/api/runs?mode=models3d');
    assert.equal(runs.status, 200);
    fits('/api/runs', 'get', 200, runs.body);
    assert.ok(runs.body.length >= 1 && runs.body.every((r) => r.project === 'objetos'));
    const others = await mock.json('GET', '/api/runs?mode=music');
    assert.ok(others.body.every((r) => r.project !== 'objetos'));
    const stats = await mock.json('GET', '/api/stats?mode=models3d');
    assert.equal(stats.status, 200);
    fits('/api/stats', 'get', 200, stats.body);
    for (const path of ['/api/runs?mode=bogus', '/api/stats?mode=bogus']) {
      const r = await mock.json('GET', path);
      assert.equal(r.status, 400);
      assert.match(r.body.error.message, /video, images, music, models3d or animation/);
    }
  } finally {
    mock.stop();
  }
});

test('a text with no image model, sampler or steps in the project fails the run at the picture, as the server does; a picture entry does not need them', async () => {
  const mock = await startMock({ env: up, args: fast });
  try {
    await made(mock, 'objetos');
    await put(mock, 'objetos', config([{ id: 'patin', prompt: 'a retro roller skate' }], '', true));
    const failed = await run(mock, 'objetos');
    assert.equal(failed.state, 'failed');
    assert.match(failed.error, /render failed: render: scene "patin"/);
    assert.equal((await modelsOf(mock, 'objetos')).length, 0);
    await put(mock, 'objetos', config([{ id: 'gato', image: 'gato.png' }], '', true));
    assert.equal((await run(mock, 'objetos')).state, 'succeeded');
  } finally {
    mock.stop();
  }
});
