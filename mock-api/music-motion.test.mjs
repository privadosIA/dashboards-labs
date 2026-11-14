// The music motion operations of the mock: the answers fit the contract (closed objects), a piece is complete when it is
// made, a render goes through its states, the refusals are the server's and change nothing.
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

// The mock starts with the animation sample in it; the tests start it without, unless they are about the sample.
async function start(extra = [], { sample = false } = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), '--spec', specPath, '--speed', '100', ...extra], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...(sample ? {} : { MOCK_SAMPLE: 'off' }) } });
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
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`never: ${what}`);
};
const SONG = { project: 'demo-musica', track_id: 'track-1', variant: 0 };
const P = '/api/music-motion/pieces';

test('the library has songs that fit the contract, one with more than one version', async () => {
  const mock = await start();
  try {
    const res = await mock.json('GET', '/api/library');
    const body = await res.json();
    fits('/api/library', 'get', 200, body);
    assert.ok(body.songs.length >= 2);
    assert.ok(body.songs.filter((s) => s.project === 'demo-musica').length > 1);
  } finally {
    mock.stop();
  }
});

test('a part is read back with its text, a built-in one too, and an unknown name is a 404', async () => {
  const mock = await start();
  try {
    const res = await mock.json('GET', '/api/music-motion/parts/pulse-ring');
    const body = await res.json();
    fits('/api/music-motion/parts/{name}', 'get', 200, body);
    assert.equal(body.source, 'user');
    assert.equal(body.manifest.name, 'pulse-ring');
    assert.match(body.fragment, /__partSeek/);
    const builtin = await mock.json('GET', '/api/music-motion/parts/toggle');
    const card = await builtin.json();
    fits('/api/music-motion/parts/{name}', 'get', 200, card);
    assert.equal(card.source, 'builtin');
    assert.match(card.fragment, /__partSeek/);
    const missing = await mock.json('GET', '/api/music-motion/parts/no-such-part');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'not_found');
  } finally {
    mock.stop();
  }
});

test('the catalog has parts of every level and every parameter type, characters and backgrounds', async () => {
  const mock = await start();
  try {
    const res = await mock.json('GET', '/api/music-motion/catalog');
    const body = await res.json();
    fits('/api/music-motion/catalog', 'get', 200, body);
    assert.ok(body.parts.some((p) => p.levels.join() === 'simple,medium,advanced'));
    assert.ok(body.parts.some((p) => p.levels.join() === 'medium,advanced'));
    assert.ok(body.parts.some((p) => p.levels.join() === 'advanced'));
    const types = new Set(body.parts.flatMap((p) => p.params.map((q) => q.type)));
    for (const t of ['string', 'int', 'number', 'bool', 'enum']) assert.ok(types.has(t), t);
    assert.ok(body.characters.length && body.backgrounds.length);
    assert.equal(body.parts.length, 30);
    const strip = body.parts.find((p) => p.name === 'timeline-strip');
    assert.equal(strip.manual, true);
    for (const name of ['phosphor-terminal', 'oscilloscope', 'synth-sun', 'warp-grid', 'nebula', 'word-cloud', 'network-diagram']) assert.ok(body.parts.some((p) => p.name === name), name);
    for (const name of ['timeline-strip', 'phosphor-terminal', 'oscilloscope', 'synth-sun', 'warp-grid', 'nebula', 'word-cloud', 'network-diagram']) {
      const ms = body.parts.find((p) => p.name === name).cost_ms;
      assert.ok(ms >= 77 && ms <= 99, `${name} costs ${ms}`);
    }
    assert.deepEqual(body.characters.map((c) => c.name), ['bot', 'scientist', 'mascot']);
    assert.deepEqual(body.backgrounds.map((b) => b.name), ['stage', 'night-sky', 'paper', 'pastel-dots']);
    for (const name of ['search-box', 'click-button', 'roll-counter', 'sunburst', 'achievement-toast', 'data-table', 'dependency-tree', 'password-field']) assert.ok(body.parts.some((p) => p.name === name), name);
  } finally {
    mock.stop();
  }
});

test('a piece is complete when it is made, appears in the list and is not a project', async () => {
  const mock = await start();
  try {
    const res = await mock.json('POST', P, { ...SONG, client: 'video-anim' });
    assert.equal(res.status, 201);
    const piece = await res.json();
    fits(P, 'post', 201, piece);
    assert.equal(piece.state, 'draft');
    assert.equal(piece.style, 'typographic');
    assert.equal(piece.level, 'simple');
    assert.equal(piece.fps, 30);
    assert.equal(piece.client, 'video-anim');
    assert.ok(piece.design && piece.script && piece.song_map);
    assert.equal(piece.estimate.estimate, true);
    // the script covers the song with no gap
    const ends = piece.script.pieces.map((p) => [p.start, p.end]);
    assert.equal(ends[0][0], 0);
    assert.equal(ends.at(-1)[1], piece.song_map.duration);
    ends.slice(1).forEach(([start], i) => assert.equal(start, ends[i][1]));

    const list = await (await mock.json('GET', P)).json();
    fits(P, 'get', 200, list);
    assert.equal(list.length, 1);
    assert.equal(list[0].script, undefined);
    const one = await (await mock.json('GET', `${P}/${piece.id}`)).json();
    fits(`${P}/{id}`, 'get', 200, one);
    assert.ok(one.script);
    const projects = await (await mock.json('GET', '/api/projects')).json();
    assert.ok(!JSON.stringify(projects).includes(piece.id));
  } finally {
    mock.stop();
  }
});

test('the illustrated style defaults to 24 fps and a request the server would refuse creates nothing', async () => {
  const mock = await start();
  try {
    const ill = await (await mock.json('POST', P, { ...SONG, style: 'illustrated' })).json();
    assert.equal(ill.fps, 24);
    for (const [change, text] of [
      [{ level: 'huge' }, /level/],
      [{ style: 'cartoon' }, /style/],
      [{ fps: 25 }, /frame rate/],
      [{ resolution: 'big' }, /resolution/],
      [{ client: 'No Good!' }, /client/],
      [{ variant: 9 }, /unknown/],
      [{ design: { dark: 'red' } }, /design/],
    ]) {
      const res = await mock.json('POST', P, { ...SONG, ...change });
      assert.equal(res.status, 422, JSON.stringify(change));
      const body = await res.json();
      fits(P, 'post', 422, body);
      assert.match(body.error.message, text);
    }
    assert.equal((await (await mock.json('GET', P)).json()).length, 1);
  } finally {
    mock.stop();
  }
});

test('a design is validated and saved as the user\'s; a low-contrast accent is refused and the design stays', async () => {
  const mock = await start();
  try {
    const piece = await (await mock.json('POST', P, SONG)).json();
    const design = { ...piece.design.design, accent: '#ff0000' };
    const ok = await mock.json('PUT', `${P}/${piece.id}/design`, design);
    assert.equal(ok.status, 200);
    const stored = await ok.json();
    fits(`${P}/{id}/design`, 'put', 200, stored);
    assert.equal(stored.edited, true);
    assert.equal(stored.source, 'user');
    const low = await mock.json('PUT', `${P}/${piece.id}/design`, { ...design, accent: design.dark });
    assert.equal(low.status, 422);
    assert.match((await low.json()).error.message, /contrast/);
    assert.equal((await (await mock.json('GET', `${P}/${piece.id}`)).json()).design.design.accent, '#ff0000');
  } finally {
    mock.stop();
  }
});

test('a script is validated: an unknown part, a gap, a parameter outside its limits; the previous script stays', async () => {
  const mock = await start();
  try {
    const piece = await (await mock.json('POST', P, SONG)).json();
    const pieces = piece.script.pieces;
    const put = (script) => mock.json('PUT', `${P}/${piece.id}/script`, script);
    const unknown = await put({ version: 1, pieces: pieces.map((p, i) => (i ? p : { ...p, part: 'nope' })) });
    assert.equal(unknown.status, 422);
    assert.match((await unknown.json()).error.message, /nope/);
    const gap = await put({ version: 1, pieces: pieces.map((p, i) => (i ? p : { ...p, end: p.end - 1 })) });
    assert.equal(gap.status, 422);
    assert.match((await gap.json()).error.message, /gap/);
    const limit = await put({ version: 1, pieces: pieces.map((p, i) => (i ? p : { ...p, part: 'parallax-cards', params: { count: 99 } })) });
    assert.equal(limit.status, 422);
    assert.match((await limit.json()).error.message, /count/);
    assert.deepEqual((await (await mock.json('GET', `${P}/${piece.id}`)).json()).script.pieces, pieces);

    const edited = pieces.map((p, i) => (i ? p : { ...p, part: 'toggle', params: { label: 'hola', on: false } }));
    const ok = await put({ version: 1, pieces: edited });
    assert.equal(ok.status, 200);
    fits(`${P}/{id}/script`, 'put', 200, await ok.json());
    assert.equal((await (await mock.json('GET', `${P}/${piece.id}`)).json()).script_source, 'user');
  } finally {
    mock.stop();
  }
});

