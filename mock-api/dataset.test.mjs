// The mock's reading of a dataset (the preview of the import): what the studios and the full see against it while the real server is not there.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readDataset } from './fixtures.mjs';

const row = (id, full) => [id, `Title ${id}`, '', full];
const songs = JSON.stringify([
  row('1', 'Synthpop de los 80, sintetizadores\nLyrics: Luces de neón\nLanguage: es\nBPM: 118'),
  row('2', 'Ambient suave con piano'),
  row('3', ''),
]);

test('reads a list of tuples as the tracks of a music project: the description is the prompt and the markers are mapped', () => {
  const r = readDataset(songs, 'music');
  assert.equal(r.entries.length, 3);
  assert.equal(r.imported, 2);
  assert.equal(r.rejected, 1);
  assert.equal(r.instrumental, 1);
  assert.equal(r.silent, 0);
  assert.match(r.yaml, /mode: music/);
  assert.match(r.yaml, /prompt: Synthpop de los 80, sintetizadores/);
  assert.match(r.yaml, /lyrics: Luces de neón/);
  assert.match(r.report, /mapped: bpm ← 118/);
  assert.deepEqual(r.entries[0].mapped.slice(0, 1), ['prompt ← 34 chars']);
});

test('reads the same list as scenes for a video, where the entries without dialogue are silent', () => {
  const r = readDataset(songs, 'video');
  assert.equal(r.silent, 2);
  assert.equal(r.instrumental, 0);
  assert.match(r.yaml, /mode: video/);
});

test('answers null for what is not a list of tuples of strings, as the server answers 422', () => {
  assert.equal(readDataset('hola', 'music'), null);
  assert.equal(readDataset('[]', 'music'), null);
  assert.equal(readDataset('[{"description":"a"}]', 'music'), null);
  assert.equal(readDataset('[["1","t"]]', 'music'), null);
});

test('refuses, for a video, a Dialogue line whose text is not between quotes, as the real server does, and takes the quoted text', () => {
  const r = readDataset(JSON.stringify([row('1', 'A beach\nDialogue: What peace'), row('2', 'A kite\nDialogue: "Look at it fly"'), row('3', 'A street')]), 'video');
  assert.equal(r.imported, 2);
  assert.equal(r.rejected, 1);
  assert.equal(r.silent, 1);
  assert.match(r.yaml, /tts_text: Look at it fly/);
  assert.match(r.report, /\[1\]\n  rejected: Dialogue line without quoted text/);
});

test('writes a Motion line as an animated scene, which the confirmation then refuses without an engine, as the real server does', async () => {
  const r = readDataset(JSON.stringify([row('1', 'A kite\nMotion: the camera follows it')]), 'video');
  assert.match(r.yaml, /animate: true\n    motion_prompt: the camera follows it/);
});
