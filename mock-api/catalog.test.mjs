// The records a person edits one by one, as the mock simulates them: prompt presets, providers and their routing, blocks of HyperFrames, the title and tags of a motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './testkit.mjs';

test('the prompts are always a page: 50 unless limit, the best match first with q, filters, and the total', async () => {
  const mock = await startMock();
  try {
    const all = await mock.json('GET', '/api/prompts');
    assert.equal(all.status, 200);
    assert.equal(all.body.total, 3);
    assert.equal(all.headers.get('x-total-count'), '3');
    assert.deepEqual(all.body.items.map((p) => p.id), ['mine-dream-pop', 'bundled-slow-pan', 'bundled-neon-street']); // newest first

    const music = await mock.json('GET', '/api/prompts?kind=music');
    assert.deepEqual(music.body.items.map((p) => p.id), ['mine-dream-pop']);
    assert.equal((await mock.json('GET', '/api/prompts?tags=city,night')).body.total, 1);
    assert.equal((await mock.json('GET', '/api/prompts?kind=weird')).status, 400);
    assert.equal((await mock.json('GET', '/api/prompts?limit=201')).status, 400);
    assert.equal((await mock.json('GET', '/api/prompts?limit=1&offset=1')).body.items.length, 1);

    // the title weighs more than a tag, a tag more than the prompt
    const found = await mock.json('GET', '/api/prompts?q=night');
    assert.equal(found.body.items[0].id, 'bundled-neon-street');
  } finally {
    mock.stop();
  }
});

test('a prompt of the person is made, read, replaced and deleted; a bundled one is read-only', async () => {
  const mock = await startMock();
  try {
    const made = await mock.json('POST', '/api/prompts', { kind: 'image', title: 'A cat', prompt: 'a cat on a roof', tags: ['Cat', 'roof', 'cat'] });
    assert.equal(made.status, 201);
    assert.equal(made.body.own, true);
    assert.equal(made.body.source, 'user');
    assert.deepEqual(made.body.tags, ['cat', 'roof']);
    const id = made.body.id;

    assert.equal((await mock.json('POST', '/api/prompts', { kind: 'image' })).status, 400);
    assert.equal((await mock.json('POST', '/api/prompts', { kind: 'image', prompt: 'x'.repeat(2001) })).status, 400);

    const replaced = await mock.json('PUT', `/api/prompts/${id}`, { prompt: 'a dog on a roof', title: 'A dog' });
    assert.equal(replaced.status, 200);
    assert.deepEqual([replaced.body.id, replaced.body.kind, replaced.body.created_at], [id, 'image', made.body.created_at]);
    assert.equal((await mock.json('GET', `/api/prompts/${id}`)).body.prompt, 'a dog on a roof');
    assert.equal((await mock.json('PUT', `/api/prompts/${id}`, { kind: 'video', prompt: 'x' })).status, 400);

    const bundled = await mock.json('PUT', '/api/prompts/bundled-slow-pan', { prompt: 'changed' });
    assert.equal(bundled.status, 403);
    assert.notEqual((await mock.json('GET', '/api/prompts/bundled-slow-pan')).body.prompt, 'changed');
    assert.equal((await mock.json('DELETE', '/api/prompts/bundled-slow-pan')).status, 403);

    assert.equal((await mock.json('DELETE', `/api/prompts/${id}`)).status, 204);
    for (const method of ['GET', 'DELETE']) assert.equal((await mock.json(method, `/api/prompts/${id}`)).status, 404, method);
    assert.equal((await mock.json('PUT', `/api/prompts/${id}`, { prompt: 'x' })).status, 404);
  } finally {
    mock.stop();
  }
});

test('a provider is made, read one by one, changed and deleted, but not while a task is routed to it', async () => {
  const mock = await startMock();
  try {
    assert.equal((await mock.json('GET', '/api/providers/ollama')).body.builtin, true);
    assert.equal((await mock.json('GET', '/api/providers/none')).status, 404);
    assert.equal((await mock.json('DELETE', '/api/providers/ollama')).status, 400);
    assert.equal((await mock.json('PUT', '/api/providers/ollama', { name: 'x' })).status, 400);

    const made = await mock.json('POST', '/api/providers', { name: 'My LM Studio', type: 'openai', base_url: 'http://127.0.0.1:1234/v1', key: 'secret-key' });
    assert.equal(made.status, 201);
    assert.deepEqual([made.body.id, made.body.key_set, made.body.remote, made.body.builtin], ['my-lm-studio', true, false, false]);
    assert.equal(JSON.stringify(made.body).includes('secret-key'), false);
    assert.equal((await mock.json('GET', '/api/providers')).body.providers.length, 2);
    assert.equal((await mock.json('POST', '/api/providers', { name: 'My LM Studio', type: 'openai', base_url: 'http://127.0.0.1:1234/v1' })).status, 400);
    assert.equal((await mock.json('POST', '/api/providers', { preset: 'nothing' })).status, 400);
    assert.equal((await mock.json('POST', '/api/providers', { preset: 'openrouter' })).body.id, 'openrouter');

    // an absent key leaves it, an empty one removes it
    assert.equal((await mock.json('PUT', '/api/providers/my-lm-studio', { text_model: 'qwen' })).body.key_set, true);
    assert.equal((await mock.json('PUT', '/api/providers/my-lm-studio', { key: '' })).body.key_set, false);

    // routed: a task uses it, so it is not deleted and the answer names the task
    assert.equal((await mock.json('PUT', '/api/routing', { routing: { assistant: 'my-lm-studio' } })).status, 200);
    const refused = await mock.json('DELETE', '/api/providers/my-lm-studio');
    assert.equal(refused.status, 409);
    assert.match(refused.body.error.message, /assistant/);
    assert.equal((await mock.json('GET', '/api/routing')).body.routing.assistant.provider, 'my-lm-studio');
    assert.equal((await mock.json('PUT', '/api/routing', { routing: { assistant: 'ollama' } })).status, 200);
    assert.equal((await mock.json('DELETE', '/api/providers/my-lm-studio')).status, 204);
    assert.equal((await mock.json('GET', '/api/providers/my-lm-studio')).status, 404);

    // a remote provider needs the acknowledgement
    const needs = await mock.json('PUT', '/api/routing', { routing: { quality: 'openrouter' } });
    assert.equal(needs.status, 400);
    assert.equal(needs.body.error.code, 'consent_required');
    assert.equal((await mock.json('PUT', '/api/routing', { routing: { quality: 'openrouter' }, acknowledge_remote: true })).status, 200);
  } finally {
    mock.stop();
  }
});

