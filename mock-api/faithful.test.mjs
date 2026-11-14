// What the mock ANSWERS must fit the contract, not only its hand-written sample data: every GET endpoint of the
// contract with a JSON success response is requested from a running mock and the body is validated against the
// schema of that response. A failure names the endpoint and the field. The endpoints whose contract declares no
// fields are listed at the end (nothing can be proved about them), and so are those the seed has no data for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { closeObjects } from './strict.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = process.env.SPEC ?? resolve(here, '../contract/openapi.yaml');
const spec = closeObjects(yaml.load(readFileSync(specPath, 'utf8')));
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });

const deref = (s) => {
  for (let i = 0; s?.$ref && i < 20; i++) s = s.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec);
  return s;
};
const describesFields = (schema, depth = 0) => {
  const s = deref(schema);
  if (!s || depth > 6) return false;
  if (s.properties && Object.keys(s.properties).length) return true;
  if (s.items) return describesFields(s.items, depth + 1);
  return !!(s.allOf || s.oneOf || s.anyOf);
};
const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

// The ids the seed of the mock has, for the path parameters of the endpoints.
function fill(path, runId) {
  const known = (name) => {
    if (name === 'id') return path.startsWith('/api/runs/') ? runId : path.startsWith('/api/projects/') ? 'demo' : null;
    return { scene: 'intro', kind: 'model', service: 'huggingface', tool: 'grafana' }[name] ?? null;
  };
  let missing = false;
  const url = path.replace(/\{(\w+)\}/g, (_, name) => {
    const v = known(name);
    if (v === null) missing = true;
    return v ?? 'x';
  });
  return missing ? null : url;
}

