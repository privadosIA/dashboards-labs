// A mock that is not next to `libs/` (a packed one) starts: without the animation sample, with everything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const freePort = () => new Promise((ok) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

test('copied out of the repository, without its sample folder, the mock starts without the animation sample', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mock-standalone-'));
  const copy = join(dir, 'mock-api');
  mkdirSync(copy);
  for (const f of readdirSync(here)) if (/\.mjs$/.test(f) && !/\.test\.mjs$/.test(f)) cpSync(join(here, f), join(copy, f));
  cpSync(join(here, 'assets'), join(copy, 'assets'), { recursive: true });
  mkdirSync(join(dir, 'contract'));
  cpSync(join(root, 'contract/openapi.yaml'), join(dir, 'contract/openapi.yaml'));
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));

  const port = await freePort();
  let log = '';
  const child = spawn(process.execPath, [join(copy, 'server.mjs'), '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => (log += d));
  try {
    await new Promise((ok, no) => {
      child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
      child.on('exit', (c) => no(new Error(`the mock exited with ${c}: ${log}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    assert.match(log, /starts without the animation sample/);
    assert.equal((await fetch(`${base}/api/projects`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/music-motion/pieces`)).json(), []);
    assert.equal((await fetch(`${base}/api/music-motion/catalog`)).status, 200);
    assert.equal((await fetch(`${base}/api/library/songs`)).status, 200);
  } finally {
    child.kill();
  }
});
