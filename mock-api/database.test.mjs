// The state the server keeps in its database, as the mock simulates it: a write changes the next read, and the documented errors answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMock } from './testkit.mjs';

const key = encodeURIComponent('demo-musica/track-1/7');

test('every save that changes the definition keeps the text it replaces; a restore brings one back and keeps what it replaced', async () => {
  const mock = await startMock();
  try {
    const original = (await mock.json('GET', '/api/projects/demo/config')).body.yaml;
    assert.deepEqual((await mock.json('GET', '/api/projects/demo/versions')).body, []);

    const first = `${original}# first\n`;
    const second = `${first}# second\n`;
    assert.equal((await mock.json('PUT', '/api/projects/demo/config', { yaml: first })).status, 200);
    assert.equal((await mock.json('PUT', '/api/projects/demo/config', { yaml: second })).status, 200);
    // a save that changes nothing makes no version
    await mock.json('PUT', '/api/projects/demo/config', { yaml: second });

    const list = await mock.json('GET', '/api/projects/demo/versions');
    assert.deepEqual(list.body.map((v) => [v.version, v.reason]), [[2, 'save'], [1, 'save']]);
    assert.equal(list.body[0].yaml, undefined);
    assert.equal(list.body[1].bytes, Buffer.byteLength(original));

    const text = await mock.json('GET', '/api/projects/demo/versions/1');
    assert.equal(text.body.yaml, original);

    const restored = await mock.json('POST', '/api/projects/demo/versions/1/restore');
    assert.equal(restored.status, 200);
    // the contract's answer: which version, and the project as it is now
    assert.equal(restored.body.restored, 1);
    assert.equal(restored.body.project.id, 'demo');
    assert.equal((await mock.json('GET', '/api/projects/demo/config')).body.yaml, original);
    const after = await mock.json('GET', '/api/projects/demo/versions');
    assert.equal(after.body.length, 3);
    assert.deepEqual([after.body[0].version, after.body[0].reason], [3, 'restore']);
    assert.equal((await mock.json('GET', '/api/projects/demo/versions/3')).body.yaml, second);

    assert.equal((await mock.json('GET', '/api/projects/demo/versions/99')).status, 404);
    assert.equal((await mock.json('POST', '/api/projects/demo/versions/99/restore')).status, 404);
    assert.equal((await mock.json('GET', '/api/projects/nobody/versions')).status, 404);

    // paged, newest first by default and by `version`
    const page = await mock.json('GET', '/api/projects/demo/versions?limit=1&sort=version');
    assert.deepEqual(page.body.map((v) => v.version), [1]);
    assert.equal(page.headers.get('x-total-count'), '3');
  } finally {
    mock.stop();
  }
});

test('a project is read one by one and its name, client and adult label are changed with PATCH', async () => {
  const mock = await startMock();
  try {
    assert.equal((await mock.json('GET', '/api/projects/demo')).body.id, 'demo');
    assert.equal((await mock.json('GET', '/api/projects/nobody')).status, 404);

    const patched = await mock.json('PATCH', '/api/projects/demo', { name: 'Renamed.1', client: 'dashboard-full', adult: false });
    assert.equal(patched.status, 200);
    assert.deepEqual([patched.body.name, patched.body.client, patched.body.adult], ['Renamed.1', 'dashboard-full', false]);
    assert.equal((await mock.json('GET', '/api/projects/demo/versions')).body[0].reason, 'patch');
    const listed = (await mock.json('GET', '/api/projects')).body.find((p) => p.id === 'demo');
    assert.equal(listed.name, 'Renamed.1');

    const cleared = await mock.json('PATCH', '/api/projects/demo', { client: null, adult: null });
    assert.deepEqual([cleared.body.client, cleared.body.adult], ['embedded', undefined]);

    assert.equal((await mock.json('PATCH', '/api/projects/demo', { colour: 'red' })).status, 400);
    // the declared name follows the id's rule, as on the real server
    const spaced = await mock.json('PATCH', '/api/projects/demo', { name: 'Has spaces' });
    assert.equal(spaced.status, 422);
    assert.match(spaced.body.error.message, /letters, digits/);
    assert.equal((await mock.json('PATCH', '/api/projects/demo', { client: 'Not Valid!' })).status, 422);
    assert.equal((await mock.json('PATCH', '/api/projects/nobody', { name: 'x' })).status, 404);

    // a project with an active run is not changed
    await mock.json('POST', '/api/projects/demo/runs', {});
    assert.equal((await mock.json('PATCH', '/api/projects/demo', { name: 'again' })).status, 409);
    assert.equal((await mock.json('POST', '/api/projects/demo/versions/1/restore')).status, 409);
  } finally {
    mock.stop();
  }
});

