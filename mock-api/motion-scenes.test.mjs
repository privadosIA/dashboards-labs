// The scene fields of the parts of the catalog and `defaults.motion` in the mock: a project is saved with them, and refused with
// the server's kind of reason (naming the scene, the part and the parameter) when they are wrong, leaving the saved one as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionChoice, motionConfigProblem } from './motion-scenes.mjs';

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
  const json = (method, path, body) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { base, json, stop: () => child.kill() };
}

const project = (scenes, motion) => ({ project: 'demo', output: { mode: 'video', file: 'out/demo.mp4' }, defaults: motion ? { motion } : {}, scenes });
const scene = (extra) => ({ id: 'intro', ...extra });
const problem = (scenes, motion) => motionConfigProblem(project(scenes, motion));

test('a scene with a named part and parameters inside its limits, a short text and a tempo in range is fine', () => {
  assert.equal(problem([scene({ motion_part: 'counter', motion_params: { to: 10, speed: 2 }, motion_text: 'hola', motion_bpm: 90 })]), '');
  assert.equal(problem([scene({ motion_part: 'auto', motion_graphic: 'tres ideas' })]), '');
  assert.equal(problem([scene({ prompt: 'una ciudad' })]), '');
});

test('what is wrong with a part names the scene, the part and the parameter', () => {
  const cases = [
    [{ motion_part: 'nope' }, /scene "intro".*"nope" is not in the catalog/],
    [{ motion_part: 'counter', motion_params: { zzz: 1 } }, /part counter has no parameter "zzz"/],
    [{ motion_part: 'counter', motion_params: { to: 5000 } }, /parameter to of counter is outside 1 to 999/],
    [{ motion_part: 'counter', motion_params: { to: 1.5 } }, /parameter to of counter must be a whole number/],
    [{ motion_part: 'toggle', motion_params: { on: 'yes' } }, /parameter on of toggle must be true or false/],
    [{ motion_part: 'parallax-cards', motion_params: { align: 'up' } }, /must be one of left, center, right/],
    [{ motion_part: 'toggle', motion_params: { label: 'a'.repeat(21) } }, /longer than 20 characters/],
    [{ motion_part: 'counter', motion_graphic: 'x' }, /needs no motion_graphic/],
    [{ motion_part: 'auto', motion_graphic: '  ' }, /auto needs motion_graphic/],
    [{ motion_part: 'auto', motion_graphic: 'x', motion_params: { to: 1 } }, /do not go with motion_part auto/],
    [{ motion_part: 'counter', motion_text: 'a'.repeat(121) }, /motion_text must be a text of up to 120/],
    [{ motion_part: 'counter', motion_bpm: 39 }, /motion_bpm must be from 40 to 240/],
    [{ motion_part: 'counter', motion_bpm: 241 }, /motion_bpm must be from 40 to 240/],
  ];
  for (const [extra, pattern] of cases) assert.match(problem([scene(extra)]), pattern, JSON.stringify(extra));
});

test('a part cannot be combined with the scene\'s own picture, clip, starting picture, animation, motion prompt or render', () => {
  for (const extra of [{ image: 'a.png' }, { clip: 'a.mp4' }, { init_image: 'b.png' }, { animate: true }, { motion_prompt: 'x' }, { animation: { frames: 33 } }, { render: { steps: 5 } }]) {
    assert.match(problem([scene({ motion_part: 'counter', ...extra })]), /cannot be combined with/, JSON.stringify(extra));
  }
  assert.equal(problem([scene({ motion_part: 'counter', animate: false })]), '');
});

test('the parameters, the text and the tempo need a part', () => {
  for (const extra of [{ motion_params: { to: 1 } }, { motion_text: 'x' }, { motion_bpm: 100 }]) assert.match(problem([scene(extra)]), /need motion_part/);
});

test('defaults.motion is judged: the tempo, the song, the design as a whole and its colours', () => {
  assert.equal(problem([], { bpm: 100, song: 'theme.mp3', design: { accent: '#00ff88', verse_style: 'glow' } }), '');
  assert.match(problem([], { bpm: 300 }), /defaults.motion.bpm must be from 40 to 240/);
  assert.match(problem([], { song: 'theme.flac' }), /defaults.motion.song/);
  assert.match(problem([], { design: { accent: 'red' } }), /defaults.motion.design: accent is not a hexadecimal colour/);
  assert.match(problem([], { design: { accent: '#101018' } }), /defaults.motion.design: accent .* 3:1/);
  assert.match(problem([], { design: { verse_style: 'neon' } }), /defaults.motion.design: verse_style/);
});

test('the mock saves a project with these fields as the text it was given, and refuses a wrong one leaving the saved one', async () => {
  const mock = await start();
  try {
    const yaml = (extra) => `project: demo\noutput:\n  mode: video\n  file: out/demo.mp4\ndefaults:\n  motion:\n    bpm: 100\nscenes:\n  - id: intro\n    motion_part: counter\n    motion_params:\n      to: 5\n${extra}`;
    const ok = await mock.json('PUT', '/api/projects/demo/config', { yaml: yaml('') });
    assert.equal(ok.status, 200);
    const read = await (await mock.json('GET', '/api/projects/demo/config')).json();
    assert.equal(read.parsed.scenes[0].motion_part, 'counter');
    assert.equal(read.parsed.defaults.motion.bpm, 100);

    const bad = await mock.json('PUT', '/api/projects/demo/config', { yaml: yaml('      zzz: 1\n') });
    assert.equal(bad.status, 422);
    assert.match((await bad.json()).error.message, /part counter has no parameter "zzz"/);
    const after = await (await mock.json('GET', '/api/projects/demo/config')).json();
    assert.deepEqual(after.parsed.scenes[0].motion_params, { to: 5 });
  } finally {
    mock.stop();
  }
});

test('the record of what the model chose exists for an auto scene once a run has ended, and for no other', () => {
  const auto = project([scene({ motion_part: 'auto', motion_graphic: 'tres ideas' }), { id: 'two', prompt: 'x' }]);
  const chosen = motionChoice(auto, 'intro');
  assert.equal(typeof chosen.part, 'string');
  assert.equal(typeof chosen.params, 'object');
  assert.equal(motionChoice(auto, 'two'), null);
  assert.equal(motionChoice(auto, 'nope'), null);
});
