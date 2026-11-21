// The animation library as the mock simulates it: the user's characters and backgrounds, the parts made without a draft, what was learned, the details of a piece, and the new optional fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './testkit.mjs';

const L = '/api/music-motion/library';
const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>${label}</text></svg>`;
const character = (name, extra = {}) => ({
  manifest: { name, description: 'A test character', version: 1, width: 200, height: 300, anchor: { x: 0.5, y: 1 }, poses: { idle: 'idle.svg', wave: 'wave.svg' }, expressions: ['neutral', 'happy'], default_pose: 'idle', default_expression: 'neutral', ...extra },
  files: { 'idle.svg': svg('idle'), 'wave.svg': svg('wave') },
});
const background = (name) => ({ manifest: { name, description: 'A test background', version: 1, file: 'bg.svg' }, files: { 'bg.svg': svg(name) } });
const SONG = { project: 'demo-musica', track_id: 'track-1', variant: 0 };

test('a character of the user is added, listed, read, replaced and deleted; the program ones are read-only', async () => {
  const mock = await startMock();
  try {
    const listed = await mock.json('GET', `${L}/characters`);
    assert.deepEqual(listed.body.characters.map((c) => c.source), ['builtin', 'builtin', 'builtin']);

    const added = await mock.json('POST', `${L}/characters`, character('robin'));
    assert.equal(added.status, 201);
    assert.equal(added.body.source, 'user');
    assert.equal(added.body.poses.wave, svg('wave'));

    const after = (await mock.json('GET', `${L}/characters`)).body.characters;
    assert.deepEqual(after.at(-1), { name: 'robin', description: 'A test character', poses: ['idle', 'wave'], expressions: ['neutral', 'happy'], source: 'user' });
    assert.equal((await mock.json('GET', `${L}/characters/robin`)).body.default_pose, 'idle');
    assert.ok((await mock.json('GET', '/api/music-motion/catalog')).body.characters.some((c) => c.name === 'robin'), 'the catalog lists it too');

    const replaced = await mock.json('PUT', `${L}/characters/robin`, character('robin', { description: 'Changed', width: 220 }));
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body.width, 220);
    assert.equal((await mock.json('GET', `${L}/characters?q=changed`)).body.characters.length, 1);

    // the program's are read-only; the name must not be taken; the path and the manifest agree
    assert.equal((await mock.json('PUT', `${L}/characters/bot`, character('bot'))).status, 403);
    assert.equal((await mock.json('DELETE', `${L}/characters/bot`)).status, 403);
    assert.equal((await mock.json('POST', `${L}/characters`, character('bot'))).status, 409);
    assert.equal((await mock.json('POST', `${L}/characters`, character('robin'))).status, 409);
    assert.equal((await mock.json('PUT', `${L}/characters/robin`, character('other'))).status, 422);
    assert.equal((await mock.json('PUT', `${L}/characters/nobody`, character('nobody'))).status, 404);

    assert.equal((await mock.json('DELETE', `${L}/characters/robin`)).status, 204);
    assert.equal((await mock.json('GET', `${L}/characters/robin`)).status, 404);
    assert.equal((await mock.json('DELETE', `${L}/characters/robin`)).status, 404);
    assert.equal((await mock.json('GET', `${L}/characters`)).body.characters.length, 3);
  } finally {
    mock.stop();
  }
});

test('an item that is not valid is a 422 with the problems and changes nothing', async () => {
  const mock = await startMock();
  try {
    const bad = character('evil');
    bad.files['idle.svg'] = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://x.test/a.png" onclick="x()"/></svg>';
    delete bad.files['wave.svg'];
    bad.files['extra.svg'] = svg('extra');
    const res = await mock.json('POST', `${L}/characters`, bad);
    assert.equal(res.status, 422);
    for (const problem of ['script', 'event handler', 'outside', 'wave.svg', 'extra.svg']) assert.ok(res.body.error.message.includes(problem), problem);
    assert.equal((await mock.json('GET', `${L}/characters/evil`)).status, 404);

    assert.equal((await mock.json('POST', `${L}/characters`, { files: {} })).status, 400);
    assert.equal((await mock.json('POST', `${L}/backgrounds`, { manifest: { name: 'nofile' } })).status, 422);
    assert.equal((await mock.json('POST', `${L}/characters`, character('Bad Name'))).status, 422);
  } finally {
    mock.stop();
  }
});

test('a background of the user is added, read, replaced and deleted, and a piece can use it', async () => {
  const mock = await startMock();
  try {
    assert.equal((await mock.json('GET', `${L}/backgrounds`)).body.backgrounds.length, 4);
    const added = await mock.json('POST', `${L}/backgrounds`, background('dusk'));
    assert.equal(added.status, 201);
    assert.deepEqual([added.body.name, added.body.source, added.body.svg], ['dusk', 'user', svg('dusk')]);
    assert.equal((await mock.json('GET', `${L}/backgrounds/dusk`)).body.svg, svg('dusk'));
    assert.equal((await mock.json('GET', `${L}/backgrounds?q=test`)).body.backgrounds.length, 1);

    // the script checks read the user's library too
    const piece = (await mock.json('POST', '/api/music-motion/pieces', SONG)).body;
    const script = (await mock.json('GET', `/api/music-motion/pieces/${piece.id}`)).body.script;
    script.pieces[0].stage = { background: 'dusk' };
    assert.equal((await mock.json('PUT', `/api/music-motion/pieces/${piece.id}/script`, script)).status, 200);

    assert.equal((await mock.json('PUT', `${L}/backgrounds/dusk`, { ...background('dusk'), manifest: { name: 'dusk', description: 'Changed', version: 1, file: 'bg.svg' } })).status, 200);
    assert.equal((await mock.json('PUT', `${L}/backgrounds/stage`, background('stage'))).status, 403);
    assert.equal((await mock.json('DELETE', `${L}/backgrounds/stage`)).status, 403);
    assert.equal((await mock.json('DELETE', `${L}/backgrounds/dusk`)).status, 204);
    assert.equal((await mock.json('DELETE', `${L}/backgrounds/dusk`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('a part of the user is made without a draft, joins the catalog and is listed in pages', async () => {
  const mock = await startMock();
  try {
    const manifest = JSON.stringify({ name: 'pulse-bar', description: 'A bar that pulses', params: [] });
    const made = await mock.json('POST', '/api/music-motion/parts', { manifest, fragment: '<div class="bar"></div>' });
    assert.equal(made.status, 201);
    assert.deepEqual([made.body.name, made.body.source], ['pulse-bar', 'user']);
    assert.equal((await mock.json('GET', '/api/music-motion/parts/pulse-bar')).status, 200);

    const found = await mock.json('GET', '/api/music-motion/parts?q=PULSE-BAR&limit=5');
    assert.deepEqual(found.body.map((p) => p.name), ['pulse-bar']);
    assert.equal(found.headers.get('x-total-count'), '1');
    assert.ok((await mock.json('GET', '/api/music-motion/catalog')).body.parts.some((p) => p.name === 'pulse-bar'));

    const mine = await mock.json('GET', '/api/music-motion/parts?source=user&sort=-updated_at');
    assert.equal(mine.body.at(0).name, 'pulse-bar');
    assert.equal((await mock.json('GET', '/api/music-motion/parts?source=builtin')).body.every((p) => p.source === 'builtin'), true);
    assert.equal((await mock.json('GET', '/api/music-motion/parts?source=nobody')).status, 400);
    assert.equal((await mock.json('GET', '/api/music-motion/parts?sort=cost')).status, 400);

    assert.equal((await mock.json('POST', '/api/music-motion/parts', { manifest, fragment: '<div></div>' })).status, 409);
    assert.equal((await mock.json('POST', '/api/music-motion/parts', { manifest: JSON.stringify({ name: 'toggle' }), fragment: '<div></div>' })).status, 422);
    assert.equal((await mock.json('POST', '/api/music-motion/parts', { manifest: JSON.stringify({ name: 'moving' }), fragment: '<div style="animation: x 1s"></div>' })).status, 422);
    assert.equal((await mock.json('POST', '/api/music-motion/parts', { manifest })).status, 400);
    assert.equal((await mock.json('POST', '/api/music-motion/parts', { manifest: JSON.stringify({ name: 'nochrome' }), fragment: 'nochrome' })).status, 503);
    assert.equal((await mock.json('GET', '/api/music-motion/parts?name=pulse-bar')).status, 200);
  } finally {
    mock.stop();
  }
});

test('a learning is made from a ready reference, listed with its filters, and deleted when it is not running', async () => {
  const mock = await startMock({ args: ['--speed', '50'] });
  try {
    const refs = (await mock.json('GET', '/api/music-motion/references')).body.references;
    const ready = refs.find((r) => r.state === 'ready');
    assert.ok(ready, 'the sample has a ready reference');

    const started = await mock.json('POST', `/api/music-motion/references/${ready.id}/learn`, { strictness: 'high' });
    assert.equal(started.status, 202);
    assert.equal(started.body.state, 'running');
    assert.equal((await mock.json('POST', `/api/music-motion/references/${ready.id}/learn`, {})).status, 409);
    assert.equal((await mock.json('DELETE', `/api/music-motion/learnings/${started.body.id}`)).status, 409);
    assert.equal((await mock.json('POST', '/api/music-motion/references/none/learn', {})).status, 404);

    await new Promise((ok) => setTimeout(ok, 400));
    const list = await mock.json('GET', `/api/music-motion/learnings?reference=${ready.id}&state=ready`);
    assert.deepEqual(list.body.learnings.map((l) => [l.id, l.state, l.strictness]), [[started.body.id, 'ready', 'high']]);
    assert.equal((await mock.json('GET', '/api/music-motion/learnings?reference_id=other')).body.learnings.length, 0);
    assert.equal((await mock.json('GET', '/api/music-motion/learnings?state=weird')).status, 400);
    assert.equal((await mock.json('GET', `/api/music-motion/learnings/${started.body.id}`)).status, 200);

    assert.equal((await mock.json('DELETE', `/api/music-motion/learnings/${started.body.id}`)).status, 204);
    assert.equal((await mock.json('DELETE', `/api/music-motion/learnings/${started.body.id}`)).status, 404);
    assert.equal((await mock.json('GET', '/api/music-motion/learnings')).body.learnings.length, 0);
  } finally {
    mock.stop();
  }
});

test('the details of a piece are changed, with what the contract refuses', async () => {
  const mock = await startMock();
  try {
    const piece = (await mock.json('POST', '/api/music-motion/pieces', SONG)).body;
    const url = `/api/music-motion/pieces/${piece.id}`;
    const changed = await mock.json('PATCH', url, { title: 'A better title', client: 'dashboard-full', prompt: 'a calm night', world: 'a quiet town', hook: 'the lights go out', device: 'a lamp' });
    assert.equal(changed.status, 200);
    assert.deepEqual([changed.body.title, changed.body.client, changed.body.prompt, changed.body.world, changed.body.hook, changed.body.device], ['A better title', 'dashboard-full', 'a calm night', 'a quiet town', 'the lights go out', 'a lamp']);
    assert.equal((await mock.json('GET', url)).body.title, 'A better title');
    assert.equal((await mock.json('GET', '/api/music-motion/pieces?client=dashboard-full')).body.length, 1);

    // null or an empty text clears
    const cleared = await mock.json('PATCH', url, { prompt: null, world: '', client: null });
    assert.deepEqual([cleared.body.prompt, cleared.body.world, cleared.body.client], [undefined, undefined, 'embedded']);

    assert.equal((await mock.json('PATCH', url, { fps: 30 })).status, 400);
    assert.equal((await mock.json('PATCH', url, {})).status, 400);
    assert.equal((await mock.json('PATCH', url, { title: '' })).status, 422);
    assert.equal((await mock.json('PATCH', url, { title: 'x'.repeat(201) })).status, 422);
    assert.equal((await mock.json('PATCH', url, { prompt: 'x'.repeat(2001) })).status, 422);
    assert.equal((await mock.json('PATCH', url, { hook: 'two\nlines' })).status, 422);
    assert.equal((await mock.json('PATCH', url, { client: 'Not Valid' })).status, 422);
    assert.equal((await mock.json('PATCH', '/api/music-motion/pieces/none', { title: 'x' })).status, 404);
  } finally {
    mock.stop();
  }
});

test('the optional fields of the new contract appear where they apply: fixed_copy, fallback pieces and the repairs of a scene draft', async () => {
  const mock = await startMock({ args: ['--speed', '50'] });
  try {
    const parts = (await mock.json('GET', '/api/music-motion/parts')).body;
    assert.equal(parts.find((p) => p.name === 'toggle').fixed_copy, true, 'a text parameter with a default draws copy of its own');
    assert.equal(parts.find((p) => p.name === 'counter').fixed_copy, undefined);
    const own = await mock.json('POST', '/api/music-motion/parts', { manifest: JSON.stringify({ name: 'quiet', description: 'x', fixed_copy: true }), fragment: '<div></div>' });
    assert.equal(own.body.fixed_copy, true);
    // a part kept at once lists the parameters of its manifest, and a text parameter with a default is what makes it draw copy of its own
    const titled = await mock.json('POST', '/api/music-motion/parts', { manifest: JSON.stringify({ name: 'titled', description: 'x', params: [{ name: 'title', type: 'string', default: 'Hello', max_length: 20 }] }), fragment: '<div></div>' });
    assert.deepEqual(titled.body.params, [{ name: 'title', type: 'string', default: 'Hello', max_length: 20 }]);
    assert.equal(titled.body.fixed_copy, true);
    const empty = await mock.json('POST', '/api/music-motion/parts', { manifest: JSON.stringify({ name: 'no-copy', description: 'x', params: [{ name: 'label', type: 'string', default: '' }] }), fragment: '<div></div>' });
    assert.equal(empty.body.fixed_copy, undefined);

    // a piece made by the program has a fallback script: the pieces that still use a part the fixed rule chose
    const piece = (await mock.json('POST', '/api/music-motion/pieces', SONG)).body;
    const full = (await mock.json('GET', `/api/music-motion/pieces/${piece.id}`)).body;
    assert.equal(full.script_source, 'fallback');
    assert.deepEqual(full.fallback_pieces, full.script.pieces.map((p) => p.id));
    const proposed = await mock.json('POST', `/api/music-motion/pieces/${piece.id}/propose`, { what: 'script' });
    assert.equal(proposed.status, 200);
    assert.equal(proposed.body.source, 'fallback');
    assert.ok(Array.isArray(proposed.body.fallback_pieces));
    // a script of the person's own has none
    const edited = await mock.json('PUT', `/api/music-motion/pieces/${piece.id}/script`, full.script);
    assert.equal(edited.status, 200);
    assert.equal((await mock.json('GET', `/api/music-motion/pieces/${piece.id}`)).body.fallback_pieces, undefined);

    // the scene drafts written for a piece: some had something repaired before the checks, the rest have no `repairs`
    const scenes = await mock.json('POST', `/api/music-motion/pieces/${piece.id}/scenes`, { brief_mode: 'literal' });
    assert.equal(scenes.status, 202);
    await new Promise((ok) => setTimeout(ok, 600));
    const drafts = (await mock.json('GET', `/api/music-motion/part-drafts?piece=${piece.id}`)).body.drafts;
    assert.ok(drafts.length > 0, 'the batch wrote scene drafts');
    const repaired = drafts.filter((d) => d.repairs);
    assert.deepEqual(repaired.map((d) => d.scene.script_piece).sort(), ['p1', 'p3'], 'the odd pieces had a repair and p2 had none');
    for (const d of repaired) for (const r of d.repairs) assert.ok(['colour', 'font', 'clock', 'typo', 'size', 'cut', 'overlap'].includes(r.kind) && r.count >= 1);
    // the filters of the drafts: by state and by piece
    assert.equal((await mock.json('GET', '/api/music-motion/part-drafts?piece=none')).body.drafts.length, 0);
    assert.equal((await mock.json('GET', '/api/music-motion/part-drafts?state=weird')).status, 400);
  } finally {
    mock.stop();
  }
});

test('the library asks for a version and an anchor that is a fraction of the drawing, as the real server does', async () => {
  const mock = await startMock();
  try {
    const noVersion = character('nv');
    delete noVersion.manifest.version;
    const a = await mock.json('POST', `${L}/characters`, noVersion);
    assert.equal(a.status, 422);
    assert.match(a.body.error.message, /version must be 1 or more/);
    const b = await mock.json('POST', `${L}/characters`, character('px', { anchor: { x: 100, y: 300 } }));
    assert.equal(b.status, 422);
    assert.match(b.body.error.message, /between 0 and 1/);
    const bg = background('nvbg');
    delete bg.manifest.version;
    assert.equal((await mock.json('POST', `${L}/backgrounds`, bg)).status, 422);
  } finally {
    mock.stop();
  }
});
