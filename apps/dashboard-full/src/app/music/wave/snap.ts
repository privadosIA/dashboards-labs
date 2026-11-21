/** Rounds to a step (the grid); a step of 0 leaves the value, rounded to the millisecond. */
export function snapTo(value: number, step: number): number {
  const v = step > 0 ? Math.round(value / step) * step : value;
  return Math.round(v * 1000) / 1000;
}

/** Beats in a bar for a time signature as the engine reports it ("4", "3", "6"); 4 when it says nothing usable. */
export function beatsPerBar(timesignature: string | undefined): number {
  const n = Number.parseInt(timesignature ?? '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 4;
}

/** The beat and the bar, in seconds, of a song at `bpm`; null without a usable tempo. */
export function beatGrid(bpm: number | undefined, timesignature: string | undefined): { bpm: number; beat: number; bar: number; perBar: number } | null {
  if (!bpm || !Number.isFinite(bpm) || bpm < 20 || bpm > 400) return null;
  const perBar = beatsPerBar(timesignature);
  const beat = 60 / bpm;
  return { bpm, beat, bar: beat * perBar, perBar };
}

/** The grid step (seconds) one arrow key moves a clip by: the snap, or a tenth of a second without it. */
export function nudgeStep(snap: number, shift: boolean): number {
  const base = snap > 0 ? snap : 0.1;
  return shift ? base * 10 : base;
}

/**
 * Seconds from `from` (where the sound being placed starts) to the point of it
 * that lands on the grid. `phase` is the second of the song where its pulse
 * falls and `period` the seconds between beats: with a period the anchor is the
 * first beat at or after `from`; without one `phase` is the very second to anchor on.
 */
export function anchorOffset(from: number, phase: number, period: number): number {
  if (period <= 0) return Math.max(0, phase - from);
  const first = from <= phase ? phase : phase + Math.ceil((from - phase) / period - 1e-9) * period;
  return Math.max(0, first - from);
}

/** The position nearest to `raw` that puts the point `offset` seconds in on a line of the grid, never before 0. */
export function snapAnchored(raw: number, step: number, offset: number): number {
  if (step <= 0 || offset === 0) return Math.max(0, snapTo(raw, step));
  let line = snapTo(raw + offset, step);
  if (line < offset) line = Math.ceil(offset / step) * step; // the nearest line would start the sound before 0
  return Math.round((line - offset) * 1000) / 1000;
}

/**
 * A function that rounds a second of a song to its beat (or, held with Alt, to
 * its bar) when `grid` is the tempo of the song; `offset` is where its first
 * beat falls in the file. Null without a tempo.
 */
export function beatSnapper(grid: { beat: number; bar: number } | null, offset = 0): ((t: number, bar: boolean) => number) | null {
  if (!grid) return null;
  return (t, bar) => {
    const step = bar ? grid.bar : grid.beat;
    return Math.max(0, snapTo(offset + Math.round((t - offset) / step) * step, 0));
  };
}
