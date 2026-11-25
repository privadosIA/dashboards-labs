// The engines, the download of their weights and the generations of 3D models, as the mock simulates them, checked against the contract.
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
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const fast = { MOCK_MODELS_MS: '150', MOCK_MODEL3D_START_MS: '150', MOCK_MODEL3D_PICTURE_MS: '150', MOCK_MODEL3D_MODEL_MS: '150' };
const E = '/api/models3d/engines';
const G = '/api/models3d/generations';
const form = (fields, image) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  if (image) data.append('image', new Blob([image.bytes ?? Buffer.from('png')], { type: 'image/png' }), image.name);
  return data;
};
const postForm = (mock, data) => fetch(mock.base + G, { method: 'POST', body: data }).then(async (r) => ({ status: r.status, body: await r.json() }));
const ready = async (mock) => {
  assert.equal((await mock.json('POST', `${E}/triposr/start`)).status, 200);
  await until(async () => (await mock.json('GET', E)).body.engines.triposr.available);
};

test('the engines say what each lacks: triposr has the container stopped and sf3d no key', async () => {
  const mock = await startMock({ env: fast });
  try {
    const { status, body } = await mock.json('GET', E);
    assert.equal(status, 200);
    fits(E, 'get', 200, body);
    assert.equal(body.engines.triposr.available, false);
    assert.equal(body.engines.triposr.reason, 'not_running');
    assert.equal(body.engines.sf3d.reason, 'key_missing');
  } finally {
    await mock.stop();
  }
});

test('a server with no 3D service answers 503 to the engines and the generations', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'none' } });
  try {
    for (const [method, path] of [['GET', E], ['GET', G], ['POST', `${E}/triposr/start`]]) {
      const r = await mock.json(method, path, method === 'POST' ? {} : undefined);
      assert.equal(r.status, 503, `${method} ${path}`);
      assert.equal(r.body.error.code, 'unavailable');
    }
  } finally {
    await mock.stop();
  }
});

test('starting the container goes through starting to running, and stopping puts it back', async () => {
  const mock = await startMock({ env: fast });
  try {
    const started = await mock.json('POST', `${E}/triposr/start`);
    assert.equal(started.status, 200);
    fits(`${E}/{engine}/start`, 'post', 200, started.body);
    assert.equal(started.body.container.state, 'starting');
    await until(async () => (await mock.json('GET', E)).body.engines.triposr.available);
    const stopped = await mock.json('POST', `${E}/triposr/stop`);
    assert.equal(stopped.body.container.state, 'stopped');
    assert.equal((await mock.json('GET', E)).body.engines.triposr.reason, 'not_running');
  } finally {
    await mock.stop();
  }
});

test('an engine that lacks more than the container cannot be started (409 with its reason), and an unknown one is 404', async () => {
  const mock = await startMock({ env: fast });
  try {
    const r = await mock.json('POST', `${E}/sf3d/start`);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.reason, 'key_missing');
    assert.equal((await mock.json('POST', `${E}/nope/start`)).status, 404);
  } finally {
    await mock.stop();
  }
});

test('the plan comes first and changes nothing; with confirm the weights download and the engine can then be started', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'bare' } });
  try {
    assert.equal((await mock.json('GET', E)).body.engines.triposr.reason, 'no_weights');
    const plan = await mock.json('POST', `${E}/triposr/install`, {});
    assert.equal(plan.status, 200);
    fits(`${E}/{engine}/install`, 'post', 200, plan.body);
    assert.equal(plan.body.plan.gated, false);
    assert.ok(plan.body.plan.bytes > 0);
    assert.equal((await mock.json('GET', E)).body.engines.triposr.reason, 'no_weights', 'the plan changed nothing');

    const job = await mock.json('POST', `${E}/triposr/install`, { confirm: true });
    assert.equal(job.status, 202);
    fits(`${E}/{engine}/install`, 'post', 202, job.body);
    assert.equal(job.body.install.state, 'running');
    assert.equal((await mock.json('POST', `${E}/triposr/install`, { confirm: true })).status, 409, 'another download is running');
    const done = await until(async () => {
      const r = await mock.json('GET', `/api/models3d/installs/${job.body.install.id}`);
      fits('/api/models3d/installs/{id}', 'get', 200, r.body);
      return r.body.state === 'done' ? r.body : null;
    });
    assert.ok(done.log.length >= 2);
    assert.equal((await mock.json('GET', E)).body.engines.triposr.reason, 'not_running');
    assert.equal((await mock.json('POST', `${E}/triposr/install`, {})).status, 409, 'the weights are complete');
  } finally {
    await mock.stop();
  }
});

