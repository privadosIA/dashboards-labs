import type { Keyframe, Script } from '@lab/animation-core';

/** The keyframes of one parameter within one piece. */
export interface KeyframeSpan {
  readonly piece: string;
  /** The place of the piece in the script. */
  readonly index: number;
  readonly part: string;
  readonly start: number;
  readonly end: number;
  readonly frames: readonly Keyframe[];
}

/** A row of the timeline: one parameter (of the main parts, or of the extra at `extra`) across every piece that animates it. */
export interface KeyframeRow {
  readonly key: string;
  readonly param: string;
  readonly extra?: number;
  readonly spans: readonly KeyframeSpan[];
}

/**
 * The rows the timeline draws under the extra lanes, one for every parameter that has keyframes in the script: the main parts' first, by
 * name, then those of the first extra, the second and the third. A row lists the pieces that animate that parameter, in time order.
 */
export function keyframeRows(script: Script): KeyframeRow[] {
  const rows = new Map<string, { param: string; extra?: number; spans: KeyframeSpan[] }>();
  const sorted = script.pieces.map((p, index) => ({ p, index })).sort((a, b) => a.p.start - b.p.start);
  const add = (piece: (typeof sorted)[number], part: string, animate: Readonly<Record<string, readonly Keyframe[]>> | undefined, extra?: number): void => {
    for (const [param, frames] of Object.entries(animate ?? {})) {
      if (frames.length === 0) continue;
      const key = `${extra ?? 'main'}:${param}`;
      const row = rows.get(key) ?? { param, ...(extra !== undefined ? { extra } : {}), spans: [] };
      row.spans.push({ piece: piece.p.id, index: piece.index, part, start: piece.p.start, end: piece.p.end, frames });
      rows.set(key, row);
    }
  };
  for (const piece of sorted) {
    add(piece, piece.p.part, piece.p.animate);
    (piece.p.with ?? []).forEach((e, k) => add(piece, e.part, e.animate, k));
  }
  return [...rows.entries()]
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => (a.extra ?? -1) - (b.extra ?? -1) || (a.param < b.param ? -1 : a.param > b.param ? 1 : 0));
}
