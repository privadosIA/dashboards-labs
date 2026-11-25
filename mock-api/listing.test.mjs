// The paging protocol of the lists, against the real contract: the fields a list can be sorted by are the contract's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { pager, sortOf, isPaged } from './listing.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spec = yaml.load(readFileSync(process.env.SPEC ?? resolve(here, '../contract/openapi.yaml'), 'utf8'));

const run = (path, search, items, options) => {
  const url = new URL(`http://x${path}${search}`);
  return pager(spec, spec.paths[path].get, url)(items, options);
};
const projects = Array.from({ length: 30 }, (_, i) => ({ id: `p${String(i + 1).padStart(2, '0')}`, name: i % 2 ? `Zeta ${i}` : `Alfa ${i}`, updated_at: `2026-11-${String(i + 1).padStart(2, '0')}` }));

test('without any parameter a list answers every item, in its order, with no headers', () => {
  const [status, body, , headers] = run('/api/projects', '', projects);
  assert.equal(status, 200);
  assert.equal(body.length, 30);
  assert.equal(body[0].id, 'p01');
  assert.equal(headers, undefined);
});

test('a page: limit and offset, the total and both links', () => {
  const [status, body, , headers] = run('/api/projects', '?limit=10&offset=10', projects, { search: ['id', 'name'] });
  assert.equal(status, 200);
  assert.deepEqual(body.map((p) => p.id), projects.slice(10, 20).map((p) => p.id));
  assert.equal(headers['X-Total-Count'], '30');
  assert.match(headers.Link, /offset=20[^>]*>; rel="next"/);
  assert.match(headers.Link, /offset=0[^>]*>; rel="prev"/);
});

test('offset alone uses a limit of 100, and a page beyond the end is empty with the total', () => {
  const [, body, , headers] = run('/api/projects', '?offset=5', projects);
  assert.equal(body.length, 25);
  assert.doesNotMatch(headers.Link, /rel="next"/);
  assert.match(headers.Link, /rel="prev"/);
  const [, beyond, , h2] = run('/api/projects', '?limit=10&offset=500', projects);
  assert.deepEqual(beyond, []);
  assert.equal(h2['X-Total-Count'], '30');
});

test('sort: a field of the contract, with a minus for descending order; the default is the one the contract marks', () => {
  const [, desc] = run('/api/projects', '?sort=-updated_at&limit=3', projects);
  assert.deepEqual(desc.map((p) => p.id), ['p30', 'p29', 'p28']);
  const [, byName] = run('/api/projects', '?sort=name&limit=2', projects);
  assert.ok(byName[0].name.startsWith('Alfa'));
  // projects: `id` is the default; songs: `created_at`, newest first
  const [, byDefault] = run('/api/projects', '?limit=2', [...projects].reverse());
  assert.deepEqual(byDefault.map((p) => p.id), ['p01', 'p02']);
  const songs = [{ created_at: '2026-01-01' }, { created_at: '2026-03-01' }, { created_at: '2026-02-01' }];
  const [, newest] = run('/api/library/songs', '?limit=3', songs);
  assert.deepEqual(newest.map((s) => s.created_at), ['2026-03-01', '2026-02-01', '2026-01-01']);
});

test('q searches the fields the list names, without regard to case, and combines with a page', () => {
  const [, body, , headers] = run('/api/projects', '?q=ZETA&limit=5', projects, { search: ['id', 'name'] });
  assert.equal(body.length, 5);
  assert.ok(body.every((p) => /zeta/i.test(p.name)));
  assert.equal(headers['X-Total-Count'], '15');
});

test('a list that was only searched or sorted is not cut and sends no Link', () => {
  const [, body, , headers] = run('/api/projects', '?sort=-name', projects);
  assert.equal(body.length, 30);
  assert.equal(headers['X-Total-Count'], '30');
  assert.equal(headers.Link, undefined);
});

test('a value that is not valid is a 400 in the shape of the API; a bad sort field names the accepted ones', () => {
  for (const bad of ['?limit=0', '?limit=501', '?limit=x', '?offset=-1', '?offset=1.5']) {
    const [status, body] = run('/api/projects', bad, projects);
    assert.equal(status, 400, bad);
    assert.equal(body.error.code, 'invalid_request');
  }
  const [status, body] = run('/api/projects', '?sort=weight', projects);
  assert.equal(status, 400);
  for (const f of ['id', 'name', 'updated_at']) assert.ok(body.error.message.includes(f), f);
});

test('a list that is always a page (prompts): 50 unless limit, at most 200, the best match first with q', () => {
  const prompts = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, title: i === 7 ? 'cat' : `item ${i}`, prompt: i === 3 ? 'a cat' : 'x', created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }));
  const opts = { always: true, limitDefault: 50, limitMax: 200, search: ['title', 'prompt'], rank: (p, q) => (p.title.includes(q) ? 2 : 1), fallback: { field: 'created_at', reverse: true } };
  const [, first, , headers] = run('/api/prompts', '', prompts, opts);
  assert.equal(first.length, 50);
  assert.equal(headers['X-Total-Count'], '120');
  const [, ranked] = run('/api/prompts', '?q=cat', prompts, opts);
  assert.deepEqual(ranked.map((p) => p.id), ['s7', 's3']);
  assert.equal(run('/api/prompts', '?limit=201', prompts, opts)[0], 400);
});

test('the sort fields of every list are the ones its contract names', () => {
  const found = {};
  for (const [path, item] of Object.entries(spec.paths)) if (item.get && isPaged(spec, item.get)) found[path] = sortOf(spec, item.get).fields;
  assert.deepEqual(found, {
    '/api/projects': ['id', 'name', 'updated_at'],
    '/api/projects/{id}/versions': ['version'],
    '/api/library/songs': ['created_at', 'title', 'rating', 'duration'],
    '/api/prompts': ['title', 'created_at'],
    '/api/generations': ['created_at'],
    '/api/models3d/generations': ['created_at'],
    '/api/hyperframes/blocks': ['name', 'title'],
    '/api/music-motion/parts': ['name', 'updated_at'],
    '/api/music-motion/part-drafts': ['created_at', 'name'],
    '/api/music-motion/presets': ['created_at', 'name'],
    '/api/music-motion/references': ['created_at', 'title'],
    '/api/music-motion/learnings': ['created_at'],
    '/api/music-motion/pieces': ['created_at', 'title'],
    '/api/music-motion/library/characters': ['name'],
    '/api/music-motion/library/backgrounds': ['name'],
    '/api/image-edits': ['created_at'],
    '/api/video-edits': ['created_at'],
    '/api/motions': ['created_at', 'title'],
    '/api/models3d/models': [],
  });
});