test('what the mock answers on every GET fits the contract', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath, '--speed', '50'], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((ok, no) => {
      child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
      child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    const run = await (await fetch(`${base}/api/projects/demo/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();

    const failures = [];
    const loose = [];
    const notAsked = [];
    let checked = 0;
    for (const [path, item] of Object.entries(spec.paths)) {
      const res = deref(item.get?.responses?.['200']);
      const schema = res?.content?.['application/json']?.schema;
      if (!schema) continue;
      const url = fill(path, run.run.id);
      if (!url) {
        notAsked.push(`${path} (no id for it in the seed)`);
        continue;
      }
      const answer = await fetch(base + url);
      if (answer.status !== 200) {
        notAsked.push(`${path} (answered ${answer.status})`);
        continue;
      }
      if (!describesFields(schema)) loose.push(path);
      const validate = ajv.compile({ ...schema, components: spec.components });
      checked++;
      if (!validate(await answer.json())) failures.push(`GET ${path}: ${ajv.errorsText(validate.errors, { dataVar: '' })}`);
    }
    if (loose.length) console.log(`\nThe contract declares no fields for: ${loose.join(', ')}`);
    if (notAsked.length) console.log(`Not checked: ${notAsked.join('; ')}`);
    console.log(`Checked ${checked} endpoints`);
    assert.deepEqual(failures, []);
    assert.ok(checked > 20, `only ${checked} endpoints were checked: something is wrong with the test`);
  } finally {
    child.kill();
  }
});

// The writes too: the answer of PUT /api/settings fits the contract, and the next read shows what was saved.
test('saving a setting answers what the contract describes and changes the next read', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((ok, no) => {
      child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
      child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    const put = (body) => fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const schemaOf = (method) => ({ ...deref(spec.paths['/api/settings'][method].responses['200']).content['application/json'].schema, components: spec.components });
    const fits = (method, body) => {
      const validate = ajv.compile(schemaOf(method));
      assert.ok(validate(body), ajv.errorsText(validate.errors, { dataVar: '' }));
    };

    const saved = await put({ ollama_host: '192.168.1.50', browser: '/usr/bin/chromium', motion_model: 'qwen3:8b', heartmula_host: 'musica.local', heartmula_token: 't' });
    assert.equal(saved.status, 200);
    const answer = await saved.json();
    fits('put', answer);
    assert.deepEqual(answer.ollama, { host: 'http://192.168.1.50:11434', source: 'setting', remote: true, saved: 'http://192.168.1.50:11434' });
    assert.equal(answer.browser.saved, '/usr/bin/chromium');
    assert.equal(answer.motion_model.saved, 'qwen3:8b');
    assert.deepEqual(answer.heartmula, { saved: 'http://musica.local:8787', token_set: true, remote: true, consented: false });

    const read = await (await fetch(`${base}/api/settings`)).json();
    fits('get', read);
    assert.deepEqual(read, answer);

    const accepted = await (await put({ heartmula_accept: true })).json();
    assert.equal(accepted.heartmula.consented, true);

    const removed = await (await put({ ollama_host: '', heartmula_host: '' })).json();
    fits('put', removed);
    assert.equal(removed.ollama.source, 'default');
    assert.equal(removed.ollama.saved, '');
    assert.equal(removed.heartmula.saved, '');
  } finally {
    child.kill();
  }
});

// The list of projects as the server sends it: a music project has scene_count 0 and its tracks, and a project whose file
// cannot be read is still listed, with the fields that are always sent left empty or 0.
test('the projects of a music kind and an unreadable one are listed as the contract describes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mock-persist-'));
  const persist = join(dir, 'state.json');
  writeFileSync(
    persist,
    JSON.stringify({ projects: { songs: 'project: songs\noutput:\n  mode: music\ntracks:\n  - { id: ballad, prompt: p }\n', broken: 'project: [unclosed' } }),
  );
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath, '--persist', persist], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((ok, no) => {
      child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
      child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
    });
    const list = await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json();
    const schema = { ...deref(spec.paths['/api/projects'].get.responses['200']).content['application/json'].schema, components: spec.components };
    const validate = ajv.compile(schema);
    assert.ok(validate(list), ajv.errorsText(validate.errors, { dataVar: '' }));
    const by = Object.fromEntries(list.map((p) => [p.id, p]));
    assert.deepEqual(by.songs, { id: 'songs', name: 'songs', mode: 'music', scene_count: 0, client: 'embedded', track_count: 1 });
    assert.equal(by.broken.invalid, true);
    assert.deepEqual([by.broken.name, by.broken.mode, by.broken.scene_count], ['', '', 0]);
    assert.ok(by.broken.error);
  } finally {
    child.kill();
  }
});

// client and managed as the server reads them: the client of a project comes from its scenes.yaml (embedded without one),
// ?client= keeps only those, anything else in ?managed= or ?client= is a 400, POST keeps a valid client and refuses a bad
// one with 422, and a managed project is not deleted through /api/projects.
test('client is kept and filtered, managed accepts only include, and a managed project is deleted elsewhere', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  const base = `http://127.0.0.1:${port}`;
  const post = (body) => fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await new Promise((ok, no) => {
      child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
      child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
    });
    assert.equal((await post({ id: 'from-studio', client: 'video-studio' })).status, 201);
    assert.equal((await post({ id: 'bad', client: 'Not Valid' })).status, 422);
    assert.equal((await fetch(`${base}/api/projects/bad/config`)).status, 404);
    const all = await (await fetch(`${base}/api/projects`)).json();
    assert.equal(all.find((p) => p.id === 'from-studio').client, 'video-studio');
    assert.equal(all.find((p) => p.id === 'demo').client, 'embedded');
    const only = await (await fetch(`${base}/api/projects?client=video-studio`)).json();
    assert.deepEqual(only.map((p) => p.id), ['from-studio']);
    assert.equal((await fetch(`${base}/api/projects?managed=include`)).status, 200);
    assert.equal((await fetch(`${base}/api/projects?managed=all`)).status, 400);
    assert.equal((await fetch(`${base}/api/library?client=Bad Name`)).status, 400);
    const storage = await (await fetch(`${base}/api/storage?client=video-studio`)).json();
    assert.deepEqual(storage.projects.map((p) => [p.id, p.client]), [['from-studio', 'video-studio']]);
    const del = await fetch(`${base}/api/projects/api-gen-abc`, { method: 'DELETE' });
    assert.equal(del.status, 400);
    assert.match((await del.json()).error.message, /DELETE \/api\/generations\/api-gen-abc/);
  } finally {
    child.kill();
  }
});