test('the blocks of HyperFrames are listed with filters, the totals of everything that matches, and one is deleted', async () => {
  const mock = await startMock();
  try {
    const all = await mock.json('GET', '/api/hyperframes/blocks');
    assert.equal(all.body.total, 4);
    assert.deepEqual(all.body.states, { ok: 2, 'needs-files': 1, failed: 1 });
    assert.equal(all.body.libs_installed, true);

    const page = await mock.json('GET', '/api/hyperframes/blocks?limit=1&sort=-title');
    assert.equal(page.body.blocks.length, 1);
    assert.equal(page.body.total, 4, 'the total counts everything that matches, not only the page');
    assert.equal(page.headers.get('x-total-count'), '4');
    assert.equal((await mock.json('GET', '/api/hyperframes/blocks?state=failed')).body.blocks[0].name, 'broken-demo');
    assert.equal((await mock.json('GET', '/api/hyperframes/blocks?q=CONFETTI')).body.total, 1);
    assert.equal((await mock.json('GET', '/api/hyperframes/blocks?kind=component')).body.blocks[0].name, 'grid-wipe');

    assert.equal((await mock.json('GET', '/api/hyperframes/blocks/grid-wipe')).status, 200);
    assert.equal((await mock.json('DELETE', '/api/hyperframes/blocks/grid-wipe')).status, 204);
    assert.equal((await mock.json('GET', '/api/hyperframes/blocks/grid-wipe')).status, 404);
    assert.equal((await mock.json('DELETE', '/api/hyperframes/blocks/grid-wipe')).status, 404);
    assert.equal((await mock.json('GET', '/api/hyperframes/blocks')).body.total, 3);
  } finally {
    mock.stop();
  }
});

test('the title and the tags of a motion are changed, with the limits of adding one; nothing else', async () => {
  const mock = await startMock();
  try {
    const form = new FormData();
    form.append('request', JSON.stringify({ title: 'A walk', tags: ['walk'] }));
    form.append('video', new Blob([new Uint8Array(32)], { type: 'video/mp4' }), 'walk.mp4');
    const created = await fetch(`${mock.base}/api/motions`, { method: 'POST', body: form });
    assert.equal(created.status, 202);
    const { id } = await created.json();

    // while it is being prepared too
    const patched = await mock.json('PATCH', `/api/motions/${id}`, { title: 'A long walk', tags: ['walk', 'slow'] });
    assert.equal(patched.status, 200);
    assert.deepEqual([patched.body.title, patched.body.tags], ['A long walk', ['walk', 'slow']]);
    assert.equal((await mock.json('GET', `/api/motions/${id}`)).body.title, 'A long walk');
    assert.equal((await mock.json('GET', '/api/motions')).body[0].title, 'A long walk');

    // what is not sent stays
    assert.deepEqual((await mock.json('PATCH', `/api/motions/${id}`, { title: 'Walk' })).body.tags, ['walk', 'slow']);

    assert.equal((await mock.json('PATCH', `/api/motions/${id}`, { duration: 9 })).status, 400);
    assert.equal((await mock.json('PATCH', `/api/motions/${id}`, { title: 'x'.repeat(121) })).status, 400);
    assert.equal((await mock.json('PATCH', `/api/motions/${id}`, { tags: Array(11).fill('t') })).status, 400);
    assert.equal((await mock.json('PATCH', `/api/motions/${id}`, { tags: ['x'.repeat(41)] })).status, 400);
    assert.equal((await mock.json('PATCH', '/api/motions/none', { title: 'x' })).status, 404);
  } finally {
    mock.stop();
  }
});

test('the picture edits are listed like the other generations: newest first, by client and in pages', async () => {
  const mock = await startMock();
  try {
    const empty = await mock.json('GET', '/api/image-edits');
    assert.deepEqual([empty.status, empty.body], [200, []]);
    assert.equal((await mock.json('GET', '/api/image-edits?client=Bad%20Name')).status, 400);
    const page = await mock.json('GET', '/api/image-edits?limit=5&client=dashboard-full');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-total-count'), '0');
    assert.equal((await mock.json('GET', '/api/image-edits?sort=title')).status, 400);
  } finally {
    mock.stop();
  }
});
