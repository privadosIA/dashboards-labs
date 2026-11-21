// The lists of a running mock answer the paging protocol: headers, CORS exposure, errors, and every list of the contract that declares a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { isPaged } from './listing.mjs';
import { startMock } from './testkit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spec = yaml.load(readFileSync(process.env.SPEC ?? resolve(here, '../contract/openapi.yaml'), 'utf8'));

test('a page of projects carries the total and the next page, and the headers are exposed to a browser', async () => {
  const mock = await startMock();
  try {
    const page = await mock.json('GET', '/api/projects?limit=1');
    assert.equal(page.status, 200);
    assert.equal(page.body.length, 1);
    assert.equal(page.headers.get('x-total-count'), '2');
    assert.match(page.headers.get('link'), /offset=1[^>]*>; rel="next"/);
    const exposed = page.headers.get('access-control-expose-headers');
    assert.match(exposed, /X-Total-Count/);
    assert.match(exposed, /Link/);

    const all = await mock.json('GET', '/api/projects');
    assert.equal(all.body.length, 2);
    assert.equal(all.headers.get('x-total-count'), null);

    const bad = await mock.json('GET', '/api/projects?sort=weight');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'invalid_request');
    assert.match(bad.body.error.message, /updated_at/);
  } finally {
    mock.stop();
  }
});

test('every list of the contract that declares a page answers one, with the total', async () => {
  const mock = await startMock();
  try {
    const lists = Object.entries(spec.paths).filter(([, item]) => item.get && isPaged(spec, item.get)).map(([path]) => path);
    assert.ok(lists.length >= 17, `the contract declares ${lists.length} paged lists`);
    const failed = [];
    for (const path of lists) {
      // a list under a project is asked for a project the mock has
      const res = await mock.json('GET', `${path.replace(/\{\w+\}/g, 'demo')}?limit=1`);
      if (res.status !== 200 || res.headers.get('x-total-count') === null) failed.push(`${path}: ${res.status}${res.status === 200 ? ' without X-Total-Count' : ''}`);
    }
    assert.deepEqual(failed, []);
  } finally {
    mock.stop();
  }
});
