export const MIN_PX_PER_SECOND = 4;
export const MAX_PX_PER_SECOND = 400;
export const BEATS_PER_BAR = 4;

export const clampScale = (pxPerSecond: number): number => Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, pxPerSecond));

/** The horizontal scale of the timeline: seconds to pixels and back, the visible range and the zoom around a point. */
export class TimeScale {
  readonly pxPerSecond: number;

  constructor(pxPerSecond: number) {
    this.pxPerSecond = clampScale(pxPerSecond);
  }

  xOf(t: number): number {
    return t * this.pxPerSecond;
  }

  tOf(x: number): number {
    return x / this.pxPerSecond;
  }

  /** The width of `seconds` of song. */
  widthOf(seconds: number): number {
    return seconds * this.pxPerSecond;
  }

  /** The seconds that show in a window `width` pixels wide whose left edge is `scrollLeft` pixels in. */
  visible(scrollLeft: number, width: number): { readonly from: number; readonly to: number } {
    return { from: this.tOf(scrollLeft), to: this.tOf(scrollLeft + width) };
  }

  /**
   * The scale after multiplying it by `factor` while the song time under pixel `anchorX` of the window stays under it, and the scroll that
   * keeps it there (never negative).
   */
  zoomAround(factor: number, anchorX: number, scrollLeft: number): { readonly scale: TimeScale; readonly scrollLeft: number } {
    const next = new TimeScale(this.pxPerSecond * factor);
    const t = this.tOf(scrollLeft + anchorX);
    return { scale: next, scrollLeft: Math.max(0, next.xOf(t) - anchorX) };
  }

  /** The scale that makes `seconds` of song fit `width` pixels. */
  static fit(seconds: number, width: number): TimeScale {
    return new TimeScale(seconds > 0 ? width / seconds : MIN_PX_PER_SECOND);
  }
}

/** The indexes of the beats that start a bar, inside `[from, to]`: the beats whose number (with the slice's base) is a multiple of four. */
export function barBeats(beats: readonly number[], beatBase: number, from: number, to: number, perBar = BEATS_PER_BAR): number[] {
  const out: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    if (beats[i] > to) break;
    if (beats[i] >= from && (i + beatBase) % perBar === 0) out.push(i);
  }
  return out;
}

/** Indexes of the items of a time-ordered list that overlap `[from, to]` (the part the timeline paints). */
export function inRange<T extends { readonly start: number; readonly end: number }>(items: readonly T[], from: number, to: number): T[] {
  return items.filter((i) => i.end >= from && i.start <= to);
}

/** A step for the ruler's labels: the first of 1, 2, 5, 10, 15, 30, 60, 120, 300 seconds that leaves at least `minPx` pixels between two marks. */
export function rulerStep(pxPerSecond: number, minPx = 64): number {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (s * pxPerSecond >= minPx) return s;
  return 600;
}
