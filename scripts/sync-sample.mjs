#!/usr/bin/env node
// Reads the sample video of the animation screens with ffprobe and writes what the data say about it (its length, size and
// dimensions) into libs/music-motion/sample/sample.json. Run it after replacing sample.mp4 (npm run sample:sync).
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SAMPLE_DIR = resolve(here, '../libs/music-motion/sample');

/** What the data say about a video, from the answer of `ffprobe -print_format json -show_format -show_streams` and the file's size. */
export function videoFacts(probe, bytes) {
  const stream = (probe.streams ?? []).find((s) => s.codec_type === 'video');
  if (!stream) throw new Error('the file has no video stream');
  const seconds = Math.round(Number(probe.format?.duration ?? stream.duration));
  if (!Number.isFinite(seconds) || seconds < 1) throw new Error('the file has no readable duration');
  return { seconds, bytes, width: stream.width, height: stream.height };
}

/** The data with the facts of the video in place of the old ones; every song lasts as long as the video. */
export function withFacts(data, facts) {
  return { ...data, songs: data.songs.map((s) => ({ ...s, seconds: facts.seconds })), video: { ...data.video, ...facts } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const jsonPath = resolve(SAMPLE_DIR, 'sample.json');
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const file = resolve(SAMPLE_DIR, data.video.file);
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error('ffprobe could not read the sample video:', r.error?.message ?? r.stderr);
    process.exit(1);
  }
  const next = withFacts(data, videoFacts(JSON.parse(r.stdout), statSync(file).size));
  writeFileSync(jsonPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`sample.json: ${next.video.seconds} s, ${next.video.bytes} bytes, ${next.video.width}x${next.video.height}`);
}
