import type { SongMap } from '@lab/animation-core';

/** The song map as the page reads it (`window.__motionSong`): the server's own JSON shape, cut to one scene. */
export interface SongSlice {
  readonly version: 1;
  readonly duration: number;
  readonly bpm: number;
  readonly beats: readonly number[];
  readonly beat_base: number;
  readonly grid_anchored: boolean;
  readonly sections: readonly { tag: string; start: number; end: number }[];
  readonly words: readonly { text: string; start: number; end: number; line: number }[];
  readonly loudness_hop: number;
  readonly loudness: readonly number[];
}

/** Rounds to three decimals the way the server does (`round3`). */
export const round3 = (v: number): number => Math.floor(v * 1000 + 0.5) / 1000;

/**
 * The part of the song map from `start` to `end` seconds, shifted so that `start` is 0: the map the page of a scene that begins at `start`
 * is given, so that it works in its own time. The twin of the server's `songmap.Slice`: it keeps the beat just before `start` (at a negative
 * time) so the position inside the first beat is right, and `beat_base` is the index of the first beat kept; sections are cut to the range;
 * words are the ones whose start is inside; loudness runs from `floor(start / hop)` to `ceil(end / hop)`.
 */
export function sliceSongMap(map: SongMap, start: number, end: number): SongSlice {
  const empty = { version: 1 as const, bpm: map.bpm, beat_base: 0, grid_anchored: false, loudness_hop: map.loudnessHop, beats: [], sections: [], words: [], loudness: [] };
  if (end <= start) return { ...empty, duration: 0 };

  const beats: number[] = [];
  let first = -1;
  for (let i = 0; i < map.beats.length; i++) {
    const b = map.beats[i];
    if (b > end) break;
    const next = i + 1 < map.beats.length ? map.beats[i + 1] : end + 1;
    if (next <= start) continue; // wholly before the range, and not the beat just before it
    if (first < 0) first = i;
    beats.push(round3(b - start));
  }

  const sections = [];
  for (const sec of map.sections) {
    const s0 = Math.max(sec.start, start);
    const e0 = Math.min(sec.end, end);
    if (e0 > s0) sections.push({ tag: sec.tag, start: round3(s0 - start), end: round3(e0 - start) });
  }

  const words = [];
  for (const w of map.words) {
    if (w.start >= start - 1e-9 && w.start < end) words.push({ text: w.text, start: round3(w.start - start), end: round3(Math.min(w.end, end) - start), line: w.line });
  }

  let loudness: readonly number[] = [];
  if (map.loudnessHop > 0) {
    const a = Math.max(0, Math.floor(start / map.loudnessHop));
    const b = Math.min(map.loudness.length, Math.ceil(end / map.loudnessHop));
    if (a < b) loudness = map.loudness.slice(a, b);
  }

  return {
    version: 1,
    duration: round3(end - start),
    bpm: map.bpm,
    beats,
    beat_base: first > 0 ? first : 0,
    grid_anchored: map.gridAnchored,
    sections,
    words,
    loudness_hop: map.loudnessHop,
    loudness,
  };
}

/** What a part reads of the beat: the number (-1 before the first beat) and how far into it the time is. */
export interface BeatPosition {
  readonly number: number;
  readonly position: number;
}

/**
 * The beat under a time of a slice, as the page's beat clock computes it (`window.__beat`): the number is the index of the last beat at or
 * before `t` plus the slice's `beat_base` (-1 before the first), the position runs from 0 to just under 1 from the real distance to the next beat.
 * The vector editor shows a part's beat links with this, so the canvas pulses where the preview will.
 */
export function beatOfSlice(slice: Pick<SongSlice, 'beats' | 'bpm' | 'beat_base'>, t: number): BeatPosition {
  const beats = slice.beats;
  let lo = 0;
  let hi = beats.length - 1;
  let n = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t + 1e-9) {
      n = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const base = slice.bpm > 0 ? 60 / slice.bpm : beats.length > 1 ? beats[1] - beats[0] : 0;
  let period = base;
  if (n >= 0 && n + 1 < beats.length) period = beats[n + 1] - beats[n];
  else if (n > 0) period = beats[n] - beats[n - 1];
  let position = 0;
  if (period > 0) {
    const from = n >= 0 ? beats[n] : beats.length ? beats[0] - period : 0;
    position = Math.min(0.999999, Math.max(0, (t - from) / period));
  }
  return { number: n < 0 ? n : n + (slice.beat_base || 0), position };
}

/** The loudness (0 to 1) of a slice at a time: `loudness[floor(t / loudness_hop)]`, as the part's runtime reads `window.__motionSong`; undefined without a curve. */
export function loudnessOfSlice(slice: Pick<SongSlice, 'loudness' | 'loudness_hop'>, t: number): number | undefined {
  if (!slice.loudness.length) return undefined;
  const hop = slice.loudness_hop > 0 ? slice.loudness_hop : 1;
  return slice.loudness[Math.min(slice.loudness.length - 1, Math.max(0, Math.floor(t / hop)))];
}
