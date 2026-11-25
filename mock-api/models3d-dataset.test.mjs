// The datasets of 3D models: the import preview and confirm, and the assistant, as the mock simulates them, checked against the contract.
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
const preview = (mock, rows) => mock.json('POST', '/api/import/preview', { content: JSON.stringify(rows), mode: 'models3d' });

test('a dataset of objects is read: the text before the markers is the prompt, the markers set their fields, and the project file is of the mode', async () => {
  const mock = await startMock();
  try {
    const r = await preview(mock, [
      ['patin', 'Roller skate', '', 'a retro roller skate,\nglossy pink\nEngine: triposr\nDetail: high\nVariants: 3\nSeed: 7'],
      ['gato', 'Cat', '', 'Image: gato.png\nVariants: 3'],
    ]);
    assert.equal(r.status, 200);
    const doc = yaml.load(r.body.yaml);
    assert.equal(doc.output.mode, 'models3d');
    assert.deepEqual(doc.models, [
      { id: 'patin', prompt: 'a retro roller skate, glossy pink', engine: 'triposr', detail: 'high', variants: 3, seed: 7 },
      { id: 'gato', image: 'gato.png' },
    ]);
    assert.equal(r.body.imported, 2);
    assert.equal(r.body.rejected, 0);
  } finally {
    mock.stop();
  }
});

