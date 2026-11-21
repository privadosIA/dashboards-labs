// The backend of the music engines as the mock simulates it: the setting, what each backend has, start and stop, and the installs (plan, job, events).
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
/** The answer of an operation fits the schema the contract gives its response (`code`). */
const fits = (path, method, code, body) => {
  let schema = spec.paths[path][method].responses[code];
  for (let i = 0; schema?.$ref && i < 10; i++) schema = schema.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec);
  const validate = ajv.compile({ ...schema.content['application/json'].schema, components: spec.components });
  assert.ok(validate(body), `${method.toUpperCase()} ${path} ${code}: ${ajv.errorsText(validate.errors, { dataVar: '' })}`);
};

const E = '/api/music/engines';
const fast = { MOCK_INSTALL_MS: '120' };
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 30));
  }
};
const settings = async (mock) => (await mock.json('GET', '/api/settings')).body;

test('the settings say the backend and where it comes from; saving one changes the next read and an empty text removes it', async () => {
  const mock = await startMock({ env: fast });
  try {
    const first = await settings(mock);
    for (const block of [first.heartmula, first.diffrhythm2]) assert.deepEqual([block.backend, block.backend_source], ['dotnet', 'default']);
    const saved = await mock.json('PUT', '/api/settings', { heartmula_backend: 'docker' });
    assert.equal(saved.status, 200);
    assert.deepEqual([saved.body.heartmula.backend, saved.body.heartmula.backend_source], ['docker', 'setting']);
    assert.equal(saved.body.diffrhythm2.backend, 'dotnet');
    assert.equal((await settings(mock)).heartmula.backend, 'docker');
    const removed = await mock.json('PUT', '/api/settings', { heartmula_backend: '' });
    assert.deepEqual([removed.body.heartmula.backend, removed.body.heartmula.backend_source], ['dotnet', 'default']);
    assert.equal((await mock.json('PUT', '/api/settings', { heartmula_backend: 'podman' })).status, 422);
  } finally {
    mock.stop();
  }
});

test('with no Docker the docker backend says so, cannot be chosen and cannot be installed (a 422 with no_docker)', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_DOCKER: '0' } });
  try {
    const engines = (await mock.json('GET', E)).body.engines;
    assert.equal(engines.heartmula.backends.docker.available, false);
    assert.equal(engines.heartmula.backends.docker.reason, 'no_docker');
    assert.ok(engines.heartmula.backends.docker.missing.includes('docker'));
    const chosen = await mock.json('PUT', '/api/settings', { heartmula_backend: 'docker' });
    assert.equal(chosen.status, 422);
    assert.equal(chosen.body.error.reason, 'no_docker');
    assert.equal((await settings(mock)).heartmula.backend, 'dotnet', 'nothing was saved');
    const plan = await mock.json('POST', `${E}/heartmula/install`, { backend: 'docker' });
    assert.equal(plan.status, 422);
    assert.equal(plan.body.error.reason, 'no_docker');
  } finally {
    mock.stop();
  }
});

test('each backend says what it lacks, in order, with the size, as the mock starts: the images are built and the weights are not', async () => {
  const mock = await startMock({ env: fast });
  try {
    const { heartmula, diffrhythm2 } = (await mock.json('GET', E)).body.engines;
    assert.equal(heartmula.backends.docker.available, false);
    assert.deepEqual(heartmula.backends.docker.missing, ['weights']);
    assert.equal(heartmula.backends.docker.reason, 'no_weights');
    assert.ok(heartmula.backends.docker.need_bytes > 20e9);
    assert.deepEqual(diffrhythm2.backends.dotnet.missing, ['weights']);
    assert.equal(heartmula.available, false);
    assert.equal(heartmula.reason, 'no_weights', 'what is used now is the .NET service, and it lacks the weights');
  } finally {
    mock.stop();
  }
});

