// The file of a library model (`GET /api/models3d/models/{pack}/{name}/file`, asked of the server in docs/server-request-model-file.md), as the mock serves it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { startMock } from './testkit.mjs';
import { parseGlb } from './models3d.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const P = '/api/models3d/packs';
const fast = { MOCK_MODELS_MS: '100' };
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const install = async (mock, id) => {
  await mock.json('POST', `${P}/${id}/install`);
  await until(async () => (await mock.json('GET', `${P}/${id}`)).body.state === 'installed');
};
const file = (mock, id, query = '', headers = {}) => fetch(`${mock.base}/api/models3d/models/${id}/file${query}`, { headers });

test('the file of an installed model is a binary glTF with the model\'s clips and triangles, with an ETag', async () => {
  const mock = await startMock({ env: fast });
  try {
    await install(mock, 'kenney-platformer-kit');
    const model = (await mock.json('GET', '/api/models3d/models/kenney-platformer-kit/chest')).body;
    const res = await file(mock, 'kenney-platformer-kit/chest');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'model/gltf-binary');
    assert.match(res.headers.get('etag'), /^"[0-9a-f]+"$/);
    assert.match(res.headers.get('cache-control'), /max-age/);
    const read = parseGlb(Buffer.from(await res.arrayBuffer()));
    assert.equal(read.ok, true);
    assert.deepEqual(read.clips, model.clips);
    assert.ok(Math.abs(read.triangles - model.triangles) <= 20, `a sample of ${read.triangles} triangles stands for the model's ${model.triangles}`);
  } finally {
    mock.stop();
  }
});

test('a second request with the ETag is a 304', async () => {
  const mock = await startMock({ env: fast });
  try {
    await install(mock, 'kenney-food-kit');
    const first = await file(mock, 'kenney-food-kit/pizza');
    const again = await file(mock, 'kenney-food-kit/pizza', '', { 'if-none-match': first.headers.get('etag') });
    assert.equal(again.status, 304);
  } finally {
    mock.stop();
  }
});

test('a model that is not in the library has no file: 404', async () => {
  const mock = await startMock({ env: fast });
  try {
    assert.equal((await file(mock, 'kenney-food-kit/pizza')).status, 404, 'its pack is not installed yet');
    assert.equal((await file(mock, 'nope/nothing')).status, 404);
  } finally {
    mock.stop();
  }
});

test('MOCK_MODEL_FILE=missing is a server that does not serve the route yet: every file is a 404', async () => {
  const mock = await startMock({ env: { ...fast, MOCK_MODEL_FILE: 'missing' } });
  try {
    await install(mock, 'kenney-food-kit');
    const res = await file(mock, 'kenney-food-kit/pizza');
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, 'not_found');
  } finally {
    mock.stop();
  }
});

test('with a token the file needs it: a bearer or a ticket, and no credentials is a 401', async () => {
  const mock = await startMock({ env: fast, args: ['--token', 's3cret'] });
  try {
    const auth = { authorization: 'Bearer s3cret' };
    await fetch(`${mock.base}${P}/kenney-food-kit/install`, { method: 'POST', headers: auth });
    await until(async () => (await (await fetch(`${mock.base}${P}/kenney-food-kit`, { headers: auth })).json()).state === 'installed');
    assert.equal((await file(mock, 'kenney-food-kit/pizza')).status, 401);
    assert.equal((await file(mock, 'kenney-food-kit/pizza', '', auth)).status, 200);
    assert.equal((await file(mock, 'kenney-food-kit/pizza', '?ticket=abc')).status, 200);
  } finally {
    mock.stop();
  }
});

test('a Range answers 206 with that part of the file and its Content-Range', async () => {
  const mock = await startMock({ env: fast });
  try {
    await install(mock, 'kenney-food-kit');
    const whole = Buffer.from(await (await file(mock, 'kenney-food-kit/pizza')).arrayBuffer());
    const part = await file(mock, 'kenney-food-kit/pizza', '', { range: 'bytes=0-19' });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 0-19/${whole.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), whole.subarray(0, 20));
    const tail = await file(mock, 'kenney-food-kit/pizza', '', { range: 'bytes=-8' });
    assert.deepEqual(Buffer.from(await tail.arrayBuffer()), whole.subarray(whole.length - 8));
  } finally {
    mock.stop();
  }
});

test('the route is in the contract the mock is built from, with the ticket as its other way in', () => {
  const op = yaml.load(readFileSync(resolve(here, '../contract/openapi.yaml'), 'utf8')).paths['/api/models3d/models/{pack}/{name}/file']?.get;
  assert.ok(op, 'GET /api/models3d/models/{pack}/{name}/file is in contract/openapi.yaml');
  assert.deepEqual(op.security, [{ bearer: [] }, { ticket: [] }]);
  assert.deepEqual(Object.keys(op.responses).sort(), ['200', '206', '304', '401', '404']);
});
