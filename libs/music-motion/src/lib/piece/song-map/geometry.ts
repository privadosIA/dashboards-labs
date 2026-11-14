import type { SongMap } from '@lab/animation-core';

/** The width of the timeline's drawing; the height is `HEIGHT`. Both are the drawing's own units, not pixels. */
export const WIDTH = 1000;
export const HEIGHT = 120;
/** The sections go in a band at the top, the loudness fills the rest. */
export const BAND = 22;
/** More beats than this are drawn one in `beat_base` (the bar lines): a long song would be a comb otherwise. */
export const MAX_BEATS = 400;

export interface Geometry {
  readonly sections: readonly { tag: string; x: number; width: number }[];
  readonly beats: readonly number[];
  readonly words: readonly { text: string; x: number }[];
  /** The loudness as the points of a polyline, from the bottom edge up. */
  readonly loudness: string;
  /** A rectangle for a span of the song, in the drawing's units, or null for none. */
  readonly span: (span: { start: number; end: number } | null) => { x: number; width: number } | null;
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** Where everything of a song map goes on a timeline `WIDTH` wide. */
export function geometryOf(map: SongMap, beatBase = 4): Geometry {
  const x = (seconds: number): number => (map.duration > 0 ? round((Math.min(Math.max(seconds, 0), map.duration) / map.duration) * WIDTH) : 0);
  const beats = map.beats.length > MAX_BEATS ? map.beats.filter((_, i) => i % Math.max(beatBase, 1) === 0) : map.beats;
  const peak = Math.max(...map.loudness, 0);
  const top = BAND + 4;
  const loudness = peak > 0 && map.loudness.length > 1 ? map.loudness.map((v, i) => `${round((i / (map.loudness.length - 1)) * WIDTH)},${round(HEIGHT - (v / peak) * (HEIGHT - top))}`).join(' ') : '';
  return {
    sections: map.sections.map((s) => ({ tag: s.tag, x: x(s.start), width: Math.max(round(x(s.end) - x(s.start)), 1) })),
    beats: beats.map(x),
    words: map.words.map((w) => ({ text: w.text, x: x(w.start) })),
    loudness,
    span: (span) => (span && map.duration > 0 ? { x: x(span.start), width: Math.max(round(x(span.end) - x(span.start)), 1) } : null),
  };
}