test('a download can be cancelled while it runs and not afterwards; sf3d without a key cannot be planned (422)', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODELS_MS: '5000', MOCK_MODEL3D: 'bare' } });
  try {
    const job = await mock.json('POST', `${E}/triposr/install`, { confirm: true });
    const cancelled = await mock.json('POST', `/api/models3d/installs/${job.body.install.id}/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.state, 'cancelled');
    assert.equal((await mock.json('POST', `/api/models3d/installs/${job.body.install.id}/cancel`)).status, 409);
    assert.equal((await mock.json('GET', '/api/models3d/installs/nope')).status, 404);
    const sf = await mock.json('POST', `${E}/sf3d/install`, {});
    assert.equal(sf.status, 422);
    assert.equal(sf.body.error.reason, 'key_missing');
  } finally {
    await mock.stop();
  }
});

test('a generation from a text goes through queued, the picture, the model and done, and the model joins the pack generated', async () => {
  const mock = await startMock({ env: fast });
  try {
    await ready(mock);
    const made = await mock.json('POST', G, { prompt: 'a retro roller skate, glossy pink', client: 'dashboard-full' });
    assert.equal(made.status, 202);
    fits(G, 'post', 202, made.body);
    assert.equal(made.body.state, 'queued');
    assert.equal(made.body.client, 'dashboard-full');
    assert.equal(made.body.name, 'a-retro-roller-skate-glossy-pink');
    const steps = new Set();
    const done = await until(async () => {
      const r = await mock.json('GET', `${G}/${made.body.id}`);
      fits(`${G}/{id}`, 'get', 200, r.body);
      if (r.body.step) steps.add(r.body.step);
      return r.body.state === 'done' ? r.body : null;
    });
    assert.equal(done.model, 'generated/a-retro-roller-skate-glossy-pink');
    assert.ok(steps.has('picture') && steps.has('model'), `the steps seen: ${[...steps]}`);

    const model = await mock.json('GET', `/api/models3d/models/generated/${done.name}`);
    assert.equal(model.status, 200);
    fits('/api/models3d/models/{pack}/{name}', 'get', 200, model.body);
    assert.equal(model.body.source, 'generated');
    assert.equal(model.body.prompt, 'a retro roller skate, glossy pink');
    assert.equal(model.body.engine, 'triposr');
    assert.match(model.body.engine_version, /^triposr@/);
    assert.equal(model.body.attribution, false);
    assert.equal(model.body.licence, 'MIT');

    const packs = (await mock.json('GET', '/api/models3d/packs')).body.packs;
    const pack = packs.find((p) => p.id === 'generated');
    assert.equal(pack.source, 'generated');
    assert.equal(pack.models, 1);
    // copied into a project like any model
    const copied = await mock.json('POST', '/api/projects/demo/sources/model', { from: model.body.id });
    assert.equal(copied.status, 201);
  } finally {
    await mock.stop();
  }
});

test('a generation from a picture skips the picture step; a prompt that says fail ends failed with the reason', async () => {
  const mock = await startMock({ env: fast });
  try {
    await ready(mock);
    const fromPicture = await postForm(mock, form({ engine: 'triposr', detail: 'high', name: 'lampara', client: 'tester' }, { name: 'lampara.png' }));
    assert.equal(fromPicture.status, 202);
    fits(G, 'post', 202, fromPicture.body);
    assert.equal(fromPicture.body.prompt, undefined);
    assert.equal(fromPicture.body.detail, 'high');
    const seen = new Set();
    await until(async () => {
      const r = await mock.json('GET', `${G}/${fromPicture.body.id}`);
      if (r.body.step) seen.add(r.body.step);
      return r.body.state === 'done';
    });
    assert.ok(!seen.has('picture'));

    const bad = await mock.json('POST', G, { prompt: 'a vase that will fail' });
    const failed = await until(async () => {
      const r = await mock.json('GET', `${G}/${bad.body.id}`);
      return r.body.state === 'failed' ? r.body : null;
    });
    assert.match(failed.error, /memory/);
    assert.equal((await mock.json('GET', '/api/models3d/models/generated/a-vase-that-will-fail')).status, 404);
  } finally {
    await mock.stop();
  }
});

test('the refusals name the field: both, neither, a long prompt, an unknown engine or detail, a bad name or client, a bad or huge picture', async () => {
  const mock = await startMock({ env: fast });
  try {
    await ready(mock);
    const cases = [
      [{ prompt: 'x', engine: 'nope' }, 400, 'engine'],
      [{ prompt: 'x', detail: 'ultra' }, 400, 'detail'],
      [{ prompt: 'x', name: 'Not Plain' }, 400, 'name'],
      [{ prompt: 'x', client: 'Bad Client' }, 400, 'client'],
      [{ prompt: 'y'.repeat(1001) }, 400, 'prompt'],
      [{}, 400, 'prompt'],
      [{ prompt: '' }, 400, 'prompt'],
    ];
    for (const [body, status, field] of cases) {
      const r = await mock.json('POST', G, body);
      assert.equal(r.status, status, JSON.stringify(body).slice(0, 60));
      assert.ok(r.body.error.message.startsWith(`${field}:`), r.body.error.message);
    }
    const both = await postForm(mock, form({ prompt: 'x' }, { name: 'a.png' }));
    assert.equal(both.status, 400);
    const wrongType = await postForm(mock, form({}, { name: 'a.gif' }));
    assert.equal(wrongType.status, 400);
    const huge = await postForm(mock, form({}, { name: 'a.png', bytes: Buffer.alloc(21 * 1024 * 1024) }));
    assert.equal(huge.status, 413);
    assert.equal((await mock.json('POST', G, { prompt: 'x', adult: true })).status, 422);
    assert.equal((await mock.json('GET', G)).body.length, 0, 'nothing was created');
  } finally {
    await mock.stop();
  }
});

test('an engine that cannot be used refuses with 503 and its reason, and a machine with no image model refuses a text but takes a picture', async () => {
  const mock = await startMock({ env: fast });
  try {
    const stopped = await mock.json('POST', G, { prompt: 'a cup' });
    assert.equal(stopped.status, 503);
    assert.equal(stopped.body.error.code, 'unavailable');
    assert.equal(stopped.body.error.reason, 'not_running');
    const noKey = await mock.json('POST', G, { prompt: 'a cup', engine: 'sf3d' });
    assert.equal(noKey.body.error.reason, 'key_missing');
  } finally {
    await mock.stop();
  }
  const bare = await startMock({ env: { ...fast, MOCK_NO_IMAGE_MODEL: '1', MOCK_MODEL3D: 'running' } });
  try {
    const text = await bare.json('POST', G, { prompt: 'a cup' });
    assert.equal(text.status, 503);
    assert.equal(text.body.error.reason, 'no_image_model');
    assert.equal((await postForm(bare, form({}, { name: 'cup.png' }))).status, 202);
  } finally {
    await bare.stop();
  }
});

test('the generations list newest first and pages, cancel stops a running one and not a finished one, delete keeps the model', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'running', MOCK_MODEL3D_MODEL_MS: '4000' } });
  try {
    const one = await mock.json('POST', G, { prompt: 'first', client: 'a' });
    await new Promise((r) => setTimeout(r, 15));
    const two = await mock.json('POST', G, { prompt: 'second', client: 'b' });
    const list = await mock.json('GET', G);
    fits(G, 'get', 200, list.body);
    assert.deepEqual(list.body.map((g) => g.id), [two.body.id, one.body.id]);
    assert.deepEqual((await mock.json('GET', `${G}?client=a`)).body.map((g) => g.id), [one.body.id]);
    const paged = await mock.json('GET', `${G}?limit=1`);
    assert.equal(paged.body.length, 1);
    assert.equal(paged.headers.get('x-total-count'), '2');

    const cancelled = await mock.json('POST', `${G}/${one.body.id}/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.state, 'cancelled');
    assert.equal((await mock.json('POST', `${G}/${one.body.id}/cancel`)).status, 409);
    assert.equal((await mock.json('DELETE', `${G}/${one.body.id}`)).status, 204);
    assert.equal((await mock.json('GET', `${G}/${one.body.id}`)).status, 404);
    assert.equal((await mock.json('POST', `${G}/nope/cancel`)).status, 404);
  } finally {
    await mock.stop();
  }
});