test('a song is rated, listed by its stars and read again; the rescan answers what it found', async () => {
  const mock = await startMock({ env: { MOCK_SAMPLE: 'off' } });
  try {
    const rated = await mock.json('PUT', `/api/library/songs/${key}/rating`, { stars: 5 });
    assert.equal(rated.status, 200);
    assert.equal(rated.body.rating, 5);
    assert.equal(rated.body.generator, 'ace-step');

    const best = await mock.json('GET', '/api/library/songs?min_rating=4');
    assert.deepEqual(best.body.map((s) => s.key), ['demo-musica/track-1/7']);
    assert.equal((await mock.json('GET', `/api/library/songs/${key}`)).body.rating, 5);
    assert.deepEqual((await mock.json('GET', '/api/library')).body.ratings, { 'demo-musica/track-1/7': 5 });

    const sorted = await mock.json('GET', '/api/library/songs?sort=-rating&limit=2');
    assert.equal(sorted.body[0].key, 'demo-musica/track-1/7');
    assert.equal(sorted.headers.get('x-total-count'), '3');
    assert.equal((await mock.json('GET', '/api/library/songs?q=MORNING%20LIGHT')).body.length, 1);
    assert.equal((await mock.json('GET', '/api/library/songs?project=demo-musica')).body.length, 2);
    assert.equal((await mock.json('GET', '/api/library/songs?sort=weight')).status, 400);
    assert.equal((await mock.json('GET', '/api/library/songs?min_rating=9')).status, 400);

    // the generator each song carries is a filter (ace-step when the song says none), counted in the total and combinable; another value is a 400
    const made = await mock.json('GET', '/api/library/songs?generator=ace-step&limit=50');
    assert.ok(made.body.length > 0 && made.body.every((s) => (s.generator ?? 'ace-step') === 'ace-step'));
    assert.equal(made.headers.get('x-total-count'), String(made.body.length));
    assert.equal((await mock.json('GET', '/api/library/songs?generator=heartmula')).body.length, 0);
    assert.equal((await mock.json('GET', '/api/library/songs?generator=ace-step&project=demo-musica')).body.length, 2);
    const bad = await mock.json('GET', '/api/library/songs?generator=ACE-STEP');
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, /generator must be ace-step, heartmula or diffrhythm2/);

    // 0 removes the stars
    await mock.json('PUT', `/api/library/songs/${key}/rating`, { stars: 0 });
    assert.equal((await mock.json('GET', '/api/library/songs?min_rating=1')).body.length, 0);
    assert.equal((await mock.json('PUT', `/api/library/songs/${key}/rating`, { stars: 6 })).status, 422);
    assert.equal((await mock.json('PUT', `/api/library/songs/${key}/rating`, {})).status, 400);
    assert.equal((await mock.json('PUT', '/api/library/songs/none/rating', { stars: 3 })).status, 404);
    assert.equal((await mock.json('GET', '/api/library/songs/none')).status, 404);

    assert.deepEqual((await mock.json('POST', '/api/library/rescan')).body, { added: 0, updated: 0, removed: 0 });
  } finally {
    mock.stop();
  }
});

test('a playlist is made, read with its songs in order, replaced and deleted; the songs of a playlist come in its order', async () => {
  const mock = await startMock({ env: { MOCK_SAMPLE: 'off' } });
  try {
    const made = await mock.json('POST', '/api/library/playlists', { name: 'Night drive', songs: ['morning-light/track-1/7', 'demo-musica/track-1/7'] });
    assert.equal(made.status, 201);
    assert.equal(made.body.id, 'night-drive');
    assert.equal((await mock.json('POST', '/api/library/playlists', { name: 'Night drive' })).status, 409);
    assert.equal((await mock.json('POST', '/api/library/playlists', { name: 'x', songs: ['no/such/song'] })).status, 422);
    assert.equal((await mock.json('POST', '/api/library/playlists', { name: 'a'.repeat(81) })).status, 422);
    assert.equal((await mock.json('POST', '/api/library/playlists', {})).status, 400);

    const inOrder = await mock.json('GET', '/api/library/songs?playlist=night-drive');
    assert.deepEqual(inOrder.body.map((s) => s.key), ['morning-light/track-1/7', 'demo-musica/track-1/7']);
    assert.equal((await mock.json('GET', '/api/library/songs?playlist=none')).status, 404);

    const replaced = await mock.json('PUT', '/api/library/playlists/night-drive', { name: 'Day drive', songs: ['demo-musica/track-1/7'] });
    assert.deepEqual(replaced.body, { id: 'night-drive', name: 'Day drive', songs: ['demo-musica/track-1/7'] });
    assert.deepEqual((await mock.json('GET', '/api/library/playlists/night-drive')).body.songs, ['demo-musica/track-1/7']);
    assert.equal((await mock.json('GET', '/api/library/playlists')).body.length, 1);
    assert.equal((await mock.json('GET', '/api/library')).body.playlists.length, 1);

    assert.equal((await mock.json('DELETE', '/api/library/playlists/night-drive')).status, 204);
    for (const [method, body] of [['GET'], ['PUT', { name: 'x' }], ['DELETE']]) assert.equal((await mock.json(method, '/api/library/playlists/night-drive', body)).status, 404, method);
  } finally {
    mock.stop();
  }
});

test('the library meta replaces the stars and the playlists and leaves out what is not a song', async () => {
  const mock = await startMock({ env: { MOCK_SAMPLE: 'off' } });
  try {
    const saved = await mock.json('PUT', '/api/library/meta', { ratings: { 'demo-musica/track-1/7': 4, 'gone/track-1/1': 3 }, playlists: [{ id: 'mix', name: 'Mix', songs: ['demo-musica/track-1/7', 'gone/track-1/1'] }] });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.ratings, { 'demo-musica/track-1/7': 4 });
    assert.deepEqual(saved.body.playlists[0].songs, ['demo-musica/track-1/7']);
    assert.equal((await mock.json('PUT', '/api/library/meta', { ratings: { 'demo-musica/track-1/7': 9 } })).status, 422);
  } finally {
    mock.stop();
  }
});

test('an old --persist file, written before these keys existed, still loads', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'mock-')), 'state.json');
  writeFileSync(file, JSON.stringify({ projects: { old: 'project: old\noutput:\n  mode: video\nscenes: []\n' }, runs: [], downloads: [], settings: {}, providers: [] }));
  const mock = await startMock({ args: ['--persist', file], env: { MOCK_SAMPLE: 'off' } });
  try {
    assert.equal((await mock.json('GET', '/api/projects/old')).status, 200);
    assert.deepEqual((await mock.json('GET', '/api/projects/old/versions')).body, []);
    assert.equal((await mock.json('GET', '/api/library/playlists')).status, 200);
  } finally {
    mock.stop();
  }
});