test('proposing a design or a script answers its source, and the fixed rule is not an error', async () => {
  const mock = await start();
  try {
    const piece = await (await mock.json('POST', P, SONG)).json();
    for (const what of ['design', 'script']) {
      const res = await mock.json('POST', `${P}/${piece.id}/propose`, { what });
      assert.equal(res.status, 200);
      const body = await res.json();
      fits(`${P}/{id}/propose`, 'post', 200, body);
      assert.equal(body.source, 'fallback');
    }
    const assistant = await (await mock.json('POST', `${P}/${piece.id}/propose`, { what: 'script', provider: 'ollama' })).json();
    assert.equal(assistant.source, 'assistant');
    assert.equal((await mock.json('POST', `${P}/${piece.id}/propose`, { what: 'colours' })).status, 422);
  } finally {
    mock.stop();
  }
});

test('a render goes through its states to done with a video, and a busy piece answers 409', async () => {
  const mock = await start();
  try {
    const piece = await (await mock.json('POST', P, SONG)).json();
    const res = await mock.json('POST', `${P}/${piece.id}/render`);
    assert.equal(res.status, 202);
    const started = await res.json();
    fits(`${P}/{id}/render`, 'post', 202, started);
    assert.ok(started.run_id);
    assert.equal((await mock.json('POST', `${P}/${piece.id}/render`)).status, 409);
    assert.equal((await mock.json('PUT', `${P}/${piece.id}/design`, piece.design.design)).status, 409);
    assert.equal((await mock.json('DELETE', `${P}/${piece.id}`)).status, 409);
    const done = await until(async () => (await mock.json('GET', `${P}/${piece.id}`)).json(), (p) => p.state === 'done', 'the piece is done');
    fits(`${P}/{id}`, 'get', 200, done);
    assert.equal(done.progress, 100);
    assert.match(done.video, /\.mp4$/);
    assert.equal((await fetch(mock.base + done.video)).status, 200);
    assert.equal((await mock.json('DELETE', `${P}/${piece.id}`)).status, 204);
    assert.equal((await mock.json('GET', `${P}/${piece.id}`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('the pieces survive a restart on the same file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mock-mm-'));
  const file = join(dir, 'state.json');
  const first = await start(['--persist', file]);
  let id;
  try {
    id = (await (await first.json('POST', P, SONG)).json()).id;
  } finally {
    first.stop();
  }
  const second = await start(['--persist', file]);
  try {
    assert.equal((await second.json('GET', `${P}/${id}`)).status, 200);
  } finally {
    second.stop();
  }
});

const MORNING = { project: 'morning-light', track_id: 'track-1', variant: 0 };
const INSTRUMENTAL = { project: 'demo-musica', track_id: 'track-1', variant: 1 };

test('hearing the words: the map stops being estimated, a script nobody edited is made again, an edited one is kept and warned about', async () => {
  const mock = await start();
  try {
    const made = await (await mock.json('POST', P, SONG)).json();
    assert.equal(made.song_map.words_estimated, true);
    const res = await mock.json('POST', `${P}/${made.id}/transcribe`);
    assert.equal(res.status, 200);
    const heard = await res.json();
    fits(`${P}/{id}/transcribe`, 'post', 200, heard);
    assert.equal(heard.song_map.words_estimated, false);
    assert.equal(heard.script_warning, undefined);
    assert.equal((await (await mock.json('GET', `${P}/${made.id}`)).json()).song_map.words_estimated, false);

    const other = await (await mock.json('POST', P, SONG)).json();
    await mock.json('PUT', `${P}/${other.id}/script`, other.script);
    const kept = await (await mock.json('POST', `${P}/${other.id}/transcribe`)).json();
    fits(`${P}/{id}/transcribe`, 'post', 200, kept);
    assert.match(kept.script_warning, /kept/);
    assert.equal(kept.script_source, 'user');
    // the warning belongs to the answer that caused it
    assert.equal((await (await mock.json('GET', `${P}/${other.id}`)).json()).script_warning, undefined);
  } finally {
    mock.stop();
  }
});

test('hearing the words is refused as the server does: 404, 409 while drawing, 503 without Whisper, a note for a song with no words', async () => {
  const mock = await start();
  try {
    assert.equal((await mock.json('POST', `${P}/nope/transcribe`)).status, 404);

    const drawing = await (await mock.json('POST', P, SONG)).json();
    await mock.json('POST', `${P}/${drawing.id}/render`);
    const busy = await mock.json('POST', `${P}/${drawing.id}/transcribe`);
    assert.equal(busy.status, 409);
    fits(`${P}/{id}/transcribe`, 'post', 409, await busy.json());

    const quiet = await (await mock.json('POST', P, MORNING)).json();
    const refused = await mock.json('POST', `${P}/${quiet.id}/transcribe`);
    assert.equal(refused.status, 503);
    const why = await refused.json();
    fits(`${P}/{id}/transcribe`, 'post', 503, why);
    assert.match(why.error.message, /whisper/);
    assert.equal((await (await mock.json('GET', `${P}/${quiet.id}`)).json()).song_map.words_estimated, true);

    const none = await (await mock.json('POST', P, INSTRUMENTAL)).json();
    const note = await (await mock.json('POST', `${P}/${none.id}/transcribe`)).json();
    fits(`${P}/{id}/transcribe`, 'post', 200, note);
    assert.match(note.words_note, /no words/);
  } finally {
    mock.stop();
  }
});

test('a piece made asking for the words hears them, or is made anyway with a note that only that answer carries', async () => {
  const mock = await start();
  try {
    const heard = await (await mock.json('POST', P, { ...SONG, transcribe: true })).json();
    fits(P, 'post', 201, heard);
    assert.equal(heard.song_map.words_estimated, false);
    assert.equal(heard.words_note, undefined);

    const res = await mock.json('POST', P, { ...MORNING, transcribe: true });
    assert.equal(res.status, 201);
    const made = await res.json();
    fits(P, 'post', 201, made);
    assert.equal(made.song_map.words_estimated, true);
    assert.match(made.words_note, /whisper/);
    assert.equal((await (await mock.json('GET', `${P}/${made.id}`)).json()).words_note, undefined);

    assert.equal((await mock.json('POST', P, { ...SONG, transcribe: 'yes' })).status, 422);
  } finally {
    mock.stop();
  }
});

test('a design keeps its verse and word-hit styles, and refuses a style that is not one of the contract\'s', async () => {
  const mock = await start();
  try {
    const made = await (await mock.json('POST', P, SONG)).json();
    const design = { ...made.design.design, verse_style: 'karaoke', hit_style: 'glow' };
    const saved = await mock.json('PUT', `${P}/${made.id}/design`, design);
    assert.equal(saved.status, 200);
    fits(`${P}/{id}/design`, 'put', 200, await saved.json());
    assert.equal((await (await mock.json('GET', `${P}/${made.id}`)).json()).design.design.verse_style, 'karaoke');
    const refused = await mock.json('PUT', `${P}/${made.id}/design`, { ...design, verse_style: 'neon' });
    assert.equal(refused.status, 422);
    assert.match((await refused.json()).error.message, /verse_style/);
    assert.equal((await (await mock.json('GET', `${P}/${made.id}`)).json()).design.design.verse_style, 'karaoke');
  } finally {
    mock.stop();
  }
});

test('a script piece can draw up to three extra parts beside its main one, with no repeats and parameters inside their limits', async () => {
  const mock = await start();
  try {
    const made = await (await mock.json('POST', P, SONG)).json();
    const withOf = (extras) => ({ ...made.script, pieces: made.script.pieces.map((p, i) => (i === 0 ? { ...p, with: extras } : p)) });
    const put = (script) => mock.json('PUT', `${P}/${made.id}/script`, script);
    const first = made.script.pieces[0].id;

    const ok = await put(withOf([{ part: 'timeline-strip', params: { labels: 'a|b', progress: -1 } }, { part: 'oscilloscope' }]));
    assert.equal(ok.status, 200);
    fits(`${P}/{id}/script`, 'put', 200, await ok.json());
    assert.equal((await (await mock.json('GET', `${P}/${made.id}`)).json()).script.pieces[0].with.length, 2);

    const refused = async (extras, pattern) => {
      const res = await put(withOf(extras));
      assert.equal(res.status, 422, JSON.stringify(extras));
      const why = (await res.json()).error.message;
      assert.match(why, new RegExp(`^piece ${first}: `));
      assert.match(why, pattern);
    };
    await refused([{ part: 'a' }, { part: 'timeline-strip' }, { part: 'oscilloscope' }, { part: 'nebula' }], /up to 3/);
    await refused([{ part: 'nope' }], /not in the catalog/);
    await refused([{ part: 'oscilloscope' }, { part: 'oscilloscope' }], /already drawn/);
    await refused([{ part: made.script.pieces[0].part }], /already drawn/);
    await refused([{ part: 'oscilloscope', params: { lines: 9 } }], /outside/);
    await refused([{ part: 'oscilloscope', params: { zzz: 1 } }], /no parameter/);
    // the refused ones changed nothing
    assert.equal((await (await mock.json('GET', `${P}/${made.id}`)).json()).script.pieces[0].with.length, 2);
  } finally {
    mock.stop();
  }
});

test('a script piece can have a design of its own that is checked as a whole design, and glow is a verse style', async () => {
  const mock = await start();
  try {
    const made = await (await mock.json('POST', P, SONG)).json();
    const own = (design) => ({ ...made.script, pieces: made.script.pieces.map((p, i) => (i === 1 ? { ...p, design } : p)) });
    const put = (script) => mock.json('PUT', `${P}/${made.id}/script`, script);
    const second = made.script.pieces[1].id;

    const ok = await put(own({ accent: '#00ff88', verse_style: 'glow', hit_style: 'metal' }));
    assert.equal(ok.status, 200);
    fits(`${P}/{id}/script`, 'put', 200, await ok.json());

    const low = await put(own({ accent: made.design.design.dark }));
    assert.equal(low.status, 422);
    const why = (await low.json()).error.message;
    assert.match(why, new RegExp(`^piece ${second}: design: accent`));
    assert.match(why, /3:1/);
    const bad = await put(own({ verse_style: 'neon' }));
    assert.equal(bad.status, 422);
    assert.match((await bad.json()).error.message, /verse_style/);
    assert.equal((await put(own({ colour: '#fff' }))).status, 422);

    const glowSong = await mock.json('PUT', `${P}/${made.id}/design`, { ...made.design.design, verse_style: 'glow' });
    assert.equal(glowSong.status, 200);
  } finally {
    mock.stop();
  }
});

const R = '/api/music-motion/references';
const PRESETS = '/api/music-motion/presets';
const YT = 'https://www.youtube.com/watch?v=abc';

/** A reference added and followed until it leaves `analysing`. */
async function readyReference(mock, url = YT, extra = {}) {
  const added = await (await mock.json('POST', R, { url, ...extra })).json();
  return until(
    async () => (await mock.json('GET', `${R}/${added.id}`)).json(),
    (r) => r.state !== 'analysing',
    'the analysis ends',
  );
}

test('a reference is added by address, is analysing, then ready with an analysis that fits the contract, and is listed newest first', async () => {
  const mock = await start();
  try {
    const res = await mock.json('POST', R, { url: YT, title: 'Mine', notes: 'fast', tags: ['pop'] });
    assert.equal(res.status, 202);
    const added = await res.json();
    fits(R, 'post', 202, added);
    assert.equal(added.state, 'analysing');
    assert.equal(added.analysis, undefined);
    assert.deepEqual([added.title, added.notes, added.tags, added.source], ['Mine', 'fast', ['pop'], YT]);

    const done = await until(async () => (await mock.json('GET', `${R}/${added.id}`)).json(), (r) => r.state !== 'analysing', 'ready');
    fits(`${R}/{id}`, 'get', 200, done);
    assert.equal(done.state, 'ready');
    assert.equal(done.analysis.colours.length, 5);
    assert.equal(done.analysis.thirds.length, 3);
    assert.ok(done.analysis.frames.length >= 5);
    assert.ok(done.analysis.description);

    await new Promise((r) => setTimeout(r, 5));
    await mock.json('POST', R, { url: YT, title: 'Second' });
    const list = await (await mock.json('GET', R)).json();
    fits(R, 'get', 200, list);
    assert.deepEqual(list.references.map((r) => r.title), ['Second', 'Mine']);
  } finally {
    mock.stop();
  }
});

test('a reference is added by a video file in a form, with its tags as a JSON list, and a file that is not a video is refused', async () => {
  const mock = await start();
  try {
    const send = (type, name, extra = {}) => {
      const f = new FormData();
      f.set('file', new Blob([new Uint8Array([0, 0, 0, 24])], { type }), name);
      for (const [k, v] of Object.entries(extra)) f.set(k, v);
      return fetch(`${mock.base}${R}`, { method: 'POST', body: f });
    };
    const ok = await send('video/mp4', 'clip.mp4', { title: 'A clip', tags: JSON.stringify(['a', 'b']) });
    assert.equal(ok.status, 202);
    const added = await ok.json();
    fits(R, 'post', 202, added);
    assert.deepEqual([added.title, added.tags, added.source], ['A clip', ['a', 'b'], undefined]);
    const named = await (await send('video/mp4', 'other.mp4')).json();
    assert.equal(named.title, 'other.mp4');

    const refused = await send('text/plain', 'notes.txt');
    assert.equal(refused.status, 422);
    assert.match((await refused.json()).error.message, /not a video/);
    assert.equal((await (await mock.json('GET', R)).json()).references.length, 2);
  } finally {
    mock.stop();
  }
});

test('a reference is refused with the server\'s reasons and nothing is created: not YouTube, too long, no address, bad data, no yt-dlp', async () => {
  const mock = await start();
  try {
    const cases = [
      [{ url: 'https://example.com/v' }, 422, /YouTube/],
      [{ url: 'https://youtu.be/long' }, 422, /20 minutes/],
      [{}, 422, /address/],
      [{ url: YT, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, 422, /tags/],
      [{ url: YT, title: 'a'.repeat(121) }, 422, /title/],
      [{ url: 'https://youtu.be/noytdlp' }, 503, /yt-dlp/],
    ];
    for (const [body, status, why] of cases) {
      const res = await mock.json('POST', R, body);
      assert.equal(res.status, status, JSON.stringify(body));
      const answer = await res.json();
      assert.match(answer.error.message, why);
    }
    assert.deepEqual((await (await mock.json('GET', R)).json()).references, []);
  } finally {
    mock.stop();
  }
});

test('a reference with no description says why, and one that cannot be read fails with the reason', async () => {
  const mock = await start();
  try {
    const noDesc = await readyReference(mock, 'https://youtu.be/nodesc');
    fits(`${R}/{id}`, 'get', 200, noDesc);
    assert.equal(noDesc.analysis.description, undefined);
    assert.ok(noDesc.analysis.description_note);
    const broken = await readyReference(mock, 'https://youtu.be/broken');
    fits(`${R}/{id}`, 'get', 200, broken);
    assert.equal(broken.state, 'failed');
    assert.ok(broken.error);
    assert.equal(broken.analysis, undefined);
  } finally {
    mock.stop();
  }
});

test('a reference is changed by the fields that are sent, serves its key frames, and is deleted', async () => {
  const mock = await start();
  try {
    const ready = await readyReference(mock, YT, { title: 'Old', notes: 'keep', tags: ['x'] });
    const patched = await mock.json('PATCH', `${R}/${ready.id}`, { title: 'New' });
    assert.equal(patched.status, 200);
    const body = await patched.json();
    fits(`${R}/{id}`, 'patch', 200, body);
    assert.deepEqual([body.title, body.notes, body.tags], ['New', 'keep', ['x']]);
    assert.equal((await mock.json('PATCH', `${R}/${ready.id}`, { title: '   ' })).status, 422);
    assert.equal((await mock.json('PATCH', `${R}/nope`, { title: 'x' })).status, 404);

    const frame = await fetch(`${mock.base}${R}/${ready.id}/frames/${ready.analysis.frames[0]}`);
    assert.equal(frame.status, 200);
    assert.equal(frame.headers.get('content-type'), 'image/jpeg');
    assert.ok((await frame.arrayBuffer()).byteLength > 0);
    assert.equal((await fetch(`${mock.base}${R}/${ready.id}/frames/99.jpg`)).status, 404);

    assert.equal((await mock.json('DELETE', `${R}/${ready.id}`)).status, 204);
    assert.equal((await mock.json('GET', `${R}/${ready.id}`)).status, 404);
    assert.equal((await mock.json('DELETE', `${R}/${ready.id}`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('a style is made from a ready reference, with a design that is valid, a rhythm in range and what was adjusted, and outlives its reference', async () => {
  const mock = await start();
  try {
    const ready = await readyReference(mock);
    const res = await mock.json('POST', PRESETS, { reference_id: ready.id, name: 'Warm' });
    assert.equal(res.status, 201);
    const preset = await res.json();
    fits(PRESETS, 'post', 201, preset);
    assert.deepEqual([preset.name, preset.reference_id, preset.parts], ['Warm', ready.id, []]);
    assert.ok(preset.rhythm >= 2 && preset.rhythm <= 15);
    assert.equal(preset.design.accent, ready.analysis.colours[0].hex);

    const dark = await readyReference(mock, 'https://youtu.be/dark');
    const adjusted = await (await mock.json('POST', PRESETS, { reference_id: dark.id })).json();
    assert.equal(adjusted.adjustments.length, 1);
    assert.equal(adjusted.name, dark.title);
    assert.notEqual(adjusted.design.accent, '#202030');

    await mock.json('DELETE', `${R}/${ready.id}`);
    const list = await (await mock.json('GET', PRESETS)).json();
    fits(PRESETS, 'get', 200, list);
    assert.ok(list.presets.some((p) => p.id === preset.id));
    const read = await mock.json('GET', `${PRESETS}/${preset.id}`);
    fits(`${PRESETS}/{id}`, 'get', 200, await read.json());
  } finally {
    mock.stop();
  }
});

test('a style is refused when its reference does not exist or is not ready', async () => {
  const mock = await start();
  try {
    const none = await mock.json('POST', PRESETS, { reference_id: 'nope' });
    assert.equal(none.status, 422);
    assert.match((await none.json()).error.message, /does not exist/);
    const added = await (await mock.json('POST', R, { url: YT })).json();
    const early = await mock.json('POST', PRESETS, { reference_id: added.id });
    assert.equal(early.status, 422);
    assert.match((await early.json()).error.message, /not ready/);
    assert.deepEqual((await (await mock.json('GET', PRESETS)).json()).presets, []);
  } finally {
    mock.stop();
  }
});

test('a style is replaced as a whole and refused with the field at the start of the reason; deleting it is final', async () => {
  const mock = await start();
  try {
    const ready = await readyReference(mock);
    const preset = await (await mock.json('POST', PRESETS, { reference_id: ready.id })).json();
    const put = (change) => mock.json('PUT', `${PRESETS}/${preset.id}`, { name: preset.name, design: preset.design, rhythm: preset.rhythm, parts: preset.parts, ...change });

    const ok = await put({ name: 'Renamed', rhythm: 9, parts: ['toggle'] });
    assert.equal(ok.status, 200);
    const saved = await ok.json();
    fits(`${PRESETS}/{id}`, 'put', 200, saved);
    assert.deepEqual([saved.name, saved.rhythm, saved.parts], ['Renamed', 9, ['toggle']]);

    for (const [change, pattern] of [
      [{ rhythm: 1 }, /^rhythm/],
      [{ rhythm: 16 }, /^rhythm/],
      [{ name: ' ' }, /^name/],
      [{ design: { ...preset.design, accent: preset.design.dark } }, /^design\.accent/],
      [{ parts: ['toggle', 'nope'] }, /^parts\[1\]/],
    ]) {
      const res = await put(change);
      assert.equal(res.status, 422, JSON.stringify(change));
      assert.match((await res.json()).error.message, pattern);
    }
    assert.equal((await (await mock.json('GET', `${PRESETS}/${preset.id}`)).json()).rhythm, 9);

    assert.equal((await mock.json('DELETE', `${PRESETS}/${preset.id}`)).status, 204);
    assert.equal((await mock.json('GET', `${PRESETS}/${preset.id}`)).status, 404);
    assert.equal((await mock.json('PUT', `${PRESETS}/${preset.id}`, {})).status, 404);
  } finally {
    mock.stop();
  }
});

test('a piece made with a style starts from its design and parts and says which, the request\'s design wins, and an unknown style is refused', async () => {
  const mock = await start();
  try {
    const ready = await readyReference(mock);
    const preset = await (await mock.json('POST', PRESETS, { reference_id: ready.id })).json();
    await mock.json('PUT', `${PRESETS}/${preset.id}`, { name: preset.name, design: { ...preset.design, accent: '#00ff88' }, rhythm: preset.rhythm, parts: ['counter'] });

    const res = await mock.json('POST', P, { ...SONG, preset: preset.id });
    assert.equal(res.status, 201);
    const piece = await res.json();
    fits(P, 'post', 201, piece);
    assert.equal(piece.preset, preset.id);
    assert.equal(piece.design.design.accent, '#00ff88');
    assert.ok(piece.script.pieces.every((p) => p.part === 'counter'));
    assert.equal((await (await mock.json('GET', `${P}/${piece.id}`)).json()).preset, preset.id);
    assert.equal((await (await mock.json('GET', P)).json()).find((x) => x.id === piece.id).preset, preset.id);

    const own = await (await mock.json('POST', P, { ...SONG, preset: preset.id, design: { ...preset.design, accent: '#ff5a3c' } })).json();
    assert.equal(own.design.design.accent, '#ff5a3c');

    const none = await mock.json('POST', P, { ...SONG, preset: 'nope' });
    assert.equal(none.status, 422);
    assert.match((await none.json()).error.message, /preset/);
    assert.equal((await (await mock.json('GET', P)).json()).length, 2);

    const plain = await (await mock.json('POST', P, SONG)).json();
    assert.equal(plain.preset, undefined);
  } finally {
    mock.stop();
  }
});

const D = '/api/music-motion/part-drafts';

/** A draft asked for and followed until it leaves `writing`. */
async function writtenDraft(mock, request, extra = {}) {
  const asked = await (await mock.json('POST', D, { request, ...extra })).json();
  return until(
    async () => (await mock.json('GET', `${D}/${asked.id}`)).json(),
    (d) => d.state !== 'writing',
    'the draft is written',
  );
}
const askForm = (mock, fields, file) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (file) f.set('file', new Blob([new Uint8Array(file.size ?? 10)], { type: file.type }), file.name ?? 'p.png');
  return fetch(`${mock.base}${D}`, { method: 'POST', body: f });
};

test('a part is asked for with a phrase alone, is writing, and then ready with a name, its text and a preview; the list carries no text', async () => {
  const mock = await start();
  try {
    const res = await mock.json('POST', D, { request: 'a clock that ticks' });
    assert.equal(res.status, 202);
    const asked = await res.json();
    fits(D, 'post', 202, asked);
    assert.deepEqual([asked.state, asked.with_picture, asked.attempts, asked.preview], ['writing', false, 1, []]);
    assert.equal(asked.source, undefined);

    const done = await until(async () => (await mock.json('GET', `${D}/${asked.id}`)).json(), (d) => d.state !== 'writing', 'ready');
    fits(`${D}/{id}`, 'get', 200, done);
    assert.equal(done.state, 'ready');
    assert.equal(JSON.parse(done.manifest).name, done.name);
    assert.ok(done.fragment);
    assert.deepEqual(done.preview, ['01.png', '02.png']);

    const list = await (await mock.json('GET', D)).json();
    fits(D, 'get', 200, list);
    assert.equal(list.drafts[0].manifest, undefined);
    assert.equal(list.drafts[0].fragment, undefined);
  } finally {
    mock.stop();
  }
});

test('a part is asked for with a frame of a reference, or with a picture in a form, and says where the picture came from', async () => {
  const mock = await start();
  try {
    const ref = await readyReference(mock);
    const byFrame = await mock.json('POST', D, { request: 'a clock', reference_id: ref.id, frame: ref.analysis.frames[2] });
    assert.equal(byFrame.status, 202);
    const framed = await byFrame.json();
    fits(D, 'post', 202, framed);
    assert.deepEqual([framed.with_picture, framed.source], [true, `reference:${ref.id}/${ref.analysis.frames[2]}`]);
    assert.ok(framed.description);

    const upload = await askForm(mock, { request: 'a clock' }, { type: 'image/png', name: 'p.png' });
    assert.equal(upload.status, 202);
    const uploaded = await upload.json();
    fits(D, 'post', 202, uploaded);
    assert.deepEqual([uploaded.with_picture, uploaded.source], [true, 'upload']);
    assert.equal((await (await askForm(mock, { request: 'only words' })).json()).with_picture, false);
  } finally {
    mock.stop();
  }
});

test('a part is refused with the server\'s reasons and nothing is created: the phrase, the reference, the frame, the file, a busy run, no Chrome, no assistant, no vision model', async () => {
  const mock = await start();
  try {
    const ref = await readyReference(mock);
    const cases = [
      [{ request: '   ' }, 422, /1 to 500/],
      [{ request: 'a'.repeat(501) }, 422, /1 to 500/],
      [{ request: 'x', reference_id: 'nope', frame: '01.jpg' }, 422, /does not exist/],
      [{ request: 'x', reference_id: ref.id, frame: 'zz.jpg' }, 422, /not one of the frames/],
      [{ request: 'a busy one' }, 409, /run is active/],
      [{ request: 'nochrome' }, 503, /Chrome/],
      [{ request: 'noassistant' }, 503, /assistant/],
      [{ request: 'novision', reference_id: ref.id, frame: ref.analysis.frames[0] }, 503, /vision/],
    ];
    for (const [body, status, why] of cases) {
      const res = await mock.json('POST', D, body);
      assert.equal(res.status, status, JSON.stringify(body).slice(0, 60));
      assert.match((await res.json()).error.message, why);
    }
    const notImage = await askForm(mock, { request: 'x' }, { type: 'text/plain', name: 'a.txt' });
    assert.equal(notImage.status, 422);
    assert.match((await notImage.json()).error.message, /not a png, jpg or webp/);
    assert.equal((await askForm(mock, { request: 'x' }, { type: 'image/png', size: 20 * 1024 * 1024 + 1 })).status, 422);
    assert.deepEqual((await (await mock.json('GET', D)).json()).drafts, []);
  } finally {
    mock.stop();
  }
});

test('the age check fails a draft with a picture, and no retry is possible; the same words with no picture are written', async () => {
  const mock = await start();
  try {
    const ref = await readyReference(mock);
    const failed = await writtenDraft(mock, 'a minor with a clock', { reference_id: ref.id, frame: ref.analysis.frames[0] });
    fits(`${D}/{id}`, 'get', 200, failed);
    assert.equal(failed.state, 'failed');
    assert.match(failed.error, /minor/);
    const retry = await mock.json('POST', `${D}/${failed.id}/retry`);
    assert.equal(retry.status, 422);
    assert.match((await retry.json()).error.message, /age check/);
    assert.equal((await writtenDraft(mock, 'a minor with a clock')).state, 'ready');
  } finally {
    mock.stop();
  }
});

test('a failed draft is tried again: it is writing with one more attempt and ends ready; only a failed one can be', async () => {
  const mock = await start();
  try {
    const failed = await writtenDraft(mock, 'this will fail');
    assert.equal(failed.state, 'failed');
    assert.ok(failed.error);
    assert.ok(failed.problems.length);
    const res = await mock.json('POST', `${D}/${failed.id}/retry`);
    assert.equal(res.status, 202);
    const again = await res.json();
    fits(`${D}/{id}/retry`, 'post', 202, again);
    assert.deepEqual([again.state, again.attempts], ['writing', 2]);
    const ready = await until(async () => (await mock.json('GET', `${D}/${failed.id}`)).json(), (d) => d.state !== 'writing', 'ready');
    assert.equal(ready.state, 'ready');
    assert.equal((await mock.json('POST', `${D}/${failed.id}/retry`)).status, 422);
    assert.equal((await mock.json('POST', `${D}/nope/retry`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('the text of a draft is replaced when it passes the checks, and refused with the problems, one to a line, when it does not', async () => {
  const mock = await start();
  try {
    const ready = await writtenDraft(mock, 'a clock');
    const put = (manifest, fragment) => mock.json('PUT', `${D}/${ready.id}`, { manifest, fragment });
    const ok = await put(JSON.stringify({ name: 'my-clock', description: 'mine' }), '<div>new</div>');
    assert.equal(ok.status, 200);
    const saved = await ok.json();
    fits(`${D}/{id}`, 'put', 200, saved);
    assert.deepEqual([saved.name, saved.fragment], ['my-clock', '<div>new</div>']);

    const bad = await put('not json', '');
    assert.equal(bad.status, 422);
    assert.equal((await bad.json()).error.message.split('\n').length, 2);
    const transition = await put(saved.manifest, '<div style="transition: all 1s"></div>');
    assert.equal(transition.status, 422);
    assert.match((await transition.json()).error.message, /transitions/);
    const taken = await put(JSON.stringify({ name: 'toggle' }), '<div></div>');
    assert.equal(taken.status, 422);
    assert.match((await taken.json()).error.message, /already in the catalog/);
    const after = await (await mock.json('GET', `${D}/${ready.id}`)).json();
    assert.equal(after.fragment, '<div>new</div>');
    assert.equal((await mock.json('PUT', `${D}/nope`, { manifest: '{}', fragment: 'x' })).status, 404);
  } finally {
    mock.stop();
  }
});

test('a draft asked for with problems is refused once as written and accepted when it is changed; one being written cannot be saved', async () => {
  const mock = await start();
  try {
    const asked = await (await mock.json('POST', D, { request: 'this has problems' })).json();
    const early = await mock.json('PUT', `${D}/${asked.id}`, { manifest: '{"name":"x"}', fragment: 'x' });
    assert.equal(early.status, 409);
    const ready = await until(async () => (await mock.json('GET', `${D}/${asked.id}`)).json(), (d) => d.state !== 'writing', 'ready');
    const same = await mock.json('PUT', `${D}/${ready.id}`, { manifest: ready.manifest, fragment: ready.fragment });
    assert.equal(same.status, 422);
    assert.match((await same.json()).error.message, /draws nothing/);
    assert.equal((await mock.json('PUT', `${D}/${ready.id}`, { manifest: ready.manifest, fragment: '<div>moving</div>' })).status, 200);
  } finally {
    mock.stop();
  }
});

test('a ready draft is approved: the part is answered as the catalog lists it, joins the catalog, and the draft is gone; a script can use it', async () => {
  const mock = await start();
  try {
    const ready = await writtenDraft(mock, 'a ticking clock');
    const res = await mock.json('POST', `${D}/${ready.id}/approve`);
    assert.equal(res.status, 200);
    const part = await res.json();
    fits(`${D}/{id}/approve`, 'post', 200, part);
    assert.equal(part.name, ready.name);

    const catalog = await (await mock.json('GET', '/api/music-motion/catalog')).json();
    fits('/api/music-motion/catalog', 'get', 200, catalog);
    assert.ok(catalog.parts.some((p) => p.name === ready.name));
    assert.equal((await mock.json('GET', `${D}/${ready.id}`)).status, 404);

    const piece = await (await mock.json('POST', P, SONG)).json();
    const script = { ...piece.script, pieces: piece.script.pieces.map((p, i) => (i === 0 ? { ...p, part: ready.name, params: {} } : p)) };
    assert.equal((await mock.json('PUT', `${P}/${piece.id}/script`, script)).status, 200);
  } finally {
    mock.stop();
  }
});

test('approving is refused for a draft that is not ready or whose name is taken in the parts folder, and the draft stays', async () => {
  const mock = await start();
  try {
    const writing = await (await mock.json('POST', D, { request: 'a clock' })).json();
    assert.equal((await mock.json('POST', `${D}/${writing.id}/approve`)).status, 409);
    const failed = await writtenDraft(mock, 'this will fail');
    const notReady = await mock.json('POST', `${D}/${failed.id}/approve`);
    assert.equal(notReady.status, 422);
    assert.match((await notReady.json()).error.message, /not ready/);

    const first = await writtenDraft(mock, 'a clash of names');
    assert.equal((await mock.json('POST', `${D}/${first.id}/approve`)).status, 200);
    const second = await writtenDraft(mock, 'another clash of names');
    const taken = await mock.json('POST', `${D}/${second.id}/approve`);
    assert.equal(taken.status, 409);
    assert.match((await taken.json()).error.message, /already exists/);
    assert.equal((await mock.json('GET', `${D}/${second.id}`)).status, 200);
    assert.equal((await mock.json('POST', `${D}/nope/approve`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('a draft is deleted, and its preview frames are PNGs', async () => {
  const mock = await start();
  try {
    const ready = await writtenDraft(mock, 'a clock');
    const frame = await fetch(`${mock.base}${D}/${ready.id}/preview/${ready.preview[0]}`);
    assert.equal(frame.status, 200);
    assert.equal(frame.headers.get('content-type'), 'image/png');
    assert.ok((await frame.arrayBuffer()).byteLength > 0);
    assert.equal((await fetch(`${mock.base}${D}/${ready.id}/preview/99.png`)).status, 404);
    assert.equal((await mock.json('DELETE', `${D}/${ready.id}`)).status, 204);
    assert.equal((await mock.json('GET', `${D}/${ready.id}`)).status, 404);
    assert.equal((await mock.json('DELETE', `${D}/${ready.id}`)).status, 404);
  } finally {
    mock.stop();
  }
});

test('the mock starts with the animation dataset: songs, pieces in three states, ready references, styles and approved parts', async () => {
  const mock = await start([], { sample: true });
  try {
    const library = await (await mock.json('GET', '/api/library')).json();
    fits('/api/library', 'get', 200, library);
    assert.equal(library.songs.filter((s) => s.project === 'sample-beat').length, 2);
    assert.ok(library.songs.some((s) => s.project === 'neon-drive') && library.songs.some((s) => s.project === 'paper-boats'));
    const pieces = await (await mock.json('GET', P)).json();
    fits(P, 'get', 200, pieces);
    assert.equal(pieces.length, 14);
    const count = (state) => pieces.filter((p) => p.state === state).length;
    assert.deepEqual([count('done'), count('draft'), count('failed')], [9, 3, 2]);
    assert.ok(pieces.filter((p) => p.state === 'failed').every((p) => p.error));
    assert.ok(pieces.filter((p) => p.state === 'done').every((p) => p.video && p.size_bytes > 0));
    assert.equal(pieces[0].id, 'sample-piece'); // newest first
    const refs = (await (await mock.json('GET', '/api/music-motion/references')).json()).references;
    assert.equal(refs.length, 12);
    assert.ok(refs.every((r) => r.state === 'ready'));
    const presets = (await (await mock.json('GET', '/api/music-motion/presets')).json()).presets;
    assert.equal(presets.length, 4);
    assert.ok(presets.every((p) => refs.some((r) => r.id === p.reference_id)));
    const catalog = await (await mock.json('GET', '/api/music-motion/catalog')).json();
    assert.ok(['confetti-burst', 'ticker-tape', 'pulse-ring'].every((n) => catalog.parts.some((p) => p.name === n)));
    const one = await (await mock.json('GET', `${P}/sample-piece`)).json();
    fits(`${P}/{id}`, 'get', 200, one);
    assert.ok(one.script.pieces.length > 0);
  } finally {
    mock.stop();
  }
});

test('every finished piece of the dataset plays the sample video, and any other done piece plays the placeholder', async () => {
  const mock = await start([], { sample: true });
  try {
    const sampleBytes = readFileSync(resolve(here, '../libs/music-motion/sample/sample.mp4'));
    const pieces = await (await mock.json('GET', P)).json();
    for (const p of pieces.filter((x) => x.state === 'done')) {
      const got = Buffer.from(await (await fetch(mock.base + p.video)).arrayBuffer());
      assert.deepEqual(got, sampleBytes, p.id);
    }
    const other = Buffer.from(await (await fetch(mock.base + '/api/projects/api-mm-other/artifacts/out/api-mm-other.mp4')).arrayBuffer());
    assert.deepEqual(other, readFileSync(resolve(here, 'assets/placeholder.mp4')));
  } finally {
    mock.stop();
  }
});

test('the sample can be left out when the mock starts (MOCK_SAMPLE=off)', async () => {
  const mock = await start();
  try {
    assert.deepEqual(await (await mock.json('GET', P)).json(), []);
    const library = await (await mock.json('GET', '/api/library')).json();
    assert.ok(!library.songs.some((s) => s.project === 'sample-beat'));
  } finally {
    mock.stop();
  }
});

test('a piece keeps its prompt, which is refused above 2000 characters, and a proposal for both is written in the background', async () => {
  const mock = await start();
  try {
    const tooLong = await mock.json('POST', P, { ...SONG, prompt: 'x'.repeat(2001) });
    assert.equal(tooLong.status, 422);
    assert.match((await tooLong.json()).error.message, /prompt/);
    const made = await mock.json('POST', P, { ...SONG, prompt: 'a calm night' });
    assert.equal(made.status, 201);
    const piece = await made.json();
    fits(P, 'post', 201, piece);
    assert.equal(piece.prompt, 'a calm night');

    const asked = await mock.json('POST', `${P}/${piece.id}/propose`, { what: 'all', prompt: 'a long and calm night', model: 'qwen3:8b' });
    assert.equal(asked.status, 202);
    const started = await asked.json();
    fits(`${P}/{id}/propose`, 'post', 202, started);
    assert.equal(started.what, 'all');
    assert.equal(started.model, 'qwen3:8b');
    assert.ok(['waiting', 'writing'].includes(started.state));

    // While it is written the piece cannot be edited or asked again, as the server refuses (409).
    const edit = await mock.json('PUT', `${P}/${piece.id}/design`, piece.design.design);
    assert.equal(edit.status, 409);
    assert.match((await edit.json()).error.message, /proposal/);
    assert.equal((await mock.json('POST', `${P}/${piece.id}/propose`, { what: 'script' })).status, 409);

    const done = await until(async () => (await (await mock.json('GET', `${P}/${piece.id}`)).json()), (p) => p.proposal?.state === 'done', 'the proposal is done');
    fits(`${P}/{id}`, 'get', 200, done);
    assert.equal(done.prompt, 'a long and calm night');
    assert.equal(done.proposal.design_source, 'fallback');
    assert.match(done.proposal.script_fallback_reason, /does not read the prompt/);
    const again = await mock.json('PUT', `${P}/${piece.id}/design`, piece.design.design);
    assert.equal(again.status, 200, JSON.stringify(await again.clone().json()));
  } finally {
    mock.stop();
  }
});

test('a synchronous proposal names its model and says why the fixed rule wrote it; an uninstalled model is refused naming the installed ones', async () => {
  const mock = await start();
  try {
    const piece = await (await mock.json('POST', P, SONG)).json();
    const answer = await mock.json('POST', `${P}/${piece.id}/propose`, { what: 'design', model: 'gemma4:26b' });
    assert.equal(answer.status, 200);
    const body = await answer.json();
    fits(`${P}/{id}/propose`, 'post', 200, body);
    assert.equal(body.source, 'fallback');
    assert.equal(body.model, 'gemma4:26b');
    assert.match(body.fallback_reason, /fixed rule/);
    const unknown = await mock.json('POST', `${P}/${piece.id}/propose`, { what: 'script', model: 'nope:1b' });
    assert.equal(unknown.status, 422);
    assert.match((await unknown.json()).error.message, /qwen3:8b/);
    const models = await mock.json('GET', '/api/assist/models');
    assert.equal(models.status, 200);
    assert.equal((await models.json()).default, 'qwen3:8b');
  } finally {
    mock.stop();
  }
});

test('the editor sees a piece: preview without saving, a frame, and the drawings of the library', async () => {
  const mock = await start();
  try {
    const made = await (await mock.json('POST', P, { ...SONG })).json();
    const id = made.id;
    // The preview of the saved piece, with and without a body, fits the contract and saves nothing.
    const plain = await mock.json('POST', `${P}/${id}/preview`);
    assert.equal(plain.status, 200);
    const pages = await plain.json();
    fits('/api/music-motion/pieces/{id}/preview', 'post', 200, pages);
    assert.equal(pages.scenes.length, made.script.pieces.length);
    assert.match(pages.scenes[0].html, /seek/);
    const only = await (await mock.json('POST', `${P}/${id}/preview?scenes=${made.script.pieces[1].id}`)).json();
    assert.equal(only.scenes.length, 1);
    assert.equal((await mock.json('POST', `${P}/${id}/preview?scenes=nope`)).status, 422);
    // A script of the body replaces the saved one for the call only; an invalid one is a 422 with the piece named.
    const bad = { version: 1, pieces: [{ ...made.script.pieces[0], part: 'no-such-part' }] };
    const refused = await mock.json('POST', `${P}/${id}/preview`, { script: bad });
    assert.equal(refused.status, 422);
    assert.match((await refused.json()).error.message, /piece p1/);
    const after = await (await mock.json('GET', `${P}/${id}`)).json();
    assert.deepEqual(after.script, made.script);
    assert.equal((await mock.json('POST', `${P}/nope/preview`)).status, 404);
    // The frame is a PNG; a t that is not a number or is outside the piece is a 422.
    const frame = await fetch(`${mock.base}${P}/${id}/frame?t=1.5`);
    assert.equal(frame.status, 200);
    assert.equal(frame.headers.get('content-type'), 'image/png');
    assert.equal((await mock.json('GET', `${P}/${id}/frame?t=abc`)).status, 422);
    assert.equal((await mock.json('GET', `${P}/${id}/frame`)).status, 422);
    assert.equal((await mock.json('GET', `${P}/${id}/frame?t=99999`)).status, 422);
    // The drawings of the library.
    const bot = await (await mock.json('GET', '/api/music-motion/library/characters/bot')).json();
    fits('/api/music-motion/library/characters/{name}', 'get', 200, bot);
    assert.ok(bot.poses[bot.default_pose]);
    const stage = await (await mock.json('GET', '/api/music-motion/library/backgrounds/stage')).json();
    fits('/api/music-motion/library/backgrounds/{name}', 'get', 200, stage);
    assert.equal((await mock.json('GET', '/api/music-motion/library/characters/nope')).status, 404);
    assert.equal((await mock.json('GET', '/api/music-motion/library/backgrounds/..%2Fx')).status, 404);
  } finally {
    mock.stop();
  }
});

// ---------------------------------------------------------------- parts of the user's: from a text, replace, delete

const PART = (name, extra = {}) => ({ manifest: JSON.stringify({ name, description: 'A bar', params: [], ...extra }), fragment: `<div class="${name}"></div>` });
const approved = async (mock, name) => {
  const draft = await (await mock.json('POST', D, PART(name))).json();
  assert.equal((await mock.json('POST', `${D}/${draft.id}/approve`)).status, 200);
};

test('a draft is made from a manifest and a fragment with no assistant: it is answered ready at once with its text, and it is approved like any', async () => {
  const mock = await start();
  try {
    const res = await mock.json('POST', D, PART('bars'));
    assert.equal(res.status, 200);
    const draft = await res.json();
    fits(D, 'post', 200, draft);
    assert.deepEqual([draft.state, draft.name, draft.problems], ['ready', 'bars', []]);
    assert.equal(JSON.parse(draft.manifest).name, 'bars');
    const approvedPart = await mock.json('POST', `${D}/${draft.id}/approve`);
    assert.equal(approvedPart.status, 200);
    const back = await (await mock.json('GET', '/api/music-motion/parts/bars')).json();
    fits('/api/music-motion/parts/{name}', 'get', 200, back);
    assert.equal(back.manifest.name, 'bars');
  } finally {
    mock.stop();
  }
});

test('a text that does not pass makes a failed draft with its problems and both files, and saving a fixed text makes it ready; a request with it, or half of it, is refused', async () => {
  const mock = await start();
  try {
    const bad = await (await mock.json('POST', D, { manifest: 'not json', fragment: '' })).json();
    fits(D, 'post', 200, bad);
    assert.equal(bad.state, 'failed');
    assert.ok(bad.problems.length >= 2);
    assert.equal(bad.manifest, 'not json');
    const fixed = await mock.json('PUT', `${D}/${bad.id}`, PART('fixed'));
    assert.equal(fixed.status, 200);
    assert.equal((await fixed.json()).state, 'ready');

    assert.equal((await mock.json('POST', D, { request: 'a clock', ...PART('both'), frame: '01.jpg', reference_id: 'x' })).status, 400);
    const half = await (await mock.json('POST', D, { manifest: JSON.stringify({ name: 'half' }) })).json();
    assert.deepEqual([half.state, half.problems], ['failed', ['part.html: it is empty']]);
    assert.equal((await mock.json('POST', D, PART('toggle'))).status, 200);
    const clash = await (await mock.json('POST', D, PART('toggle'))).json();
    assert.equal(clash.state, 'failed');
    assert.match(clash.problems.join('\n'), /already in the catalog/);
    assert.equal((await mock.json('POST', D, PART('nochrome-bar'))).status, 503);
  } finally {
    mock.stop();
  }
});

test('an approved part is replaced: the text is the new one, the catalog lists it, and a text with problems or another name changes nothing', async () => {
  const mock = await start();
  try {
    await approved(mock, 'bars');
    const res = await mock.json('PUT', '/api/music-motion/parts/bars', { ...PART('bars', { description: 'Better bars' }), fragment: '<div class="bars">v2</div>' });
    assert.equal(res.status, 200);
    const part = await res.json();
    fits('/api/music-motion/parts/{name}', 'put', 200, part);
    assert.equal(part.description, 'Better bars');
    const back = await (await mock.json('GET', '/api/music-motion/parts/bars')).json();
    assert.match(back.fragment, /v2/);
    const catalog = await (await mock.json('GET', '/api/music-motion/catalog')).json();
    assert.equal(catalog.parts.find((p) => p.name === 'bars').description, 'Better bars');

    const renamed = await mock.json('PUT', '/api/music-motion/parts/bars', PART('other'));
    assert.equal(renamed.status, 422);
    assert.match((await renamed.json()).error.message, /must stay "bars"/);
    const broken = await mock.json('PUT', '/api/music-motion/parts/bars', { manifest: '{}', fragment: '' });
    assert.equal(broken.status, 422);
    assert.match((await (await mock.json('GET', '/api/music-motion/parts/bars')).json()).fragment, /v2/);

    assert.equal((await mock.json('PUT', '/api/music-motion/parts/bars', PART('bars', { description: 'nochrome' }))).status, 503);
    assert.equal((await mock.json('PUT', '/api/music-motion/parts/toggle', PART('toggle'))).status, 409);
    assert.equal((await mock.json('PUT', '/api/music-motion/parts/no-such-part', PART('no-such-part'))).status, 404);
  } finally {
    mock.stop();
  }
});

test('an approved part is deleted; one that a piece uses is refused naming it unless forced; a part that comes with the program is never deleted', async () => {
  const mock = await start();
  try {
    await approved(mock, 'bars');
    await approved(mock, 'dots');
    const piece = await (await mock.json('POST', P, SONG)).json();
    const script = { ...piece.script, pieces: piece.script.pieces.map((p, i) => (i === 0 ? { ...p, part: 'bars', params: {} } : p)) };
    assert.equal((await mock.json('PUT', `${P}/${piece.id}/script`, script)).status, 200);

    const refused = await mock.json('DELETE', '/api/music-motion/parts/bars');
    assert.equal(refused.status, 409);
    assert.match((await refused.json()).error.message, new RegExp(`piece ${piece.id}`));
    assert.equal((await mock.json('GET', '/api/music-motion/parts/bars')).status, 200);
    assert.equal((await mock.json('DELETE', '/api/music-motion/parts/bars?force=true')).status, 204);
    assert.equal((await mock.json('GET', '/api/music-motion/parts/bars')).status, 404);
    const catalog = await (await mock.json('GET', '/api/music-motion/catalog')).json();
    assert.ok(!catalog.parts.some((p) => p.name === 'bars'));

    assert.equal((await mock.json('DELETE', '/api/music-motion/parts/dots')).status, 204);
    assert.equal((await mock.json('DELETE', '/api/music-motion/parts/dots')).status, 404);
    assert.equal((await mock.json('DELETE', '/api/music-motion/parts/toggle')).status, 409);
  } finally {
    mock.stop();
  }
});

test('a part of the sample can be replaced and deleted like any, and a deleted one is not read back', async () => {
  const mock = await start([], { sample: true });
  try {
    const own = await (await mock.json('GET', '/api/music-motion/parts/pulse-ring')).json();
    const res = await mock.json('PUT', '/api/music-motion/parts/pulse-ring', { manifest: JSON.stringify({ ...own.manifest, description: 'Changed' }), fragment: own.fragment });
    assert.equal(res.status, 200);
    assert.equal((await mock.json('DELETE', '/api/music-motion/parts/pulse-ring?force=true')).status, 204);
    assert.equal((await mock.json('GET', '/api/music-motion/parts/pulse-ring')).status, 404);
  } finally {
    mock.stop();
  }
});

test('a request together with a text changes that text: a draft is written that keeps the name, says what it replaces, and ends ready with a different text; a text without a name is refused', async () => {
  const mock = await start();
  try {
    const base = PART('bars');
    const res = await mock.json('POST', D, { request: 'make the bars blue', ...base });
    assert.equal(res.status, 202);
    const asked = await res.json();
    fits(D, 'post', 202, asked);
    assert.deepEqual([asked.state, asked.replaces], ['writing', 'bars']);
    const done = await until(async () => (await mock.json('GET', `${D}/${asked.id}`)).json(), (d) => d.state !== 'writing', 'the rewrite is written');
    assert.equal(done.state, 'ready');
    assert.equal(done.replaces, 'bars');
    assert.equal(JSON.parse(done.manifest).name, 'bars');
    assert.notEqual(done.fragment, base.fragment);
    assert.match(done.manifest, /make the bars blue/);

    assert.equal((await mock.json('POST', D, { request: 'blue', manifest: '{}', fragment: '<p></p>' })).status, 422);
    assert.equal((await mock.json('POST', D, { request: 'blue', manifest: base.manifest })).status, 422);
    assert.equal((await mock.json('POST', D, { request: 'blue', ...base, frame: '01.jpg', reference_id: 'r' })).status, 400);
    assert.equal((await mock.json('POST', D, { request: 'busy one', ...base })).status, 409);
  } finally {
    mock.stop();
  }
});

test('the mock draws an SVG from a description and refuses like the server: the answer fits the contract, the catalog says so', async () => {
  const mock = await start();
  try {
    const catalog = await (await mock.json('GET', '/api/music-motion/catalog')).json();
    fits('/api/music-motion/catalog', 'get', 200, catalog);
    assert.ok(catalog.features.includes('svg'));
    const SVG = '/api/assist/svg';
    const circle = await mock.json('POST', SVG, { text: 'a green circle', model: 'qwen3:8b' });
    assert.equal(circle.status, 200);
    const body = await circle.json();
    fits(SVG, 'post', 200, body);
    assert.match(body.svg, /^<svg [^>]*viewBox/);
    assert.match(body.svg, /id="ring"/);
    assert.equal(body.model, 'qwen3:8b');
    assert.match((await (await mock.json('POST', SVG, { text: 'some bars' })).json()).svg, /id="bar-1"/);
    assert.match((await (await mock.json('POST', SVG, { text: 'anything else' })).json()).svg, /id="square"/);
    for (const [text, status, code] of [['  ', 400, 'invalid_request'], ['a'.repeat(2001), 400, 'invalid_request'], ['please refuse', 422, 'assist_refused'], ['notsvg', 422, 'validation_failed'], ['noassistant', 503, 'unavailable']]) {
      const res = await mock.json('POST', SVG, { text });
      assert.equal(res.status, status, text);
      assert.equal((await res.json()).error.code, code);
    }
    assert.equal((await mock.json('POST', SVG, { text: 'a circle', model: 'nope:1b' })).status, 503);
  } finally {
    mock.stop();
  }
});

test('a part draft takes the model that writes it: an installed one is kept, one that is not is refused and nothing is made', async () => {
  const mock = await start();
  try {
    const D = '/api/music-motion/part-drafts';
    const made = await mock.json('POST', D, { request: 'a coral dot', model: 'gemma4:26b' });
    assert.equal(made.status, 202);
    const body = await made.json();
    fits(D, 'post', 202, body);
    assert.equal(body.model, 'gemma4:26b');
    const none = await (await mock.json('POST', D, { request: 'another dot' })).json();
    assert.equal(none.model, undefined);
    const before = (await (await mock.json('GET', D)).json()).drafts.length;
    const refused = await mock.json('POST', D, { request: 'a dot', model: 'nope:1b' });
    assert.equal(refused.status, 422);
    const message = (await refused.json()).error.message;
    assert.match(message, /nope:1b/);
    assert.match(message, /qwen3:8b/);
    assert.equal((await (await mock.json('GET', D)).json()).drafts.length, before);
  } finally {
    mock.stop();
  }
});

// ---------------------------------------------------------------- scenes, reviews and the theme

async function madePiece(mock) {
  const made = await (await mock.json('POST', P, { ...SONG, style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720' })).json();
  return made;
}

test('the catalog says what a server with scenes, theme and review lists, and keeps the scene parts out unless they are asked for', async () => {
  const mock = await start();
  try {
    const body = await (await mock.json('GET', '/api/music-motion/catalog')).json();
    fits('/api/music-motion/catalog', 'get', 200, body);
    for (const f of ['scene', 'theme', 'review']) assert.ok(body.features.includes(f), f);
    assert.ok(body.parts.some((p) => p.name === 'hud-chrome' && p.manual) && body.parts.some((p) => p.name === 'grain'));
    assert.equal(body.font_files.Inter.licence, 'OFL-1.1');
  } finally {
    mock.stop();
  }
});

test('a scene draft is asked with `scene` and no request, is written for its script piece, and becomes a part kept out of the catalog until its piece is asked for', async () => {
  const mock = await start();
  try {
    const piece = await madePiece(mock);
    const sp = piece.script.pieces[0];
    const asked = await mock.json('POST', '/api/music-motion/part-drafts', { scene: { piece: piece.id, script_piece: sp.id, brief: 'a street lamp' }, review: { min: 6, attempts: 3 } });
    assert.equal(asked.status, 202);
    const draft = await asked.json();
    fits('/api/music-motion/part-drafts', 'post', 202, draft);
    assert.deepEqual(draft.scene, { piece: piece.id, script_piece: sp.id });
    assert.equal(draft.brief, 'a street lamp');
    assert.deepEqual(draft.review_ask, { min: 6, attempts: 3 });
    const ready = await until(async () => (await (await mock.json('GET', `/api/music-motion/part-drafts/${draft.id}`)).json()), (d) => d.state === 'ready', 'the scene is written');
    fits('/api/music-motion/part-drafts/{id}', 'get', 200, ready);
    assert.ok(ready.review.score >= 3);
    assert.ok(ready.name.length <= 32);
    assert.equal(JSON.parse(ready.manifest).verse, 'own');
    const approved = await (await mock.json('POST', `/api/music-motion/part-drafts/${draft.id}/approve`)).json();
    assert.deepEqual(approved.scene, { piece: piece.id, script_piece: sp.id });
    const plain = await (await mock.json('GET', '/api/music-motion/catalog')).json();
    assert.ok(!plain.parts.some((p) => p.name === approved.name));
    const withPiece = await (await mock.json('GET', `/api/music-motion/catalog?piece=${piece.id}`)).json();
    assert.ok(withPiece.parts.some((p) => p.name === approved.name));
    const all = await (await mock.json('GET', '/api/music-motion/catalog?include=scene')).json();
    assert.ok(all.parts.some((p) => p.name === approved.name));
  } finally {
    mock.stop();
  }
});

test('a scene is refused with a picture, a text or an unknown piece, and a request with no scene still needs its request', async () => {
  const mock = await start();
  try {
    const piece = await madePiece(mock);
    const sp = piece.script.pieces[0].id;
    assert.equal((await mock.json('POST', '/api/music-motion/part-drafts', { scene: { piece: piece.id, script_piece: sp }, frame: '01.png', reference_id: 'r' })).status, 422);
    assert.equal((await mock.json('POST', '/api/music-motion/part-drafts', { scene: { piece: 'nope', script_piece: sp } })).status, 404);
    assert.equal((await mock.json('POST', '/api/music-motion/part-drafts', { scene: { piece: piece.id, script_piece: 'nope' } })).status, 404);
    assert.equal((await mock.json('POST', '/api/music-motion/part-drafts', { scene: { piece: piece.id, script_piece: sp, brief: 'x'.repeat(501) } })).status, 422);
    assert.equal((await mock.json('POST', '/api/music-motion/part-drafts', {})).status, 422);
  } finally {
    mock.stop();
  }
});

test('a batch writes a draft per script piece, can be stopped, and is approved all at once with the script saved', async () => {
  const mock = await start();
  try {
    const piece = await madePiece(mock);
    const started = await mock.json('POST', `${P}/${piece.id}/scenes`, { brief_mode: 'literal', review: true });
    assert.equal(started.status, 202);
    const batch = await started.json();
    fits(`${P}/{id}/scenes`, 'post', 202, batch);
    assert.equal(batch.total, piece.script.pieces.length);
    assert.equal((await mock.json('POST', `${P}/${piece.id}/scenes`, {})).status, 409);
    assert.equal((await mock.json('POST', `${P}/${piece.id}/scenes/approve`)).status, 409);
    const done = await until(async () => (await (await mock.json('GET', `${P}/${piece.id}`)).json()).scenes, (b) => b.state === 'done', 'the batch ends');
    assert.equal(done.done, done.total);
    assert.ok(done.drafts.every((d) => d.state === 'ready' && d.draft_id));
    const answer = await (await mock.json('POST', `${P}/${piece.id}/scenes/approve`)).json();
    fits(`${P}/{id}/scenes/approve`, 'post', 200, answer);
    assert.equal(answer.approved.length, done.total);
    assert.deepEqual(answer.not_approved, []);
    const after = await (await mock.json('GET', `${P}/${piece.id}`)).json();
    assert.ok(after.script.pieces.every((x) => answer.approved.some((a) => a.script_piece === x.id && a.part === x.part)));
    assert.ok(after.scenes.drafts.every((d) => d.state === 'approved'));
  } finally {
    mock.stop();
  }
});

test('a batch is stopped after the draft it is writing, a script piece that is not there is a 404 and a piece with no batch has nothing to stop', async () => {
  const mock = await start();
  try {
    const piece = await madePiece(mock);
    assert.equal((await mock.json('DELETE', `${P}/${piece.id}/scenes`)).status, 404);
    assert.equal((await mock.json('POST', `${P}/${piece.id}/scenes`, { script_pieces: ['nope'] })).status, 404);
    await mock.json('POST', `${P}/${piece.id}/scenes`, {});
    const stopped = await mock.json('DELETE', `${P}/${piece.id}/scenes`);
    assert.equal(stopped.status, 202);
    fits(`${P}/{id}/scenes`, 'delete', 202, await stopped.json());
    const end = await until(async () => (await (await mock.json('GET', `${P}/${piece.id}`)).json()).scenes, (b) => b.state === 'cancelled', 'the batch is cancelled');
    assert.ok(end.done < end.total || end.total === 1);
  } finally {
    mock.stop();
  }
});

test('the review of a piece runs and then scores each script piece, with an overall judgement', async () => {
  const mock = await start();
  try {
    const piece = await madePiece(mock);
    const started = await mock.json('POST', `${P}/${piece.id}/review`);
    assert.equal(started.status, 202);
    fits(`${P}/{id}/review`, 'post', 202, await started.json());
    assert.equal((await mock.json('POST', `${P}/${piece.id}/review`)).status, 409);
    const review = await until(async () => (await (await mock.json('GET', `${P}/${piece.id}`)).json()).review, (r) => r.state === 'done', 'the review ends');
    assert.deepEqual(review.scenes.map((s) => s.script_piece), piece.script.pieces.map((s) => s.id));
    assert.ok(review.scenes.every((s) => ['pass', 'weak', 'fail'].includes(s.verdict)));
    assert.ok(review.overall.notes.length);
    const full = await (await mock.json('GET', `${P}/${piece.id}`)).json();
    fits(`${P}/{id}`, 'get', 200, full);
  } finally {
    mock.stop();
  }
});

test('a design keeps its theme and crossfade, and the server says why it refuses one, at the field', async () => {
  const mock = await start();
  try {
    const piece = await madePiece(mock);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const put = (patch) => mock.json('PUT', `${P}/${piece.id}/design`, { ...piece.design.design, ...patch });
    const ok = await put({ transition_seconds: 0.3, theme: { css: '#verse{}', assets: { mascot: svg }, hud: { tl: 'LIVE' } } });
    assert.equal(ok.status, 200);
    fits(`${P}/{id}/design`, 'put', 200, await ok.json());
    for (const [patch, at] of [
      [{ theme: { css: '@import url(x);' } }, 'design.theme.css'],
      [{ theme: { css: 'a{background:url(http://x/y)}' } }, 'design.theme.css'],
      [{ theme: { assets: { Bad: svg } } }, 'design.theme.assets.Bad'],
      [{ theme: { assets: { m: '<svg><script>1</script></svg>' } } }, 'design.theme.assets.m'],
      [{ theme: { hud: { tl: 'x'.repeat(41) } } }, 'design.theme.hud.tl'],
      [{ transition_seconds: 3 }, 'design.transition_seconds'],
    ]) {
      const res = await put(patch);
      assert.equal(res.status, 422, at);
      assert.ok((await res.json()).error.message.startsWith(at), at);
    }
    assert.equal((await (await mock.json('GET', `${P}/${piece.id}`)).json()).design.design.theme.hud.tl, 'LIVE');
  } finally {
    mock.stop();
  }
});

test('the setting that grades every draft is read and saved', async () => {
  const mock = await start();
  try {
    const before = await (await mock.json('GET', '/api/settings')).json();
    assert.equal(before.music_motion.review_drafts, false);
    const saved = await (await mock.json('PUT', '/api/settings', { music_motion: { review_drafts: true } })).json();
    assert.equal(saved.music_motion.review_drafts, true);
    assert.equal((await (await mock.json('GET', '/api/settings')).json()).music_motion.review_drafts, true);
  } finally {
    mock.stop();
  }
});