test('the catalog filters by source, engine and project, finds a model by its text, and the pack generated cannot be imported over', async () => {
  const mock = await startMock({ env: fast });
  try {
    await ready(mock);
    assert.equal((await mock.json('POST', '/api/models3d/packs/kenney-food-kit/install')).status, 202);
    await until(async () => (await mock.json('GET', '/api/models3d/packs/kenney-food-kit')).body.state === 'installed');
    const made = await mock.json('POST', G, { prompt: 'a golden trophy cup', name: 'copa' });
    await until(async () => (await mock.json('GET', `${G}/${made.body.id}`)).body.state === 'done');

    const generated = await mock.json('GET', '/api/models3d/models?source=generated');
    fits('/api/models3d/models', 'get', 200, generated.body);
    assert.deepEqual(generated.body.models.map((m) => m.id), ['generated/copa']);
    assert.ok((await mock.json('GET', '/api/models3d/models?source=catalog')).body.models.every((m) => m.source === 'catalog'));
    assert.equal((await mock.json('GET', '/api/models3d/models?engine=triposr')).body.models.length, 1);
    assert.equal((await mock.json('GET', '/api/models3d/models?engine=sf3d')).body.models.length, 0);
    assert.equal((await mock.json('GET', `/api/models3d/models?project=${made.body.id}`)).body.models.length, 1);
    assert.equal((await mock.json('GET', '/api/models3d/models?q=trophy')).body.models.length, 1, 'the search looks in the text');
    assert.equal((await mock.json('GET', '/api/models3d/models?source=nope')).status, 400);

    const imported = await fetch(`${mock.base}/api/models3d/packs/import?id=generated&licence=CC0`, { method: 'POST', headers: { 'content-type': 'application/zip' }, body: Buffer.from('PK\u0003\u0004\u0000\u0000a.glb\u0000') });
    assert.equal(imported.status, 409);

    assert.equal((await mock.json('DELETE', '/api/models3d/packs/generated')).status, 204);
    assert.equal((await mock.json('GET', '/api/models3d/models?source=generated')).body.models.length, 0);
  } finally {
    await mock.stop();
  }
});

