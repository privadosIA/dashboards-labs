// The generation operations of the mock: the answers fit the contract (closed objects), a generation goes through its
// states, the refusals are the server's and nothing is created by a refused request, and the state survives a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
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
const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

async function start(extra = []) {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath, '--speed', '100', ...extra], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, no) => {
    child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
    child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const json = (method, path, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const form = (path, request, name = 'photo.png') => {
    const f = new FormData();
    f.set('request', JSON.stringify(request));
    if (name) f.set('image', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), name);
    return fetch(base + path, { method: 'POST', body: f });
  };
  return { base, json, form, stop: () => child.kill() };
}

// The answer must fit the schema the contract gives to the response with that status of the operation.
function fits(path, method, status, body) {
  const schema = deref(spec.paths[path][method].responses[String(status)])?.content?.['application/json']?.schema;
  assert.ok(schema, `${method} ${path} has no JSON ${status} response in the contract`);
  const validate = ajv.compile({ ...schema, components: spec.components });
  assert.ok(validate(body), `${method.toUpperCase()} ${path} ${status}: ${ajv.errorsText(validate.errors, { dataVar: '' })}`);
}
const until = async (read, ok, what) => {
  for (let i = 0; i < 200; i++) {
    const v = await read();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`never ${what}`);
};

test('the options list eleven videos, each with its inputs, and the models, with one default each and a reason for what cannot run', async () => {
  const m = await start();
  try {
    const res = await m.json('GET', '/api/generation/options');
    const body = await res.json();
    fits('/api/generation/options', 'get', 200, body);
    assert.equal(body.video.length, 11);
    assert.equal(new Set(body.video.map((o) => o.id)).size, 11);
    const inputs = Object.fromEntries(body.video.map((o) => [o.id, o.inputs]));
    assert.equal(inputs['ltx'].end_image, true);
    assert.equal(inputs['wan-high'].end_image, false);
    assert.deepEqual(inputs['h3-ref'].reference_images, { min: 1, max: 2 });
    assert.equal(inputs['h3-ref'].start_image, false);
    assert.deepEqual(body.video.filter((o) => o.default).map((o) => o.id), ['wan-high']);
    for (const o of body.video) assert.equal(!o.available, !!o.reason, o.id);
    assert.deepEqual(body.image_models.filter((x) => x.default).map((x) => x.kind), ['instruction']);
  } finally {
    m.stop();
  }
});

test('a generation is accepted, runs with growing progress and ends done with a video that can be fetched', async () => {
  const m = await start();
  try {
    const res = await m.json('POST', '/api/generations', { prompt: 'a cat on a roof', option: 'ltx', duration: 8, aspect_ratio: '9:16', quality: 'normal', audio: true });
    assert.equal(res.status, 202);
    const made = await res.json();
    fits('/api/generations', 'post', 202, made);
    assert.match(made.id, /^api-gen-/);
    assert.equal(made.clip_seconds, 2);

    let last = -1;
    const done = await until(
      async () => {
        const g = await (await m.json('GET', `/api/generations/${made.id}`)).json();
        fits('/api/generations/{id}', 'get', 200, g);
        assert.ok(g.progress >= last, 'progress only grows');
        last = g.progress;
        return g;
      },
      (g) => g.state === 'done',
      'reached done',
    );
    assert.equal(done.progress, 100);
    const video = await fetch(m.base + done.video);
    assert.equal(video.status, 200);
    assert.equal(video.headers.get('content-type'), 'video/mp4');

    const list = await (await m.json('GET', '/api/generations')).json();
    fits('/api/generations', 'get', 200, list);
    assert.deepEqual(list.map((g) => g.id), [made.id]);
  } finally {
    m.stop();
  }
});

