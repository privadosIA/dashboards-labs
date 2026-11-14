import type { SongMap } from '@lab/animation-core';

import type { DiagnosticArgs, DiagnosticCode } from './diagnostics';
import { round3 } from '../preview/song-slice';

/** A time as the code can say it: seconds, a beat (and how far into it), a section's edge, or the end of the song. */
export type TimeRef =
  | { readonly kind: 'seconds'; readonly value: number }
  | { readonly kind: 'beat'; readonly n: number; readonly f?: number }
  | { readonly kind: 'section'; readonly tag: string; readonly k?: number; readonly edge: 'start' | 'end' }
  | { readonly kind: 'song-end' };

export type Resolved = { readonly ok: true; readonly seconds: number } | { readonly ok: false; readonly code: DiagnosticCode; readonly args: DiagnosticArgs };

/** The tag the code uses for a section of the song: what the song map says, in lowercase. */
export const tagOf = (tag: string): string => tag.toLowerCase();

const ms = (seconds: number): number => Math.floor(seconds * 1000 + 0.5);

/** Where beat `n` starts, as the server numbers the beats: `beats[n - beatBase]`. */
function beatIndex(n: number, map: SongMap): number {
  return n - map.beatBase;
}

/** The length of the beat that starts at index `i`: up to the next one, or as long as the one before, or one beat of the tempo. */
function beatLength(i: number, map: SongMap): number {
  const b = map.beats;
  if (i + 1 < b.length) return b[i + 1] - b[i];
  if (i > 0) return b[i] - b[i - 1];
  return map.bpm > 0 ? 60 / map.bpm : 0;
}

/** The seconds a time says in this song, to three decimals, or why it cannot be resolved. */
export function resolveTime(ref: TimeRef, map: SongMap): Resolved {
  switch (ref.kind) {
    case 'seconds':
      return ref.value < 0 ? { ok: false, code: 'time-range', args: {} } : { ok: true, seconds: round3(ref.value) };
    case 'song-end':
      return { ok: true, seconds: round3(map.duration) };
    case 'beat': {
      const i = beatIndex(ref.n, map);
      if (!Number.isInteger(ref.n) || i < 0 || i >= map.beats.length) {
        return { ok: false, code: 'beat-range', args: { n: ref.n, first: map.beatBase, last: map.beatBase + map.beats.length - 1 } };
      }
      const f = ref.f ?? 0;
      if (f < 0 || f >= 1) return { ok: false, code: 'beat-fraction', args: {} };
      return { ok: true, seconds: round3(map.beats[i] + f * beatLength(i, map)) };
    }
    case 'section': {
      const k = ref.k ?? 1;
      const same = map.sections.filter((s) => tagOf(s.tag) === ref.tag);
      const found = Number.isInteger(k) && k >= 1 ? same[k - 1] : undefined;
      if (!found) return { ok: false, code: 'no-section', args: ref.k === undefined ? { tag: ref.tag } : { tag: ref.tag, k } };
      return { ok: true, seconds: round3(ref.edge === 'start' ? found.start : found.end) };
    }
  }
}

/**
 * The way the code says a time that falls on the song's structure (within a millisecond): the end of the song, the start of a section, the
 * end of one, or the start of a beat, in that order; nothing when it falls on none of them, and the code then writes the seconds. The
 * start of a section is preferred to the end of the one before it, because it is the section the piece begins with.
 */
export function anchorFor(seconds: number, map: SongMap): TimeRef | undefined {
  const t = ms(seconds);
  if (t <= 0 || t > ms(map.duration)) return undefined;
  if (t === ms(map.duration)) return { kind: 'song-end' };
  const seen = new Map<string, number>();
  const edges: { tag: string; k: number; edge: 'start' | 'end'; at: number }[] = [];
  for (const s of map.sections) {
    const tag = tagOf(s.tag);
    const k = (seen.get(tag) ?? 0) + 1;
    seen.set(tag, k);
    edges.push({ tag, k, edge: 'start', at: ms(s.start) }, { tag, k, edge: 'end', at: ms(s.end) });
  }
  const hit = edges.find((e) => e.edge === 'start' && e.at === t) ?? edges.find((e) => e.edge === 'end' && e.at === t);
  if (hit) return { kind: 'section', tag: hit.tag, ...(hit.k > 1 ? { k: hit.k } : {}), edge: hit.edge };
  // The beats are in order: a binary search for the one at `t`.
  let lo = 0;
  let hi = map.beats.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = ms(map.beats[mid]);
    if (b === t) return { kind: 'beat', n: map.beatBase + mid };
    if (b < t) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}