const S = '/api/settings';

test('the engines say what each backend has: both run as a .NET service or in the container, and the backend is one setting for both', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'noservice' } });
  try {
    const { body } = await mock.json('GET', E);
    fits(E, 'get', 200, body);
    assert.deepEqual(Object.keys(body.engines.triposr.backends), ['dotnet', 'docker']);
    assert.deepEqual(Object.keys(body.engines.sf3d.backends), ['dotnet', 'docker']);
    assert.equal((await mock.json('GET', S)).body.model3d.backend, 'dotnet');
    assert.deepEqual(body.engines.triposr.backends.dotnet, { available: false, missing: ['service', 'weights'], reason: 'no_service', detail: body.engines.triposr.backends.dotnet.detail, need_bytes: 2_200_000_000 });
    assert.equal(body.engines.triposr.backends.docker.available, false);
    assert.deepEqual(body.engines.triposr.backends.docker.missing, ['weights']);
    assert.equal(body.engines.triposr.reason, 'no_service', 'the engine is judged by the backend in use');
  } finally {
    await mock.stop();
  }
});

test('the backend is a setting: the default is the .NET service, docker is saved with its source, an empty value goes back, and the engine is judged by the one in use', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'noservice' } });
  try {
    const first = await mock.json('GET', S);
    assert.deepEqual(first.body.model3d, { backend: 'dotnet', backend_source: 'default' });
    fits(S, 'get', 200, first.body);
    const saved = await mock.json('PUT', S, { model3d_backend: 'docker' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.model3d, { backend: 'docker', backend_source: 'setting' });
    // with the container the service is not what is missing: only the weights are
    assert.equal((await mock.json('GET', E)).body.engines.triposr.reason, 'no_weights');
    const back = await mock.json('PUT', S, { model3d_backend: '' });
    assert.deepEqual(back.body.model3d, { backend: 'dotnet', backend_source: 'default' });
    assert.equal((await mock.json('GET', E)).body.engines.triposr.reason, 'no_service');
    assert.equal((await mock.json('PUT', S, { model3d_backend: 'nope' })).status, 422);
  } finally {
    await mock.stop();
  }
});

