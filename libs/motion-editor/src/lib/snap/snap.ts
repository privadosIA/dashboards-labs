import type { SongMap } from '@lab/animation-core';

type Grid = Pick<SongMap, 'beats' | 'sections'>;

/** The seconds between two beats: the median gap of the song's beats, `0` when there are fewer than two. */
export function period(map: Pick<SongMap, 'beats'>): number {
  const beats = map.beats;
  if (beats.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < beats.length; i++) gaps.push(beats[i] - beats[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** The value of the sorted `list` closest to `t`, or `undefined` for an empty list. */
function nearest(list: readonly number[], t: number): number | undefined {
  if (list.length === 0) return undefined;
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const after = list[lo];
  const before = lo > 0 ? list[lo - 1] : after;
  return Math.abs(before - t) <= Math.abs(after - t) ? before : after;
}

/** The beat closest to `t` when it is within half a beat of it, else `t`: the rule the server snaps cuts with. */
export function snapBoundary(t: number, map: Pick<SongMap, 'beats'>): number {
  const p = period(map);
  const beat = nearest(map.beats, t);
  return p > 0 && beat !== undefined && Math.abs(beat - t) <= p / 2 ? beat : t;
}

/** Like `snapBoundary`, and a section boundary within half a beat wins over a beat when it is closer to `t`. */
export function snapToSections(t: number, map: Grid): number {
  const p = period(map);
  const beat = snapBoundary(t, map);
  if (p <= 0) return beat;
  const edge = nearest([...new Set(map.sections.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b), t);
  if (edge !== undefined && Math.abs(edge - t) <= p / 2 && Math.abs(edge - t) < Math.abs(beat - t)) return edge;
  return beat;
}

/** The half beat closest to `t` (the beats and the points half way between them), `t` itself when the song has no beats. */
export function snapHit(t: number, map: Pick<SongMap, 'beats'>): number {
  const { beats } = map;
  if (period(map) <= 0) return t;
  const halves: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    halves.push(beats[i]);
    if (i + 1 < beats.length) halves.push((beats[i] + beats[i + 1]) / 2);
  }
  return nearest(halves, t) ?? t;
}
