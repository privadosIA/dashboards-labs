// The stored motion pages of the mock: a page is kept per scene and overlay, and `revise` changes only its timeline block
// and refuses as the contract does (400, 404, 422) without touching the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = process.env.SPEC ?? resolve(here, '../contract/openapi.yaml');

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

async function start() {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath, '--speed', '100'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, no) => {
    child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
    child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const send = (method, path, body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const made = await send('POST', '/api/projects', { id: 'motion-pages-test' });
  assert.equal(made.status, 201);
  const url = (scene, tail = '') => `/api/projects/motion-pages-test/scenes/${scene}/motion${tail}`;
  return { send, url, stop: () => child.kill() };
}

const timelineOf = (html) => JSON.parse(/<script type="application\/json" id="motion-timeline">([\s\S]*?)<\/script>/.exec(html)[1]);
const withoutBlock = (html) => html.replace(/(<script type="application\/json" id="motion-timeline">)[\s\S]*?(<\/script>)/, '$1$2');

test('a scene with no page answers exists false, and revise says 404 and keeps it that way', async () => {
  const m = await start();
  try {
    const got = await (await m.send('GET', m.url('s1'))).json();
    assert.equal(got.exists, false);
    const res = await m.send('POST', m.url('s1', '/revise'), { instruction: 'slower entrances' });
    assert.equal(res.status, 404);
    assert.equal((await (await m.send('GET', m.url('s1'))).json()).exists, false);
  } finally {
    m.stop();
  }
});

test('revise changes only the timeline block and says who retimed it', async () => {
  const m = await start();
  try {
    const written = await (await m.send('POST', m.url('s1', '/generate'), { overlay: false })).json();
    assert.equal(written.origin, 'generated');
    const before = timelineOf(written.html);
    const res = await m.send('POST', m.url('s1', '/revise'), { instruction: 'slower entrances', overlay: false });
    assert.equal(res.status, 200);
    const page = await res.json();
    assert.deepEqual(page.revised, { provider: 'mock', model: 'mock-model' });
    assert.equal(page.origin, 'edited');
    assert.equal(withoutBlock(page.html), withoutBlock(written.html));
    const after = timelineOf(page.html);
    assert.ok(after.tracks[0].duration > before.tracks[0].duration);
    assert.equal(page.model, 'mock-model');
    const stored = await (await m.send('GET', m.url('s1'))).json();
    assert.equal(stored.html, page.html);
  } finally {
    m.stop();
  }
});

test('a bounce goes to the title and a hand-written page stays supplied', async () => {
  const m = await start();
  try {
    const written = await (await m.send('POST', m.url('s1', '/generate'), {})).json();
    await m.send('PUT', m.url('s1'), { html: written.html, overlay: false });
    const page = await (await m.send('POST', m.url('s1', '/revise'), { instruction: 'a bounce on the title' })).json();
    assert.equal(page.origin, 'supplied');
    const [title, lines] = timelineOf(page.html).tracks;
    assert.equal(title.ease, 'out-back');
    assert.equal(lines.ease, 'out');
  } finally {
    m.stop();
  }
});

test('an empty or too long instruction is 400, a page without a block is 422, and [fail] is 422; the page is untouched', async () => {
  const m = await start();
  try {
    const written = await (await m.send('POST', m.url('s1', '/generate'), {})).json();
    for (const instruction of ['', '   ', 'x'.repeat(1001)]) {
      assert.equal((await m.send('POST', m.url('s1', '/revise'), { instruction })).status, 400, `instruction of ${instruction.length} characters`);
    }
    const failed = await m.send('POST', m.url('s1', '/revise'), { instruction: 'slower [fail]' });
    assert.equal(failed.status, 422);
    assert.match((await failed.json()).error.message, /after 3 attempts/);
    assert.equal((await (await m.send('GET', m.url('s1'))).json()).html, written.html);

    await m.send('PUT', m.url('s2'), { html: '<html><body><script>animate()</script></body></html>' });
    const none = await m.send('POST', m.url('s2', '/revise'), { instruction: 'faster' });
    assert.equal(none.status, 422);
    assert.match((await none.json()).error.message, /own script/);
  } finally {
    m.stop();
  }
});

test('the overlay page is kept apart from the graphic page', async () => {
  const m = await start();
  try {
    await m.send('POST', m.url('s1', '/generate'), { overlay: false });
    assert.equal((await m.send('POST', m.url('s1', '/revise'), { instruction: 'faster', overlay: true })).status, 404);
    assert.equal((await (await m.send('GET', m.url('s1') + '?overlay=1')).json()).exists, false);
    await m.send('POST', m.url('s1', '/generate'), { overlay: true });
    const page = await (await m.send('POST', m.url('s1', '/revise'), { instruction: 'faster', overlay: true })).json();
    assert.equal(page.overlay, true);
  } finally {
    m.stop();
  }
});

test('an unknown project is 404', async () => {
  const m = await start();
  try {
    assert.equal((await m.send('POST', '/api/projects/nope/scenes/s1/motion/revise', { instruction: 'x' })).status, 404);
  } finally {
    m.stop();
  }
});