test('docker that does not answer is a 422 no_docker, an external service is a 409, and a server with no 3D service has no block', async () => {
  const noDocker = await startMock({ env: { ...fast, MOCK_DOCKER: '0' } });
  try {
    const r = await noDocker.json('PUT', S, { model3d_backend: 'docker' });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.reason, 'no_docker');
    assert.equal((await noDocker.json('GET', S)).body.model3d.backend, 'dotnet');
  } finally {
    await noDocker.stop();
  }
  const ext = await startMock({ env: { ...fast, MOCK_MODEL3D_HOST: '1' } });
  try {
    assert.equal((await ext.json('PUT', S, { model3d_backend: 'docker' })).status, 409);
    assert.equal((await ext.json('GET', E)).body.engines.triposr.mode, 'external');
    assert.equal((await ext.json('POST', `${E}/triposr/start`)).status, 409);
  } finally {
    await ext.stop();
  }
  const none = await startMock({ env: { ...fast, MOCK_MODEL3D: 'none' } });
  try {
    assert.equal((await none.json('GET', S)).body.model3d, undefined);
  } finally {
    await none.stop();
  }
});

test('changing the backend stops what ran on the old one', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'running' } });
  try {
    assert.equal((await mock.json('GET', E)).body.engines.triposr.available, true);
    assert.equal((await mock.json('PUT', S, { model3d_backend: 'docker' })).status, 200);
    const after = (await mock.json('GET', E)).body.engines.triposr;
    assert.equal(after.container.state, 'stopped');
    assert.equal(after.reason, 'not_running');
  } finally {
    await mock.stop();
  }
});

test('each engine has its own service: starting one does not start the other, and stopping stops only that one', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D_SF3D: 'ready' } });
  try {
    await ready(mock);
    const both = (await mock.json('GET', E)).body.engines;
    assert.equal(both.triposr.container.state, 'running');
    assert.equal(both.sf3d.container.state, 'stopped');
    assert.equal(both.sf3d.reason, 'not_running');
    assert.equal((await mock.json('POST', `${E}/triposr/stop`)).body.container.state, 'stopped');
    assert.equal((await mock.json('GET', E)).body.engines.sf3d.container.state, 'stopped');
  } finally {
    await mock.stop();
  }
});

