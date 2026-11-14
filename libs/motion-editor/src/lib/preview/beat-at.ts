import type { SongMap } from '@lab/animation-core';

export interface BeatReading {
  /** The number of the last beat at or before the time, `-1` before the first. */
  readonly number: number;
  /** The tag of the section that holds the time, or an empty text. */
  readonly section: string;
}

/** The beat and the section under a song time, on the whole song's map (the readout of the transport; the page has its own clock). */
export function beatAt(map: Pick<SongMap, 'beats' | 'beatBase' | 'sections'>, t: number): BeatReading {
  let lo = 0;
  let hi = map.beats.length - 1;
  let n = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (map.beats[mid] <= t + 1e-9) {
      n = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const secs = map.sections;
  let section = '';
  for (let i = 0; i < secs.length; i++) {
    if (t >= secs[i].start - 1e-9 && (t < secs[i].end - 1e-9 || i === secs.length - 1)) {
      section = secs[i].tag;
      break;
    }
  }
  return { number: n < 0 ? n : n + map.beatBase, section };
}

/** `m:ss.mmm`, the way the transport shows a time. */
export function timeText(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
