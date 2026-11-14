import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from './make-sample-dataset.mjs';

const VIDEO = { file: 'sample.mp4', address: 'samples/music-motion/sample.mp4', seconds: 12, bytes: 1, width: 1280, height: 720 };

test('the dataset has the sizes the screens need: a second page of pieces and references, and pieces in three states', () => {
  const d = buildDataset(VIDEO);
  assert.deepEqual([d.songs.length, d.pieces.length, d.references.length, d.presets.length, d.parts.length], [4, 14, 12, 4, 3]);
  assert.ok(d.pieces.length > 10 && d.references.length > 10);
  assert.deepEqual([...new Set(d.pieces.map((p) => p.state))].sort(), ['done', 'draft', 'failed']);
  assert.ok(d.pieces.filter((p) => p.state === 'failed').every((p) => p.error));
  assert.ok(d.songs.some((s) => s.instrumental) && d.songs.filter((s) => s.project === 'sample-beat').length === 2);
});

test('it is deterministic and keeps the facts of the video it is given', () => {
  assert.deepEqual(buildDataset(VIDEO), buildDataset(VIDEO));
  assert.deepEqual(buildDataset(VIDEO).video, VIDEO);
  assert.ok(buildDataset(VIDEO).songs.every((s) => s.seconds === 12));
});

test('every reference between the lists resolves and the ids are unique', () => {
  const d = buildDataset(VIDEO);
  const songKey = (s) => `${s.project}/${s.trackId}/${s.variant}`;
  const songs = new Set(d.songs.map(songKey));
  assert.ok(d.pieces.every((p) => songs.has(songKey(p.song))));
  const refs = new Set(d.references.map((r) => r.id));
  assert.ok(d.presets.every((p) => refs.has(p.referenceId)));
  for (const list of [d.pieces, d.references, d.presets]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  assert.equal(new Set(d.parts.map((p) => p.name)).size, d.parts.length);
});