test('the defaults are filled in, a start picture makes the prompt optional and [fail] ends failed', async () => {
  const m = await start();
  try {
    const a = await (await m.json('POST', '/api/generations', { prompt: 'a dog' })).json();
    assert.deepEqual([a.request.option, a.request.duration, a.request.aspect_ratio, a.request.quality], ['wan-high', 5, '16:9', 'high']);
    const withPicture = await m.form('/api/generations', { option: 'ltx' });
    assert.equal(withPicture.status, 202);
    const bad = await (await m.json('POST', '/api/generations', { prompt: 'x [fail]', option: 'ltx' })).json();
    const failed = await until(
      async () => (await m.json('GET', `/api/generations/${bad.id}`)).json(),
      (g) => g.state === 'failed',
      'failed',
    );
    assert.match(failed.error, /ran out of memory/);
    assert.equal(failed.video, undefined);
  } finally {
    m.stop();
  }
});

test('a request the option does not accept is refused with the server status and creates nothing', async () => {
  const m = await start();
  try {
    const cases = [
      [{ option: 'ltx' }, 422, /prompt or a start picture/],
      [{ prompt: 'p', option: 'nope' }, 422, /unknown/],
      [{ prompt: 'p', option: 'h3-full' }, 503, /does not fit/],
      [{ prompt: 'p', duration: 1 }, 422, /duration/],
      [{ prompt: 'p', duration: 31 }, 422, /duration/],
      [{ prompt: 'p', aspect_ratio: '21:9' }, 422, /aspect ratio/],
      [{ prompt: 'p', quality: 'ultra' }, 422, /quality/],
      [{ prompt: 'p', option: 'wan-low', audio: true }, 422, /audio/],
    ];
    for (const [request, status, text] of cases) {
      const res = await m.json('POST', '/api/generations', request);
      assert.equal(res.status, status, JSON.stringify(request));
      const body = await res.json();
      fits('/api/generations', 'post', status, body);
      assert.match(body.error.message, text);
    }
    assert.deepEqual(await (await m.json('GET', '/api/generations')).json(), []);
    assert.equal((await m.form('/api/generations', { prompt: 'p' }, 'notes.txt')).status, 422);
  } finally {
    m.stop();
  }
});

test('generations are listed newest first and deleted with a 404 the second time', async () => {
  const m = await start();
  try {
    const first = await (await m.json('POST', '/api/generations', { prompt: 'one', option: 'ltx' })).json();
    await new Promise((r) => setTimeout(r, 20));
    const second = await (await m.json('POST', '/api/generations', { prompt: 'two', option: 'ltx' })).json();
    assert.deepEqual((await (await m.json('GET', '/api/generations')).json()).map((g) => g.id), [second.id, first.id]);
    assert.equal((await m.json('DELETE', `/api/generations/${first.id}`)).status, 204);
    assert.equal((await m.json('DELETE', `/api/generations/${first.id}`)).status, 404);
    assert.equal((await m.json('GET', `/api/generations/${first.id}`)).status, 404);
    assert.deepEqual((await (await m.json('GET', '/api/generations')).json()).map((g) => g.id), [second.id]);
  } finally {
    m.stop();
  }
});

test('an image edit with variants ends done with one result per variant, each with its own seed', async () => {
  const m = await start();
  try {
    const res = await m.form('/api/image-edits', { model: 'sd-1-5', prompt: 'make it night', negative_prompt: 'blur', strength: 0.7, variants: 3 });
    assert.equal(res.status, 202);
    const made = await res.json();
    fits('/api/image-edits', 'post', 202, made);
    const done = await until(
      async () => {
        const e = await (await m.json('GET', `/api/image-edits/${made.id}`)).json();
        fits('/api/image-edits/{id}', 'get', 200, e);
        return e;
      },
      (e) => e.state === 'done',
      'reached done',
    );
    assert.equal(done.results.length, 3);
    assert.equal(new Set(done.results.map((r) => r.seed)).size, 3);
    assert.deepEqual(done.results.map((r) => r.variant), [1, 2, 3]);
    assert.equal((await fetch(m.base + done.results[1].image)).headers.get('content-type'), 'image/png');
    assert.equal((await m.json('DELETE', `/api/image-edits/${made.id}`)).status, 204);
    assert.equal((await m.json('GET', `/api/image-edits/${made.id}`)).status, 404);
  } finally {
    m.stop();
  }
});

