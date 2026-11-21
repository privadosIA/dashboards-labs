import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../apps/dashboard-full/public');
// The page's script is a plain browser script (not an ES module), so it is run in an empty context that offers `module` and no `document`.
const sandbox = { module: { exports: {} } };
runInNewContext(readFileSync(join(dir, 'obras.js'), 'utf8'), sandbox);
const { createWatcher, languageOf, PERIOD_MS } = sandbox.module.exports;

/** An environment with a fake fetch, clock and timer, to drive the page's logic without a browser. */
function fakeEnv(answers) {
  const log = { went: [], off: [], checking: 0, fetched: [], timers: [] };
  let visible = true;
  const env = {
    fetch: (url, init) => {
      log.fetched.push([url, init]);
      const next = answers.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    now: () => new Date(0),
    isVisible: () => visible,
    go: (p) => log.went.push(p),
    setInterval: (fn, ms) => (log.timers.push({ fn, ms }), log.timers.length),
    clearInterval: () => {},
    onChecking: () => log.checking++,
    onOff: (d) => log.off.push(d),
  };
  return { env, log, hide: () => (visible = false) };
}

test('asks /api/health with no cache and goes back to the app when it answers', async () => {
  const { env, log } = fakeEnv([{ ok: true }]);
  const w = createWatcher(env);
  assert.equal(await w.start(), 'back');
  // The script runs in another realm, so its objects are compared as JSON.
  assert.equal(JSON.stringify(log.fetched), JSON.stringify([['/api/health', { cache: 'no-store' }]]));
  assert.deepEqual(log.went, ['/']);
});

test('stays where it is when the answer is the offline one, any error or a failed request', async () => {
  const { env, log } = fakeEnv([{ ok: false, status: 503 }, { ok: false, status: 401 }, new TypeError('Failed to fetch')]);
  const w = createWatcher(env);
  assert.equal(await w.check(), 'off');
  assert.equal(await w.check(), 'off');
  assert.equal(await w.check(), 'off');
  assert.deepEqual(log.went, []);
  assert.equal(log.off.length, 3);
});

test('polls every 15 seconds, only while the tab is visible', async () => {
  const { env, log, hide } = fakeEnv([{ ok: false }, { ok: false }, { ok: false }]);
  const w = createWatcher(env);
  await w.start();
  assert.equal(PERIOD_MS, 15000);
  assert.equal(log.timers.at(-1).ms, 15000);
  const tick = log.timers.at(-1).fn;
  tick();
  await new Promise((r) => setImmediate(r));
  assert.equal(log.fetched.length, 2);
  hide();
  tick();
  await new Promise((r) => setImmediate(r));
  assert.equal(log.fetched.length, 2); // hidden: no request
});

test('does not stack requests while one is in flight', async () => {
  const { env, log } = fakeEnv([{ ok: false }]);
  const w = createWatcher(env);
  const first = w.check();
  assert.equal(await w.check(), 'busy');
  await first;
  assert.equal(log.fetched.length, 1);
});

test('chooses Spanish for a Spanish browser and English otherwise', () => {
  assert.equal(languageOf(['es-ES', 'en']), 'es');
  assert.equal(languageOf(['en-GB']), 'en');
  assert.equal(languageOf([]), 'en');
});

test('the page is static and holds no token, address or inline code', () => {
  for (const f of ['obras.html', 'obras.css', 'obras.js']) assert.ok(existsSync(join(dir, f)), f);
  const html = readFileSync(join(dir, 'obras.html'), 'utf8');
  assert.match(html, /<script src="obras\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>|<style|style=/);
  for (const f of ['obras.html', 'obras.css', 'obras.js']) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.doesNotMatch(text, /Bearer|token|100\.\d+\.\d+\.\d+|https?:\/\//i, f);
  }
  // Both languages are in the page.
  assert.match(html, /lang="es"/);
  assert.match(html, /lang="en"/);
});