test('the plan is for a backend and lists the parts it would run in order; parts can be asked for, and what the backend does not have is a 422', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'noservice' } });
  try {
    const dotnet = await mock.json('POST', `${E}/triposr/install`, {});
    assert.equal(dotnet.status, 200);
    fits(`${E}/{engine}/install`, 'post', 200, dotnet.body);
    assert.equal(dotnet.body.plan.backend, 'dotnet');
    assert.deepEqual(dotnet.body.plan.parts, ['service', 'weights']);
    assert.deepEqual(dotnet.body.plan.missing, ['triposr/config.yaml', 'triposr/model.ckpt']);
    // the container can be installed before it is chosen
    const docker = await mock.json('POST', `${E}/triposr/install`, { backend: 'docker' });
    assert.deepEqual(docker.body.plan.parts, ['weights']);
    assert.equal((await mock.json('GET', S)).body.model3d.backend, 'dotnet', 'asking for a plan chooses nothing');
    const only = await mock.json('POST', `${E}/triposr/install`, { parts: ['weights'] });
    assert.deepEqual(only.body.plan.parts, ['weights']);
    const wrong = await mock.json('POST', `${E}/triposr/install`, { backend: 'docker', parts: ['service'] });
    assert.equal(wrong.status, 422);
    assert.match(wrong.body.error.message, /parts: image and weights for docker, not service/);
    // the weights of sf3d need the saved key, for the .NET service too, and the refusal comes before anything is downloaded
    for (const backend of ['dotnet', 'docker']) {
      const sf = await mock.json('POST', `${E}/sf3d/install`, { backend });
      assert.equal(sf.status, 422);
      assert.equal(sf.body.error.reason, 'key_missing');
    }
    // the image is TripoSR's only: the container of sf3d is built by hand
    const image = await mock.json('POST', `${E}/sf3d/install`, { backend: 'docker', parts: ['image'] });
    assert.equal(image.status, 422);
    assert.match(image.body.error.message, /parts: weights for docker, not image/);
    // the service alone does not need the key
    const service = await mock.json('POST', `${E}/sf3d/install`, { backend: 'dotnet', parts: ['service'] });
    assert.equal(service.status, 200, 'sf3d has the service part');
    assert.deepEqual(service.body.plan.parts, ['service']);
    assert.ok(service.body.plan.missing.length === 0);
  } finally {
    await mock.stop();
  }
});

test('a confirmed install runs its parts in order, names the one that runs, and installs them; nothing missing is a 409', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'noservice' } });
  try {
    const job = await mock.json('POST', `${E}/triposr/install`, { confirm: true });
    assert.equal(job.status, 202);
    fits(`${E}/{engine}/install`, 'post', 202, job.body);
    assert.equal(job.body.install.backend, 'dotnet');
    assert.deepEqual(job.body.install.parts, ['service', 'weights']);
    assert.equal(job.body.install.part, 'service');
    const seen = new Set();
    const done = await until(async () => {
      const r = await mock.json('GET', `/api/models3d/installs/${job.body.install.id}`);
      fits('/api/models3d/installs/{id}', 'get', 200, r.body);
      if (r.body.part) seen.add(r.body.part);
      return r.body.state === 'done' ? r.body : null;
    });
    assert.deepEqual([...seen], ['service', 'weights']);
    assert.ok(done.log.length > 2);
    assert.equal((await mock.json('GET', E)).body.engines.triposr.reason, 'not_running');
    assert.equal((await mock.json('POST', `${E}/triposr/install`, {})).status, 409);
  } finally {
    await mock.stop();
  }
});

test('a part that fails ends the job naming it', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL3D: 'noservice', MOCK_INSTALL_FAIL: 'weights' } });
  try {
    const job = await mock.json('POST', `${E}/triposr/install`, { confirm: true });
    const failed = await until(async () => {
      const r = await mock.json('GET', `/api/models3d/installs/${job.body.install.id}`);
      return r.body.state === 'failed' ? r.body : null;
    });
    assert.match(failed.error, /^weights: /);
    assert.equal(failed.part, 'weights');
    // the service was installed before the weights failed
    assert.equal((await mock.json('GET', E)).body.engines.triposr.backends.dotnet.missing.join(), 'weights');
  } finally {
    await mock.stop();
  }
});
