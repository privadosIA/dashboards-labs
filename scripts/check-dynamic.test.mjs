import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'check-dynamic.mjs');
const schema = (...keys) => JSON.stringify({ version: '1.0', id: 'f', fields: keys.map((key) => ({ key, type: 'text', label: key })) });

function run(root) {
  return new Promise((done) => {
    const p = spawn(process.execPath, root ? [script, root] : [script]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => done({ code, out }));
  });
}
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'dynamic-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('every dynamic/ folder of the repository has both languages with the same fields', async () => {
  const r = await run();
  assert.equal(r.code, 0, r.out);
});

test('passes when both languages describe the same fields', async () => {
  const root = tree({ 'app/dynamic/a.es.json': schema('x', 'y'), 'app/dynamic/a.en.json': schema('y', 'x') });
  assert.equal((await run(root)).code, 0);
});

test('fails naming the field and the file when a field is in one language only', async () => {
  const root = tree({ 'app/dynamic/a.es.json': schema('x'), 'app/dynamic/a.en.json': schema('x', 'extra') });
  const r = await run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.es\.json: has no field "extra", which .*a\.en\.json has/);
});

test('fails when a language has no file', async () => {
  const root = tree({ 'app/dynamic/a.en.json': schema('x') });
  const r = await run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.es\.json: missing/);
});

test('fails on a file that does not follow <name>.<lang>.json', async () => {
  const root = tree({ 'app/dynamic/a.json': schema('x'), 'app/dynamic/b.fr.json': schema('x') });
  const r = await run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /a\.json: the name must be/);
  assert.match(r.out, /b\.fr\.json: the name must be/);
});

test('looks inside groups and the columns of tables', async () => {
  const withGroup = (inner) => JSON.stringify({ version: '1.0', id: 'f', fields: [{ type: 'group', id: 'g', fields: [{ key: inner, type: 'text' }] }] });
  const root = tree({ 'app/dynamic/a.es.json': withGroup('x'), 'app/dynamic/a.en.json': withGroup('z') });
  const r = await run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /field "g\.[xz]"/);
});

test('ignores json files outside a dynamic/ folder', async () => {
  const root = tree({ 'app/other/a.json': '{}' });
  assert.equal((await run(root)).code, 0);
});

test('a group whose layout says how many columns it has (a number) is read like any other', async () => {
  const withColumns = (label) =>
    JSON.stringify({ version: '1.0', id: 'f', fields: [{ key: 'box', type: 'group', label, columns: 3, fields: [{ key: 'a', type: 'text', label }] }] });
  const root = tree({ 'x/dynamic/f.es.json': withColumns('Caja'), 'x/dynamic/f.en.json': withColumns('Box') });
  const { code, out } = await run(root);
  assert.equal(code, 0, out);
});