test('an id is made plain and unique with a warning; an entry the server cannot read is rejected naming the line; an own picture drops the prompt', async () => {
  const mock = await startMock();
  try {
    const r = await preview(mock, [
      ['Mi Silla Roja!', 'a', '', 'a red chair'],
      ['mi-silla-roja', 'b', '', 'another red chair'],
      ['malo', 'c', '', 'a thing\nEngine: nope'],
      ['vacio', 'd', '', 'Seed: 3'],
      ['foto', 'e', '', 'a chair\nImage: silla.png'],
    ]);
    assert.equal(r.status, 200);
    const ids = yaml.load(r.body.yaml).models.map((m) => m.id);
    assert.deepEqual(ids, ['mi-silla-roja', 'mi-silla-roja-2', 'foto']);
    assert.equal(r.body.warnings.length, 3);
    assert.match(r.body.warnings[0], /id "Mi Silla Roja!" was changed to "mi-silla-roja"/);
    assert.match(r.body.warnings.at(-1), /foto: Image silla.png has to be in the project's sources/);
    assert.equal(r.body.entries[2].rejected, 'Engine: "nope" is not triposr or sf3d');
    assert.equal(r.body.rejected, 2);
    assert.match(r.body.report, /rejected: Engine: "nope" is not triposr or sf3d/);
    assert.match(r.body.report, /rejected: entry yields an empty prompt/);
    assert.match(r.body.report, /discarded: the text: an entry with its own picture has no prompt/);
    assert.match(r.body.yaml, /defaults:\n  model: models\//);
    assert.equal(yaml.load(r.body.yaml).models[2].prompt, undefined);
  } finally {
    mock.stop();
  }
});

test('adult content is refused on a server that does not keep it (422 content_not_allowed) and allowed where it does', async () => {
  const rows = [['a', 'A', '', 'a plain cup\nAdult: true']];
  const mock = await startMock();
  try {
    const r = await preview(mock, rows);
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'content_not_allowed');
  } finally {
    mock.stop();
  }
  const open = await startMock({ env: { MOCK_ADULT: '1' } });
  try {
    const r = await preview(open, rows);
    assert.equal(r.status, 200);
    assert.equal(yaml.load(r.body.yaml).models[0].adult, true);
  } finally {
    open.stop();
  }
});

test('a file that is not a dataset is a 422', async () => {
  const mock = await startMock();
  try {
    assert.equal((await mock.json('POST', '/api/import/preview', { content: 'not json', mode: 'models3d' })).status, 422);
    assert.equal((await mock.json('POST', '/api/import/preview', { content: '[["a","b"]]', mode: 'models3d' })).status, 422);
  } finally {
    mock.stop();
  }
});

test('the previewed project is created in the mode, and the project page reads it back with its models', async () => {
  const mock = await startMock();
  try {
    const r = await preview(mock, [['patin', 'Roller skate', '', 'a retro roller skate\nDetail: low']]);
    const created = await mock.json('POST', '/api/import/confirm', { id: 'objetos', yaml: r.body.yaml });
    assert.equal(created.status, 201);
    const listed = (await mock.json('GET', '/api/projects')).body.find((p) => p.id === 'objetos');
    assert.equal(listed.mode, 'models3d');
    const config = await mock.json('GET', '/api/projects/objetos/config');
    assert.deepEqual(config.body.parsed.models, [{ id: 'patin', prompt: 'a retro roller skate', detail: 'low' }]);
    assert.equal((await mock.json('POST', '/api/import/confirm', { id: 'objetos', yaml: r.body.yaml })).status, 409);
    // a picture an entry names has to be in the project's sources, which an import cannot carry
    const withPicture = await mock.json('POST', '/api/import/confirm', { id: 'conimagen', yaml: 'project: x\noutput:\n  mode: models3d\nmodels:\n  - { id: gato, image: gato.png }\n' });
    assert.equal(withPicture.status, 422);
    assert.match(withPicture.body.error.message, /models\[0\]\.image: "gato.png" is not in the project's sources/);
    // a yaml the mode refuses is not created
    const bad = await mock.json('POST', '/api/import/confirm', { id: 'malo', yaml: 'project: malo\noutput:\n  mode: models3d\nmodels:\n  - { id: a }\n' });
    assert.equal(bad.status, 422);
  } finally {
    mock.stop();
  }
});

test('the assistant writes the objects of a sentence, each one alone, with the markers only where the sentence asked; picture and project do not apply', async () => {
  const mock = await startMock();
  try {
    const r = await mock.json('POST', '/api/assist/dataset', { mode: 'models3d', text: 'a roller skate, a helmet and a trophy, sf3d, high detail', examples: [{ prompt: 'a retro roller skate' }] });
    assert.equal(r.status, 200);
    fits('/api/assist/dataset', 'post', 200, r.body);
    assert.equal(r.body.entries.length, 3);
    assert.deepEqual(r.body.entries.map((e) => e[0]), ['s01', 's02', 's03']);
    assert.ok(r.body.entries.every((e) => !/Seed:|Image:|Adult:/.test(e[3])));
    assert.match(r.body.entries[0][3], /Engine: sf3d/);
    assert.match(r.body.entries[0][3], /Detail: high/);

    const single = await mock.json('POST', '/api/assist/dataset', { mode: 'models3d', text: 'a wooden chair' });
    assert.equal(single.body.entries.length, 3);
    assert.equal(single.body.entries[0][3], 'a wooden chair');

    for (const extra of [{ picture: 'blender' }, { project: 'demo' }]) {
      const refused = await mock.json('POST', '/api/assist/dataset', { mode: 'models3d', text: 'a chair', ...extra });
      assert.equal(refused.status, 400);
    }
    const many = await mock.json('POST', '/api/assist/dataset', { mode: 'models3d', text: Array.from({ length: 15 }, (_, i) => `object ${i}`).join(', ') });
    assert.equal(many.body.entries.length, 12);
    assert.match(many.body.warnings[0], /only the first 12/);
  } finally {
    mock.stop();
  }
});

test('the prompt presets have the kind model3d', async () => {
  const mock = await startMock();
  try {
    const made = await mock.json('POST', '/api/prompts', { kind: 'model3d', title: 'Roller skate', prompt: 'a retro roller skate, glossy pink', tags: ['sport'] });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const listed = await mock.json('GET', '/api/prompts?kind=model3d');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.total, 1);
    assert.deepEqual(listed.body.items.map((p) => p.kind), ['model3d']);
    assert.equal((await mock.json('GET', '/api/prompts?kind=nope')).status, 400);
  } finally {
    mock.stop();
  }
});
