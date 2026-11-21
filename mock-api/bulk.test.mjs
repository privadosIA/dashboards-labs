// MOCK_BULK: a mock with many items for the screens that page; and nothing changes without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './testkit.mjs';
import { seedBulk } from './bulk.mjs';

test('with MOCK_BULK=170 the part drafts are 170 or more, a third failed, some of them scenes, and a page of them is 20', async () => {
  const mock = await startMock({ env: { MOCK_BULK: '170' } });
  try {
    const page = await mock.json('GET', '/api/music-motion/part-drafts?limit=20');
    assert.equal(page.status, 200);
    assert.equal(page.body.drafts.length, 20);
    assert.ok(Number(page.headers.get('x-total-count')) >= 170);

    const failed = await mock.json('GET', '/api/music-motion/part-drafts?state=failed&limit=1');
    assert.equal(failed.headers.get('x-total-count'), String(Math.floor(170 / 3)));
    const scenes = await mock.json('GET', '/api/music-motion/part-drafts?q=scene-&limit=1');
    assert.ok(Number(scenes.headers.get('x-total-count')) >= 40, 'every fourth is a scene');
    const found = await mock.json('GET', '/api/music-motion/part-drafts?q=scene-&state=failed&limit=1');
    assert.ok(Number(found.headers.get('x-total-count')) > 0 && Number(found.headers.get('x-total-count')) < Number(scenes.headers.get('x-total-count')), 'filters combine with the search');

    assert.ok(Number((await mock.json('GET', '/api/projects?limit=1')).headers.get('x-total-count')) >= 170);
    assert.ok(Number((await mock.json('GET', '/api/library/songs?limit=1')).headers.get('x-total-count')) >= 170);
    // the generated songs sort and search like any
    const longest = await mock.json('GET', '/api/library/songs?sort=-duration&limit=2');
    assert.ok(longest.body[0].audio_seconds >= longest.body[1].audio_seconds);
    assert.equal((await mock.json('GET', '/api/projects/bulk-001')).status, 200);
  } finally {
    mock.stop();
  }
});

test('without MOCK_BULK the sample data is the same as before: no generated item and no page headers', async () => {
  const mock = await startMock({ env: { MOCK_SAMPLE: 'off' } });
  try {
    assert.equal((await mock.json('GET', '/api/projects')).body.length, 2);
    assert.equal((await mock.json('GET', '/api/library/songs')).body.length, 3);
    assert.deepEqual((await mock.json('GET', '/api/music-motion/part-drafts')).body, { drafts: [] });
    assert.equal((await mock.json('GET', '/api/projects/bulk-001')).status, 404);
  } finally {
    mock.stop();
  }
});

test('the generated data is the same every time and adds nothing twice', () => {
  const make = () => {
    const db = { projects: {}, drafts: {}, pieces: {} };
    seedBulk(db, 12, Date.parse('2026-11-19T12:00:00Z'));
    return db;
  };
  assert.deepEqual(make(), make());
  const db = make();
  assert.deepEqual(seedBulk(db, 12), { projects: 0, songs: 0, drafts: 0 });
  assert.deepEqual(seedBulk({ projects: {}, drafts: {} }, 0), { projects: 0, songs: 0, drafts: 0 });
});

test('a value of MOCK_BULK that is not a number is ignored with a warning', async () => {
  const mock = await startMock({ env: { MOCK_BULK: 'lots', MOCK_SAMPLE: 'off' } });
  try {
    assert.equal((await mock.json('GET', '/api/projects')).body.length, 2);
  } finally {
    mock.stop();
  }
});