test('the plan lists only what is missing with its sizes, its licences and the disk; it changes nothing; the disk that does not fit is refused on confirm', async () => {
  const mock = await startMock({ env: fast });
  try {
    const plan = await mock.json('POST', `${E}/diffrhythm2/install`, { backend: 'docker' });
    assert.equal(plan.status, 200);
    assert.deepEqual(plan.body.parts.map((p) => p.part), ['weights']);
    assert.match(plan.body.parts[0].licenses[0], /CC-BY-NC/);
    assert.equal(plan.body.total_bytes, plan.body.parts[0].need_bytes);
    assert.equal(plan.body.disk[0].sufficient, true);
    assert.equal(plan.body.confirm_required, true);
    fits('/api/music/engines/{engine}/install', 'post', '200', plan.body);
    assert.deepEqual((await mock.json('GET', '/api/music/installs')).body.installs, [], 'a plan starts nothing');
    assert.equal((await mock.json('POST', `${E}/heartmula/install`, { backend: 'docker', parts: ['service'] })).status, 422, 'service is not a part of docker');
    assert.equal((await mock.json('POST', `${E}/clap/install`, {})).status, 404);
  } finally {
    mock.stop();
  }
  const small = await startMock({ env: { ...fast, MOCK_DISK_FREE_GB: '5' } });
  try {
    const plan = await small.json('POST', `${E}/heartmula/install`, { confirm: false });
    assert.equal(plan.body.disk[0].sufficient, false);
    const refused = await small.json('POST', `${E}/heartmula/install`, { confirm: true });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error.reason, 'no_disk');
    assert.match(refused.body.error.message, /lacks .* GB/);
  } finally {
    small.stop();
  }
});

test('an install is a job: its parts run in order, the events replay and end, and when it is done the engine has what it lacked', async () => {
  const mock = await startMock({ env: fast });
  try {
    const started = await mock.json('POST', `${E}/heartmula/install`, { confirm: true });
    assert.equal(started.status, 202);
    const id = started.body.install.id;
    assert.equal(started.body.install.state, 'running');
    fits('/api/music/engines/{engine}/install', 'post', '202', started.body);
    // another one while it runs is a 409
    assert.equal((await mock.json('POST', `${E}/diffrhythm2/install`, { confirm: true })).status, 409);
    const done = await until(async () => {
      const j = (await mock.json('GET', `/api/music/installs/${id}`)).body.install;
      return j.state === 'done' ? j : null;
    });
    assert.deepEqual(done.parts.map((p) => [p.part, p.state]), [['weights', 'done']]);
    assert.ok(done.finished_at);
    const listed = await mock.json('GET', '/api/music/installs');
    assert.equal(listed.body.installs[0].id, id);
    fits('/api/music/installs', 'get', '200', listed.body);
    fits('/api/music/installs/{id}', 'get', '200', { install: done });
    // the events of a finished job replay what happened and end
    const events = await (await mock.get(`/api/music/installs/${id}/events`)).text();
    assert.match(events, /event: state/);
    assert.match(events, /event: log/);
    assert.ok(events.trimEnd().endsWith('event: stream-end\ndata: {}'));
    assert.equal((await mock.json('GET', E)).body.engines.heartmula.backends.dotnet.available, true);
    assert.equal((await mock.json('POST', `${E}/heartmula/install`, { confirm: true })).status, 409, 'nothing is missing now');
  } finally {
    mock.stop();
  }
});

