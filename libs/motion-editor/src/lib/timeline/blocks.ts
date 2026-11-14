import { pageParts, type Script, type SongMap } from '@lab/animation-core';

import { MAX_EXTRAS } from './constants';

export interface ExtraBlock {
  readonly part: string;
  readonly index: number;
}

/** A script piece as the timeline draws it: where it sits, its part, a dot for each line, a flag for a word hit and its extras. */
export interface PieceBlock {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly part: string;
  /** The song time at which each line starts. */
  readonly dots: readonly number[];
  /** The song time of the word hit, when the piece has one. */
  readonly hit?: number;
  readonly extras: readonly ExtraBlock[];
  /** How many parts the page of the piece draws: its main part, its extras and the layer items that touch it. */
  readonly pageParts: number;
}

/** The blocks of a script, in time order. */
export function blocksOf(script: Script, map: Pick<SongMap, 'words'>): PieceBlock[] {
  return script.pieces
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p.start - b.p.start)
    .map(({ p, index }) => ({
      id: p.id,
      start: p.start,
      end: p.end,
      part: p.part,
      dots: (p.lines ?? []).map((l) => (l.line !== undefined ? (map.words.find((w) => w.line === l.line)?.start ?? p.start) : (l.start ?? p.start))),
      ...(p.hit ? { hit: p.hit.at } : {}),
      extras: (p.with ?? []).slice(0, MAX_EXTRAS).map((w, k) => ({ part: w.part, index: k })),
      pageParts: pageParts(script, index).length,
    }));
}