test('an edit the model does not accept is refused and creates nothing', async () => {
  const m = await start();
  try {
    const kontext = 'image-edit-flux-kontext-q4';
    const cases = [
      [{ model: kontext, prompt: 'p', strength: 0.5 }, 422, /strength/],
      [{ model: kontext, prompt: 'p', negative_prompt: 'x' }, 422, /negative prompt/],
      [{ model: kontext, prompt: 'p', variants: 2 }, 422, /variants/],
      [{ model: 'sd-1-5', prompt: '  ' }, 422, /blank/],
      [{ model: 'sd-1-5', prompt: 'p', strength: 0 }, 422, /strength/],
      [{ model: 'sd-1-5', prompt: 'p', strength: 1.5 }, 422, /strength/],
      [{ model: 'sd-1-5', prompt: 'p', variants: 9 }, 422, /variants/],
      [{ model: 'nope', prompt: 'p' }, 422, /unknown/],
      [{ model: 'image-edit-qwen-image-edit-q4', prompt: 'p' }, 503, /not installed/],
    ];
    for (const [request, status, text] of cases) {
      const res = await m.form('/api/image-edits', request);
      assert.equal(res.status, status, JSON.stringify(request));
      assert.match((await res.json()).error.message, text);
    }
    const noPicture = await m.form('/api/image-edits', { prompt: 'p' }, '');
    assert.equal(noPicture.status, 422);
    // Nothing was created: the first edit of the mock is the only one the next read finds.
    const ok = await (await m.form('/api/image-edits', { prompt: 'put a cap on' })).json();
    assert.equal(ok.request.model, kontext);
    assert.deepEqual(ok.request, { model: kontext, prompt: 'put a cap on', variants: 1, client: 'unknown' });
  } finally {
    m.stop();
  }
});

test('the generations and the edits survive a restart on the same file', async () => {
  const persist = join(mkdtempSync(join(tmpdir(), 'mock-gen-')), 'state.json');
  const first = await start(['--persist', persist]);
  let gen;
  let edit;
  try {
    gen = await (await first.json('POST', '/api/generations', { prompt: 'p', option: 'ltx' })).json();
    edit = await (await first.form('/api/image-edits', { prompt: 'p' })).json();
  } finally {
    first.stop();
  }
  const second = await start(['--persist', persist]);
  try {
    assert.deepEqual((await (await second.json('GET', '/api/generations')).json()).map((g) => g.id), [gen.id]);
    assert.equal((await second.json('GET', `/api/image-edits/${edit.id}`)).status, 200);
  } finally {
    second.stop();
  }
});

test('the client a dashboard names is kept, and one that does not fit is refused and creates nothing', async () => {
  const m = await start();
  try {
    const gen = await (await m.json('POST', '/api/generations', { prompt: 'p', option: 'ltx', client: 'video-studio' })).json();
    assert.equal(gen.client, 'video-studio');
    assert.equal(gen.request.client, 'video-studio');
    const plain = await (await m.json('POST', '/api/generations', { prompt: 'p', option: 'ltx' })).json();
    assert.equal(plain.client, 'unknown');
    const edit = await (await m.form('/api/image-edits', { prompt: 'p', client: 'photo-lab' })).json();
    assert.equal(edit.client, 'photo-lab');
    for (const bad of ['Video Studio', '', 'a_b', 'a'.repeat(33)]) {
      const res = await m.json('POST', '/api/generations', { prompt: 'p', option: 'ltx', client: bad });
      assert.equal(res.status, 422, JSON.stringify(bad));
      assert.match((await res.json()).error.message, /client/);
      assert.equal((await m.form('/api/image-edits', { prompt: 'p', client: bad })).status, 422, JSON.stringify(bad));
    }
    const list = await (await m.json('GET', '/api/generations')).json();
    assert.equal(list.length, 2, 'a refused request creates nothing');
  } finally {
    m.stop();
  }
});

