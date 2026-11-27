// The advice about where the verse is read, as the mock simulates it, checked against the contract: `verse_notes` about pieces (the bands of their part) and about items (a bright clip),
// the parts' `bands`, the feature, and the preview's `local_scrims`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import { closeObjects } from './strict.mjs';
import { startMock } from './testkit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spec = closeObjects(yaml.load(readFileSync(process.env.SPEC ?? resolve(here, '../contract/openapi.yaml'), 'utf8')));
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
const deref = (s) => {
  for (let i = 0; s?.$ref && i < 20; i++) s = s.$ref.replace('#/', '').split('/').reduce((o, k) => o?.[k], spec);
  return s;
};
const fits = (path, method, status, body) => {
  const schema = deref(spec.paths[path][method].responses[String(status)])?.content?.['application/json']?.schema;
  assert.ok(schema, `${method} ${path} has no JSON ${status} response in the contract`);
  const validate = ajv.compile({ ...schema, components: spec.components });
  assert.ok(validate(body), `${method.toUpperCase()} ${path} ${status}: ${ajv.errorsText(validate.errors, { dataVar: '' })}`);
};
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const P = '/api/music-motion/pieces';
const SONG = { project: 'demo-musica', track_id: 'track-1', variant: 0 };
/** An MP4 as far as the mock can tell: `ftyp` at the fourth byte. */
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
const upload = (mock, id, name, body = MP4, query = '') => fetch(`${mock.base}${P}/${id}/backgrounds/${name}${query}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body });

async function open(env = {}) {
  const mock = await startMock({ env: { MOCK_SAMPLE: 'off', ...env }, args: ['--speed', '200'] });
  const made = await mock.json('POST', P, SONG);
  return { mock, id: made.body.id, piece: made.body };
}

/** A piece whose first script piece draws `part` with its lines, and the clip `name` kept (4 s). */
async function setup(part = 'toggle', clip = 'sky.mp4') {
  const o = await open();
  assert.equal((await upload(o.mock, o.id, clip)).status, 201);
  const pieces = o.piece.script.pieces.map((p, i) => (i === 0 ? { ...p, part, params: {}, with: [] } : { ...p, part: 'blank', params: {}, with: [] }));
  const put = (extra = {}, over = pieces) => o.mock.json('PUT', `${P}/${o.id}/script`, { ...o.piece.script, pieces: over, ...extra });
  return { ...o, pieces, put, first: pieces[0] };
}

test('the catalog lists verse-legibility and the bands of the parts it measured, and none for a part that fills the frame', async () => {
  const { mock } = await open();
  try {
    const catalog = (await mock.json('GET', '/api/music-motion/catalog')).body;
    assert.ok(catalog.features.includes('verse-legibility'));
    assert.deepEqual(catalog.parts.find((p) => p.name === 'toggle').bands, { top: 0.05, center: 0.1, bottom: 0.7 });
    assert.equal('bands' in catalog.parts.find((p) => p.name === 'sunburst'), false);
  } finally {
    mock.stop();
  }
});

test('a verse on a band its part paints is a note about the piece, with the clear band, on the piece and on the answer of the script', async () => {
  const { mock, id, put, first } = await setup('toggle');
  try {
    const saved = await put();
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    fits(`${P}/{id}/script`, 'put', 200, saved.body);
    assert.deepEqual(saved.body.verse_notes, [{ piece: first.id, part: 'toggle', band: 'bottom', share: 0.7, free: 'top' }]);
    const piece = await mock.json('GET', `${P}/${id}`);
    fits(`${P}/{id}`, 'get', 200, piece.body);
    assert.deepEqual(piece.body.verse_notes, saved.body.verse_notes);
  } finally {
    mock.stop();
  }
});

test('moving the verse to a clear band takes the note away, and the design\'s own layout counts when the piece has none', async () => {
  const { mock, id, put, pieces, first } = await setup('toggle');
  try {
    const moved = await put({}, pieces.map((p) => (p.id === first.id ? { ...p, design: { verse_layout: { position: 'top' } } } : p)));
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual(moved.body.verse_notes, []);
    await put();
    const design = (await mock.json('GET', `${P}/${id}`)).body.design.design;
    assert.equal((await mock.json('PUT', `${P}/${id}/design`, { ...design, verse_layout: { position: 'top' } })).status, 200);
    assert.deepEqual((await mock.json('GET', `${P}/${id}`)).body.verse_notes, []);
  } finally {
    mock.stop();
  }
});

test('a part nobody measured, one that fills the frame and one that draws nothing give no note', async () => {
  for (const part of ['sunburst', 'blank']) {
    const { mock, put } = await setup(part);
    try {
      const saved = await put();
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.deepEqual(saved.body.verse_notes, [], part);
    } finally {
      mock.stop();
    }
  }
});

test('a bright clip under a verse is a note about the item and a local scrim in the preview; a quiet one is neither', async () => {
  const bright = await setup('counter', 'bright-sky.mp4');
  try {
    const first = bright.first;
    const saved = await bright.put({ video: [{ id: 'v1', clip: 'bright-sky.mp4', start: first.start, end: first.end }] });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.ok(saved.body.verse_notes.some((n) => n.item === 'v1' && n.band === 'bottom' && n.contrast === 2.1), JSON.stringify(saved.body.verse_notes));
    fits(`${P}/{id}`, 'get', 200, (await bright.mock.json('GET', `${P}/${bright.id}`)).body);
    const preview = await bright.mock.json('POST', `${P}/${bright.id}/preview`, {});
    fits(`${P}/{id}/preview`, 'post', 200, preview.body);
    assert.deepEqual(preview.body.video[0].local_scrims, [{ band: 'bottom', scrim: 0.5 }]);
    assert.equal(preview.body.video[0].scrim, 0.3, 'the global scrim stays as it was');
  } finally {
    bright.mock.stop();
  }
  const quiet = await setup('counter', 'sky.mp4');
  try {
    const first = quiet.first;
    const saved = await quiet.put({ video: [{ id: 'v1', clip: 'sky.mp4', start: first.start, end: first.end }] });
    assert.equal(saved.body.verse_notes.some((n) => 'item' in n), false);
    const preview = await quiet.mock.json('POST', `${P}/${quiet.id}/preview`, {});
    assert.equal('local_scrims' in preview.body.video[0], false);
  } finally {
    quiet.mock.stop();
  }
});
