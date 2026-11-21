import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'sync-contract.mjs');
const SPEC = (extra = '') => `openapi: 3.0.3\ninfo: { title: API, version: "1" }\npaths:\n  /api/health:\n    get: { responses: { "200": { description: ok } } }\n${extra}`;
const SPEC_JSON = (extraPath = false) =>
  JSON.stringify({ openapi: '3.0.3', info: { title: 'API', version: '1' }, paths: { '/api/health': { get: { responses: { 200: { description: 'ok' } } } }, ...(extraPath ? { '/api/new': { get: { responses: { 200: { description: 'ok' } } } } } : {}) } });

// Runs the script as a child (it is a command) and answers its exit code and what it printed.
function run(args, env = {}) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [script, ...args], { env: { ...process.env, ORCHESTRATOR_TOKEN: '', ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => done({ code, out }));
  });
}
const workdir = () => mkdtempSync(join(tmpdir(), 'contract-'));
const files = (dir) => ({ yaml: join(dir, 'openapi.yaml'), record: join(dir, 'SOURCE.json') });

async function serve(handler, fn) {
  const srv = createServer(handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${srv.address().port}`);
  } finally {
    await new Promise((r) => srv.close(r));
  }
}

test('updates the copy from a file and records where it came from', async () => {
  const dir = workdir();
  const src = join(workdir(), 'in.yaml');
  writeFileSync(src, SPEC());
  const r = await run([src, '--contract', dir]);
  assert.equal(r.code, 0, r.out);
  const f = files(dir);
  assert.equal(readFileSync(f.yaml, 'utf8'), SPEC());
  const rec = JSON.parse(readFileSync(f.record, 'utf8'));
  assert.equal(rec.source, src);
  assert.match(rec.sha256, /^[0-9a-f]{64}$/);
  assert.equal(rec.operations, 1);
  assert.ok(Date.parse(rec.fetchedAt) > 0);
});

test('updates the copy from a running server, sending its token', async () => {
  const dir = workdir();
  let seen = '';
  await serve((req, res) => {
    seen = req.headers.authorization ?? '';
    res.setHeader('content-type', 'application/json');
    res.end(SPEC_JSON());
  }, async (base) => {
    const r = await run([`${base}/api/openapi.json`, '--contract', dir, '--token', 'sekret']);
    assert.equal(r.code, 0, r.out);
    assert.equal(seen, 'Bearer sekret');
    const rec = JSON.parse(readFileSync(files(dir).record, 'utf8'));
    assert.equal(rec.source, `${base}/api/openapi.json`);
    assert.match(readFileSync(files(dir).yaml, 'utf8'), /\/api\/health/);
  });
});

test('a file and a server that say the same thing give a copy that checks as current', async () => {
  const dir = workdir();
  const src = join(workdir(), 'in.yaml');
  writeFileSync(src, SPEC());
  assert.equal((await run([src, '--contract', dir])).code, 0);
  await serve((req, res) => res.end(SPEC_JSON()), async (base) => {
    const r = await run([`${base}/api/openapi.json`, '--check', '--contract', dir]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /current/);
  });
});

test('refuses what is not an OpenAPI 3 description and leaves the copy as it was', async () => {
  const dir = workdir();
  const good = join(workdir(), 'good.yaml');
  writeFileSync(good, SPEC());
  await run([good, '--contract', dir]);
  const before = { y: readFileSync(files(dir).yaml, 'utf8'), r: readFileSync(files(dir).record, 'utf8') };
  for (const [name, body] of [['not a contract', '{"hello": 1}'], ['swagger 2', 'swagger: "2.0"\npaths: {}'], ['not yaml', 'a: [unclosed']]) {
    const bad = join(workdir(), 'bad.yaml');
    writeFileSync(bad, body);
    const r = await run([bad, '--contract', dir]);
    assert.equal(r.code, 1, name);
    assert.match(r.out, /not (an OpenAPI 3|YAML)/, name);
    assert.equal(readFileSync(files(dir).yaml, 'utf8'), before.y, name);
    assert.equal(readFileSync(files(dir).record, 'utf8'), before.r, name);
  }
});

test('a source that cannot be read leaves everything untouched and names the source', async () => {
  const dir = workdir();
  const r1 = await run([join(workdir(), 'missing.yaml'), '--contract', dir]);
  assert.equal(r1.code, 1);
  assert.match(r1.out, /missing\.yaml/);
  assert.equal(existsSync(files(dir).yaml), false);
  assert.equal(existsSync(files(dir).record), false);

  const r2 = await run(['http://127.0.0.1:1/api/openapi.json', '--contract', dir]);
  assert.equal(r2.code, 1);
  assert.match(r2.out, /cannot reach http:\/\/127\.0\.0\.1:1/);
  assert.equal(existsSync(files(dir).yaml), false);
});

test('a server that wants its token says so', async () => {
  const dir = workdir();
  await serve((req, res) => { res.statusCode = 401; res.end('{}'); }, async (base) => {
    const r = await run([`${base}/api/openapi.json`, '--contract', dir]);
    assert.equal(r.code, 1);
    assert.match(r.out, /401.*token/);
  });
});

test('check names what changed in the source and writes nothing', async () => {
  const dir = workdir();
  const src = join(workdir(), 'in.yaml');
  writeFileSync(src, SPEC());
  await run([src, '--contract', dir]);
  const before = readFileSync(files(dir).record, 'utf8');
  await serve((req, res) => res.end(SPEC_JSON(true)), async (base) => {
    const r = await run([`${base}/api/openapi.json`, '--check', '--contract', dir]);
    assert.equal(r.code, 1);
    assert.match(r.out, /new in the source: GET \/api\/new/);
    assert.equal(readFileSync(files(dir).record, 'utf8'), before);
  });
});

test('check without a copy says to sync first', async () => {
  const dir = workdir();
  const src = join(workdir(), 'in.yaml');
  writeFileSync(src, SPEC());
  const r = await run([src, '--check', '--contract', dir]);
  assert.equal(r.code, 1);
  assert.match(r.out, /no copy/);
});