test('a cancelled install is left as it ended; one that failed half way is repeated and does only what is missing', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_INSTALL_MS: '400' } });
  try {
    // dotnet lacks only the weights; to have two parts, take away the service: install for diffrhythm2 with docker having image built is one part too, so cancel the first
    const job = (await mock.json('POST', `${E}/heartmula/install`, { confirm: true })).body.install;
    const cancelled = await mock.json('POST', `/api/music/installs/${job.id}/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.install.state, 'cancelled');
    fits('/api/music/installs/{id}/cancel', 'post', '200', cancelled.body);
    assert.ok(cancelled.body.install.finished_at);
    assert.deepEqual(cancelled.body.install.parts.map((p) => p.state), ['cancelled'], 'the part that ran is cancelled');
    assert.equal((await mock.json('POST', '/api/music/installs/nope/cancel')).status, 404);
    // the engine still lacks the weights, so a new install is allowed
    assert.equal((await mock.json('POST', `${E}/heartmula/install`, { confirm: true })).status, 202);
  } finally {
    mock.stop();
  }
  const failing = await startMock({ env: { ...fast, MOCK_INSTALL_FAIL: 'weights' } });
  try {
    const job = (await failing.json('POST', `${E}/diffrhythm2/install`, { confirm: true })).body.install;
    const failed = await until(async () => {
      const j = (await failing.json('GET', `/api/music/installs/${job.id}`)).body.install;
      return j.state === 'failed' ? j : null;
    });
    assert.deepEqual(failed.parts.map((p) => p.state), ['failed']);
    assert.match(failed.error, /weights/);
    const again = (await failing.json('POST', `${E}/diffrhythm2/install`, { confirm: true })).body.install;
    const done = await until(async () => {
      const j = (await failing.json('GET', `/api/music/installs/${again.id}`)).body.install;
      return j.state === 'done' ? j : null;
    });
    assert.equal(done.parts.length, 1);
  } finally {
    failing.stop();
  }
});

test('start and stop act on what the backend in use has: a lacking one is a 422 with the reason, a ready one starts and shows running, an address makes it external', async () => {
  const mock = await startMock({ env: fast });
  try {
    const lacking = await mock.json('POST', `${E}/heartmula/start`, {});
    assert.equal(lacking.status, 422);
    assert.equal(lacking.body.error.reason, 'no_weights');
    // install what is missing, then start
    const job = (await mock.json('POST', `${E}/heartmula/install`, { confirm: true })).body.install;
    await until(async () => (await mock.json('GET', `/api/music/installs/${job.id}`)).body.install.state === 'done');
    const started = await mock.json('POST', `${E}/heartmula/start`, { gpu: 1 });
    assert.equal(started.status, 202);
    assert.equal(started.body.container.state, 'starting');
    fits('/api/music/engines/{engine}/start', 'post', '202', started.body);
    // changing the backend while it starts is a 409
    assert.equal((await mock.json('PUT', '/api/settings', { heartmula_backend: 'docker' })).status, 409);
    const running = await until(async () => {
      const c = (await mock.json('GET', E)).body.engines.heartmula;
      return c.container.state === 'running' ? c : null;
    });
    assert.equal(running.available, true);
    assert.equal(running.container.port, 8787);
    assert.equal((await mock.json('POST', `${E}/heartmula/install`, { confirm: true })).status, 409, 'not while it runs');
    // changing the backend of a running engine stops it
    assert.equal((await mock.json('PUT', '/api/settings', { heartmula_backend: 'docker' })).status, 200);
    assert.equal((await mock.json('GET', E)).body.engines.heartmula.container.state, 'stopped');
    assert.equal((await mock.json('POST', `${E}/heartmula/stop`)).status, 200);
    // an address wins: external, and start and stop are a 409
    await mock.json('PUT', '/api/settings', { heartmula_host: 'musica.local' });
    const external = (await mock.json('GET', E)).body.engines.heartmula;
    assert.equal(external.mode, 'external');
    assert.equal((await mock.json('POST', `${E}/heartmula/start`, {})).status, 409);
    assert.equal((await mock.json('POST', `${E}/heartmula/stop`)).status, 409);
  } finally {
    mock.stop();
  }
});

test('LAION-CLAP is listed with its state, has no backends, starts and stops, and has no install', async () => {
  const mock = await startMock({ env: fast });
  try {
    const clap = (await mock.json('GET', E)).body.engines.clap;
    assert.deepEqual([clap.available, clap.reason, clap.container.state], [false, 'not_running', 'stopped']);
    assert.equal(clap.backends, undefined);
    const started = await mock.json('POST', `${E}/clap/start`, {});
    assert.equal(started.status, 202);
    const up = await until(async () => {
      const c = (await mock.json('GET', E)).body.engines.clap;
      return c.container.state === 'running' ? c : null;
    });
    assert.equal(up.available, true);
    assert.equal((await mock.json('POST', `${E}/clap/stop`)).body.container.state, 'stopped');
    assert.equal((await mock.json('POST', `${E}/clap/install`, {})).status, 404);
  } finally {
    mock.stop();
  }
});
