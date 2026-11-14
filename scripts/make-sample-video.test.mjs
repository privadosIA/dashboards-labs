import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { ffmpegArgs, DEFAULT_OUT, SAMPLE } from './make-sample-video.mjs';

test('the arguments make a video and an audio of the length and tempo asked, into the file asked', () => {
  const args = ffmpegArgs({ out: '/tmp/x.mp4', seconds: 5, bpm: 120 });
  assert.equal(args.at(-1), '/tmp/x.mp4');
  assert.equal(args[args.indexOf('-t') + 1], '5');
  const [video, audio] = args.filter((_, i) => args[i - 1] === '-i');
  assert.match(video, /d=5/);
  assert.match(video, /mod\(t,0\.5000\)/); // a beat every 0.5 s at 120 bpm
  assert.match(audio, /d=5/);
  assert.match(audio, /aevalsrc/);
});

test('without options they describe the sample: 12 s, 96 bpm, 720p, 30 fps, into the library folder', () => {
  const args = ffmpegArgs();
  assert.equal(args.at(-1), DEFAULT_OUT);
  assert.deepEqual([SAMPLE.seconds, SAMPLE.bpm, SAMPLE.width, SAMPLE.height, SAMPLE.fps], [12, 96, 1280, 720, 30]);
  assert.match(args.join(' '), /s=1280x720/);
});

test('every source is generated: no input file of anybody is read', () => {
  const args = ffmpegArgs();
  assert.equal(args.filter((_, i) => args[i - 1] === '-f').every((f) => f === 'lavfi'), true);
});

test('the committed sample is an MP4 of at most 3 MB', () => {
  assert.ok(statSync(DEFAULT_OUT).size <= 3 * 1024 * 1024, 'the sample video is larger than 3 MB');
  const fd = openSync(DEFAULT_OUT, 'r');
  const head = Buffer.alloc(12);
  readSync(fd, head, 0, 12, 0);
  closeSync(fd);
  assert.equal(head.subarray(4, 8).toString('latin1'), 'ftyp');
});
