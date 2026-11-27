// The client labels of the mock: the list with counts and colours, the colour kept and restored, the refusals (400), and the
// `PATCH {client}` of every kind of item (finished, running, unknown, invalid, removal).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './testkit.mjs';
import { defaultColor } from './clients.mjs';

let m;
before(async () => {
  m = await startMock({ args: ['--speed', '100'], env: { MOCK_MODEL3D: 'running', MOCK_MODEL3D_PICTURE_MS: '50', MOCK_MODEL3D_MODEL_MS: '50' } });
});
after(() => m.stop());

const wait = (ms) => new Promise((ok) => setTimeout(ms ? ok : ok, ms));
async function untilDone(path) {
  for (let i = 0; i < 100; i++) {
    const r = await m.json('GET', path);
    if (r.body.state === 'done' || r.body.state === 'failed') return r.body;
    await wait(50);
  }
  throw new Error(`${path} did not finish`);
}
const labels = async () => Object.fromEntries((await m.json('GET', '/api/clients')).body.map((l) => [l.name, l]));

test('the default colour is worked out from the name as the contract says', () => {
  assert.match(defaultColor('other-app'), /^#[0-9a-f]{6}$/);
  assert.equal(defaultColor('other-app'), defaultColor('other-app'));
  assert.notEqual(defaultColor('other-app'), defaultColor('claude-test'));
  // worked out apart from the code (sha256, first four bytes big-endian, modulo 360, then hsl(h, 55%, 50%)): "a" has hue 290, "other-app" hue 328
  assert.equal(defaultColor('a'), '#ae39c6');
  assert.equal(defaultColor('other-app'), '#c63984');
});

test('GET /api/clients lists the labels with counts, a colour and the newest use first', async () => {
  const gen = await m.json('POST', '/api/generations', { prompt: 'a cat', option: 'ltx', client: 'other-app' });
  assert.equal(gen.status, 202);
  const list = await m.json('GET', '/api/clients');
  assert.equal(list.status, 200);
  const found = list.body.find((l) => l.name === 'other-app');
  assert.equal(found.counts.generations, 1);
  assert.equal(found.total, Object.values(found.counts).reduce((a, b) => a + b, 0));
  assert.equal(found.color, defaultColor('other-app'));
  assert.ok(list.body.length >= 2, 'the seeded projects bring other labels');
  const times = list.body.map((l) => l.last_used);
  assert.deepEqual([...times].sort().reverse(), times, 'newest use first');
  await untilDone(`/api/generations/${gen.body.id}`);
});

test('PUT /api/clients/{name} keeps a colour and null restores the default', async () => {
  const set = await m.json('PUT', '/api/clients/other-app', { color: '#112233' });
  assert.deepEqual(set.body, { name: 'other-app', color: '#112233' });
  assert.equal((await labels())['other-app'].color, '#112233');
  const back = await m.json('PUT', '/api/clients/other-app', { color: null });
  assert.equal(back.body.color, defaultColor('other-app'));
  assert.equal((await labels())['other-app'].color, defaultColor('other-app'));
  // a label with no items may have a colour
  assert.equal((await m.json('PUT', '/api/clients/nobody-yet', { color: '#abcdef' })).status, 200);
});

test('a bad name, a bad colour and a body without color are a 400', async () => {
  for (const [name, body] of [['Video Studio', { color: '#112233' }], ['other-app', { color: 'red' }], ['other-app', { color: '#12345' }], ['other-app', {}], ['other-app', null]]) {
    const r = await m.json('PUT', `/api/clients/${encodeURIComponent(name)}`, body);
    assert.equal(r.status, 400, JSON.stringify([name, body]));
    assert.ok(r.body.error.message);
  }
});

test('PATCH client changes a finished generation, an image edit and a video edit, and the counts follow', async () => {
  const gen = (await m.json('POST', '/api/generations', { prompt: 'a dog', option: 'ltx', client: 'embedded' })).body;
  await untilDone(`/api/generations/${gen.id}`);
  const patched = await m.json('PATCH', `/api/generations/${gen.id}`, { client: 'claude-test' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.client, 'claude-test');
  assert.equal((await m.json('GET', `/api/generations/${gen.id}`)).body.client, 'claude-test');
  assert.equal((await labels())['claude-test'].counts.generations, 1);

  const edit = new FormData();
  edit.set('request', JSON.stringify({ prompt: 'make it blue' }));
  edit.set('image', new Blob([new Uint8Array([1, 2, 3])]), 'a.png');
  const made = await (await fetch(`${m.base}/api/image-edits`, { method: 'POST', body: edit })).json();
  await untilDone(`/api/image-edits/${made.id}`);
  assert.equal((await m.json('PATCH', `/api/image-edits/${made.id}`, { client: 'claude-test' })).body.client, 'claude-test');
  assert.equal((await labels())['claude-test'].counts.image_edits, 1);

  const video = new FormData();
  video.set('request', JSON.stringify({ tool: 'scale' }));
  video.set('video', new Blob([new Uint8Array([1, 2, 3])]), 'v.mp4');
  const vmade = await (await fetch(`${m.base}/api/video-edits`, { method: 'POST', body: video })).json();
  await untilDone(`/api/video-edits/${vmade.id}`);
  assert.equal((await m.json('PATCH', `/api/video-edits/${vmade.id}`, { client: 'claude-test' })).body.client, 'claude-test');
  assert.equal((await labels())['claude-test'].counts.video_edits, 1);
});

test('PATCH client changes a finished 3D generation', async () => {
  const gen = await m.json('POST', '/api/models3d/generations', { prompt: 'a chair', client: 'dashboard-full' });
  assert.equal(gen.status, 202, JSON.stringify(gen.body));
  await untilDone(`/api/models3d/generations/${gen.body.id}`);
  const patched = await m.json('PATCH', `/api/models3d/generations/${gen.body.id}`, { client: 'claude-test' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.client, 'claude-test');
  assert.equal((await labels())['claude-test'].counts.model_generations, 1);
});

test('null or an empty text removes the label (unknown applies again)', async () => {
  const gen = (await m.json('POST', '/api/generations', { prompt: 'a bird', option: 'ltx', client: 'claude-test' })).body;
  await untilDone(`/api/generations/${gen.id}`);
  assert.equal((await m.json('PATCH', `/api/generations/${gen.id}`, { client: null })).body.client, 'unknown');
  await m.json('PATCH', `/api/generations/${gen.id}`, { client: 'claude-test' });
  assert.equal((await m.json('PATCH', `/api/generations/${gen.id}`, { client: '' })).body.client, 'unknown');
});

test('an item that is queued or running answers 409 and keeps its label', async () => {
  const gen = (await m.json('POST', '/api/generations', { prompt: 'a fish', option: 'ltx', client: 'other-app' })).body;
  const busy = await m.json('PATCH', `/api/generations/${gen.id}`, { client: 'claude-test' });
  assert.equal(busy.status, 409);
  assert.equal((await m.json('GET', `/api/generations/${gen.id}`)).body.client, 'other-app');
  await untilDone(`/api/generations/${gen.id}`);
});

test('an unknown id is a 404 and an invalid body a 400, for every kind', async () => {
  for (const path of ['/api/generations/nope', '/api/image-edits/nope', '/api/video-edits/nope', '/api/models3d/generations/nope']) {
    assert.equal((await m.json('PATCH', path, { client: 'claude-test' })).status, 404, path);
  }
  const gen = (await m.json('POST', '/api/generations', { prompt: 'a frog', option: 'ltx' })).body;
  await untilDone(`/api/generations/${gen.id}`);
  for (const body of [{ client: 'Claude Test' }, { client: 'a'.repeat(33) }, { client: 3 }, {}, { client: 'claude-test', name: 'x' }]) {
    assert.equal((await m.json('PATCH', `/api/generations/${gen.id}`, body)).status, 400, JSON.stringify(body));
  }
});

test('MOCK_CLIENT_LABELS=1 labels the seed projects and colours one label', async () => {
  const seeded = await startMock({ env: { MOCK_CLIENT_LABELS: '1' } });
  try {
    const list = (await seeded.json('GET', '/api/clients')).body;
    const names = list.map((l) => l.name).sort();
    // `sample` is the label of the animation the mock seeds: animations are counted too
    assert.deepEqual(names, ['claude-test', 'dashboard-full', 'other-app', 'sample']);
    assert.ok(list.find((l) => l.name === 'sample').counts.animations >= 1);
    assert.equal(list.find((l) => l.name === 'claude-test').color, '#d9822b');
    const projects = (await seeded.json('GET', '/api/projects')).body;
    assert.equal(projects.find((p) => p.id === 'demo').client, 'dashboard-full');
  } finally {
    seeded.stop();
  }
});

test('PATCH of a project with a client on an item of another kind names the route of its kind', async () => {
  const gen = (await m.json('POST', '/api/generations', { prompt: 'a lamp', option: 'ltx' })).body;
  const r = await m.json('PATCH', `/api/projects/${gen.id}`, { client: 'claude-test' });
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /PATCH \/api\/generations\/\{id\}/);
  await untilDone(`/api/generations/${gen.id}`);
});