// ---------------------------------------------------------------- the inputs of a generation
const inputsForm = (m, request, parts) => {
  const f = new FormData();
  f.set('request', JSON.stringify(request));
  for (const [field, name] of parts) f.append(field, new Blob([new Uint8Array([1, 2, 3])]), name);
  return fetch(m.base + '/api/generations', { method: 'POST', body: f });
};
const refused = async (m, request, parts, part) => {
  const res = await inputsForm(m, request, parts);
  assert.equal(res.status, 422, JSON.stringify(parts));
  const body = await res.json();
  assert.match(body.error.message, new RegExp(part));
  assert.equal((await (await m.json('GET', '/api/generations')).json()).length, 0, 'nothing is created');
};

test('a generation reports its inputs, the start picture first, with an end picture for the options that take one', async () => {
  const m = await start();
  try {
    const res = await inputsForm(m, { prompt: 'a fox', option: 'ltx' }, [['end_image', 'end.png'], ['image', 'start.png']]);
    assert.equal(res.status, 202);
    const made = await res.json();
    fits('/api/generations', 'post', 202, made);
    assert.deepEqual(made.inputs.map((i) => i.kind), ['end_image', 'start_image']);
    const plain = await (await m.json('POST', '/api/generations', { prompt: 'a fox' })).json();
    assert.deepEqual(plain.inputs, []);
  } finally {
    m.stop();
  }
});

test('references are accepted in order for a references option and refused as the server refuses', async () => {
  const m = await start();
  try {
    const ok = await inputsForm(m, { prompt: 'a fox like <Picture 1>', option: 'h3-ref' }, [['reference_images', '1.png'], ['reference_images', '2.png'], ['reference_videos', 'v.mp4'], ['reference_audios', 'a.wav']]);
    assert.equal(ok.status, 202);
    assert.deepEqual((await ok.json()).inputs.map((i) => i.name), ['1.png', '2.png', 'v.mp4', 'a.wav']);
  } finally {
    m.stop();
  }
  const r = await start();
  try {
    await refused(r, { prompt: 'x', option: 'h3-ref' }, [['image', 's.png'], ['reference_images', '1.png']], 'image');
    await refused(r, { prompt: 'x', option: 'h3-ref' }, [['reference_videos', 'v.mp4']], 'reference_images');
    await refused(r, { prompt: 'x', option: 'h3-ref' }, [['reference_images', '1.png'], ['reference_images', '2.png'], ['reference_images', '3.png']], 'at most 2');
    await refused(r, { prompt: 'x', option: 'h3-ref' }, [['reference_images', '1.png'], ['reference_audios', 'a.txt']], 'reference_audios');
    await refused(r, { prompt: 'x', option: 'ltx' }, [['reference_images', '1.png']], 'does not take references');
    await refused(r, { prompt: 'x', option: 'ltx' }, [['end_image', 'e.png']], 'needs the start picture');
    await refused(r, { prompt: 'x', option: 'wan-high' }, [['image', 's.png'], ['end_image', 'e.png']], 'end_image');
  } finally {
    r.stop();
  }
});

test('reuse_inputs_of repeats a generation with its inputs, and is refused with parts, unknown or with nothing kept', async () => {
  const m = await start();
  try {
    const first = await (await inputsForm(m, { prompt: 'a fox', option: 'ltx' }, [['image', 's.png'], ['end_image', 'e.png']])).json();
    const again = await m.json('POST', '/api/generations', { prompt: 'a fox', option: 'ltx', reuse_inputs_of: first.id });
    assert.equal(again.status, 202);
    const made = await again.json();
    assert.deepEqual(made.inputs.map((i) => i.name), ['s.png', 'e.png']);
    assert.notEqual(made.id, first.id);
    const empty = await (await m.json('POST', '/api/generations', { prompt: 'a fox' })).json();
    for (const [body, parts] of [[{ prompt: 'x', option: 'ltx', reuse_inputs_of: first.id }, [['image', 's.png']]], [{ prompt: 'x', reuse_inputs_of: 'nope' }, []], [{ prompt: 'x', reuse_inputs_of: empty.id }, []]]) {
      const res = parts.length ? await inputsForm(m, body, parts) : await m.json('POST', '/api/generations', body);
      assert.equal(res.status, 422);
    }
  } finally {
    m.stop();
  }
});
