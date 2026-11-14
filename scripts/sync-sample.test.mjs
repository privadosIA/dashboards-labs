import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { SAMPLE_DIR, videoFacts, withFacts } from './sync-sample.mjs';

const probe = { format: { duration: '12.000000' }, streams: [{ codec_type: 'audio' }, { codec_type: 'video', width: 1280, height: 720 }] };

test('the facts of a video are its length in whole seconds, its size and its dimensions', () => {
  assert.deepEqual(videoFacts(probe, 392476), { seconds: 12, bytes: 392476, width: 1280, height: 720 });
});

test('a file with no video stream or no duration is refused', () => {
  assert.throws(() => videoFacts({ format: { duration: '3' }, streams: [{ codec_type: 'audio' }] }, 1), /no video stream/);
  assert.throws(() => videoFacts({ format: {}, streams: [{ codec_type: 'video', width: 1, height: 1 }] }, 1), /no readable duration/);
});

test('new facts replace the old ones and every song lasts as long as the video', () => {
  const next = withFacts({ songs: [{ title: 'x', seconds: 5 }, { title: 'y', seconds: 7 }], video: { file: 'sample.mp4', address: 'a', seconds: 5, bytes: 1, width: 1, height: 1 } }, { seconds: 30, bytes: 99, width: 640, height: 360 });
  assert.deepEqual(next.songs, [{ title: 'x', seconds: 30 }, { title: 'y', seconds: 30 }]);
  assert.deepEqual(next.video, { file: 'sample.mp4', address: 'a', seconds: 30, bytes: 99, width: 640, height: 360 });
});

test('the committed data agree with the committed video file', () => {
  const data = JSON.parse(readFileSync(resolve(SAMPLE_DIR, 'sample.json'), 'utf8'));
  assert.equal(data.video.bytes, statSync(resolve(SAMPLE_DIR, data.video.file)).size);
  assert.ok(data.songs.every((s) => s.seconds === data.video.seconds));
  assert.ok(data.pieces.filter((p) => p.state === 'done').some((p) => p.resolution === `${data.video.width}x${data.video.height}`));
});
