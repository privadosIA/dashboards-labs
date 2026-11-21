import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, 'generate-client.mjs');
const contract = resolve(here, '../contract/openapi.yaml');
const committed = resolve(here, '../libs/api-client/src/lib/generated/schema.d.ts');

function run(args) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [script, ...args]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => done({ code, out }));
  });
}
const workdir = () => mkdtempSync(join(tmpdir(), 'client-'));

test('the committed types are what the committed contract produces', async () => {
  const r = await run(['--check']);
  assert.equal(r.code, 0, r.out);
});

test('generating from the contract writes the same text that is committed', async () => {
  const out = join(workdir(), 'schema.d.ts');
  const r = await run(['--out', out]);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(committed, 'utf8'));
});

test('--check fails, saying the file is out of date, when the contract has a field the file does not', async () => {
  const dir = workdir();
  const doc = yaml.load(readFileSync(contract, 'utf8'));
  const schema = doc.components.schemas.MotionModelSetting;
  schema.properties.added_for_the_test = { type: 'string' };
  const changed = join(dir, 'openapi.yaml');
  writeFileSync(changed, yaml.dump(doc));
  const out = join(dir, 'schema.d.ts');
  copyFileSync(committed, out);

  const r = await run(['--check', '--contract', changed, '--out', out]);
  assert.equal(r.code, 1);
  assert.match(r.out, /out of date/);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(committed, 'utf8'), '--check must not write');
});

test('--check fails when the generated file does not exist', async () => {
  const r = await run(['--check', '--out', join(workdir(), 'none.d.ts')]);
  assert.equal(r.code, 1);
  assert.match(r.out, /does not exist/);
});

test('a contract that cannot be read leaves the output alone', async () => {
  const out = join(workdir(), 'schema.d.ts');
  const r = await run(['--contract', join(workdir(), 'missing.yaml'), '--out', out]);
  assert.equal(r.code, 1);
  assert.match(r.out, /cannot read/);
  assert.equal(existsSync(out), false);
});
