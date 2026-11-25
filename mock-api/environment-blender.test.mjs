// The environment report names Blender present by default and missing with `MOCK_BLENDER=missing`.
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

async function blenderBinary(env) {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath, '--speed', '100'], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env } });
  try {
    await new Promise((ok, no) => {
      child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
      child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
    });
    const report = await (await fetch(`http://127.0.0.1:${port}/api/environment`)).json();
    return report.binaries.find((b) => b.name === 'blender');
  } finally {
    child.kill();
  }
}

test('Blender is present by default', async () => {
  const blender = await blenderBinary({ MOCK_BLENDER: '' });
  assert.equal(blender.present, true);
  assert.equal(blender.version, '4.2.3');
});

test('MOCK_BLENDER=missing is a machine without Blender', async () => {
  const blender = await blenderBinary({ MOCK_BLENDER: 'missing' });
  assert.equal(blender.present, false);
  assert.equal(blender.version, undefined);
});
