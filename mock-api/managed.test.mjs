// `managed=all` of the mock: the animations of the music mode (`api-mm-` pieces, `kind: music_motion`) join the projects, the storage and the clips; `include` never lists
// one; any other value is a 400 that names both; the piece's own PATCH and DELETE answer the refusals of the contract.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './testkit.mjs';

let m;
before(async () => {
  m = await startMock({ args: ['--speed', '100'] });
});
after(() => m.stop());

const pieces = async () => (await m.json('GET', '/api/music-motion/pieces')).body;

test('managed=all adds the animations to the projects with their kind and client; include does not', async () => {
  const all = (await m.json('GET', '/api/projects?managed=all')).body;
  const rows = all.filter((p) => p.kind === 'music_motion');
  assert.ok(rows.length > 0, 'the sample pieces are listed');
  assert.deepEqual([...new Set(rows.map((p) => p.client))], ['sample']);
  assert.ok(all.some((p) => p.id === 'demo'), 'the ordinary projects stay');
  const include = (await m.json('GET', '/api/projects?managed=include')).body;
  assert.ok(!include.some((p) => p.kind === 'music_motion'), 'include lists no animation');
  assert.ok(!(await m.json('GET', '/api/projects')).body.some((p) => p.kind === 'music_motion'), 'nor does a plain listing');
});

test('?client= keeps the animations of those clients', async () => {
  const sample = (await m.json('GET', '/api/projects?managed=all&client=sample')).body;
  assert.ok(sample.length > 0 && sample.every((p) => p.client === 'sample'));
  const none = (await m.json('GET', '/api/projects?managed=all&client=other-app')).body;
  assert.ok(!none.some((p) => p.kind === 'music_motion'));
});

test('a value of managed that is neither include nor all is a 400 that names both, on every listing', async () => {
  for (const path of ['/api/projects', '/api/storage', '/api/clips', '/api/library', '/api/library/songs']) {
    const r = await m.json('GET', `${path}?managed=every`);
    assert.equal(r.status, 400, path);
    assert.match(r.body.error.message, /include/);
    assert.match(r.body.error.message, /all/);
    assert.equal((await m.json('GET', `${path}?managed=all`)).status, 200, `${path} accepts all`);
  }
});

test('the storage lists each animation with its size, kind and folder only with managed=all', async () => {
  const plain = (await m.json('GET', '/api/storage')).body;
  assert.ok(!plain.projects.some((p) => p.kind === 'music_motion'));
  const all = (await m.json('GET', '/api/storage?managed=all')).body;
  const rows = all.projects.filter((p) => p.kind === 'music_motion');
  assert.ok(rows.length > 0 && rows.every((p) => p.total_bytes > 0 && p.client === 'sample'));
  assert.ok(rows.every((p) => all.media.projects.some((q) => q.id === p.id)));
});

test('the clips of a rendered animation carry project_kind and client, and the same filters apply', async () => {
  assert.deepEqual((await m.json('GET', '/api/clips')).body, { clips: [] });
  const clips = (await m.json('GET', '/api/clips?managed=all')).body.clips;
  assert.ok(clips.length > 0);
  assert.ok(clips.every((c) => c.project_kind === 'music_motion' && c.client === 'sample' && c.kind === 'clip'));
  const one = clips[0].project;
  assert.deepEqual((await m.json('GET', `/api/clips?managed=all&project=${one}`)).body.clips.map((c) => c.project), [one]);
  assert.ok(!(await m.json('GET', `/api/clips?managed=all&exclude=${one}`)).body.clips.some((c) => c.project === one));
});

// A piece made now has an id like the server's (`api-mm-…`), which is how the dashboard tells it from a project; the sample's pieces keep the names of the dataset.
const SONG = { project: 'demo-musica', track_id: 'track-1', variant: 0 };
const made = async (client) => {
  const r = await m.json('POST', '/api/music-motion/pieces', { ...SONG, client });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.id, /^api-mm-/);
  return r.body.id;
};

test('the label of an animation changes by its own route, the list follows, and the project route refuses it', async () => {
  const id = await made('sample');
  assert.equal((await m.json('PATCH', `/api/music-motion/pieces/${id}`, { client: 'other-app' })).status, 200);
  assert.equal((await m.json('GET', '/api/projects?managed=all')).body.find((p) => p.id === id).client, 'other-app');
  const refused = await m.json('PATCH', `/api/projects/${id}`, { client: 'x' });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error.message, /PATCH \/api\/music-motion\/pieces\/\{id\}/);
  assert.equal((await m.json('PATCH', '/api/music-motion/pieces/api-mm-none', { client: 'x' })).status, 404);
  assert.equal((await m.json('PATCH', `/api/music-motion/pieces/${id}`, { client: 'Bad Name' })).status, 422);
});

test('the label of an animation that is being drawn cannot change: 409 with the reason, and the label stays; deleting it cancels the render and deletes it', async () => {
  const id = await made('sample');
  assert.equal((await m.json('POST', `/api/music-motion/pieces/${id}/render`, {})).status, 202);
  const busy = await m.json('PATCH', `/api/music-motion/pieces/${id}`, { client: 'other-app' });
  assert.equal(busy.status, 409);
  assert.match(busy.body.error.message, /being drawn/);
  assert.equal((await m.json('GET', '/api/projects?managed=all')).body.find((p) => p.id === id).client, 'sample');
  // deleting cancels the render and deletes the piece (the server's own answer, 204), so the row is gone at once
  assert.equal((await m.json('DELETE', `/api/music-motion/pieces/${id}`)).status, 204);
  assert.ok(!(await m.json('GET', '/api/projects?managed=all')).body.some((p) => p.id === id));
});

test('an animation is deleted by its own route and leaves every listing', async () => {
  const id = await made('other-app');
  assert.ok((await m.json('GET', '/api/projects?managed=all')).body.some((p) => p.id === id));
  assert.equal((await m.json('DELETE', `/api/music-motion/pieces/${id}`)).status, 204);
  assert.ok(!(await m.json('GET', '/api/projects?managed=all')).body.some((p) => p.id === id));
  assert.ok(!(await m.json('GET', '/api/storage?managed=all')).body.projects.some((p) => p.id === id));
});

test('the project of an animation answers its project routes: the row, an empty history, name and content, and a copy as an ordinary project', async () => {
  const id = await made('sample');
  await m.json('POST', `/api/music-motion/pieces/${id}/render`, {});
  const row = (await m.json('GET', `/api/projects/${id}`)).body;
  assert.deepEqual([row.id, row.mode, row.kind, row.client], [id, 'video', 'music_motion', 'sample']);
  assert.deepEqual((await m.json('GET', `/api/projects/${id}/versions`)).body, []);
  const renamed = await m.json('PATCH', `/api/projects/${id}`, { name: 'Mi animación', adult: false });
  assert.equal(renamed.status, 200);
  assert.deepEqual([renamed.body.name, renamed.body.adult], ['Mi animación', false]);
  assert.equal((await m.json('PATCH', `/api/projects/${id}`, { client: 'x' })).status, 400, 'the label goes by the piece route');
  const copy = await m.json('POST', `/api/projects/${id}/duplicate`, { new_id: 'zz-copia-animacion' });
  assert.equal(copy.status, 201);
  const made2 = (await m.json('GET', '/api/projects/zz-copia-animacion')).body;
  assert.deepEqual([made2.mode, made2.client], ['video', 'sample']);
  assert.ok(made2.scene_count > 0);
  assert.equal((await m.json('DELETE', '/api/projects/zz-copia-animacion')).status, 204);
  assert.equal((await m.json('DELETE', `/api/music-motion/pieces/${id}`)).status, 204);
});
