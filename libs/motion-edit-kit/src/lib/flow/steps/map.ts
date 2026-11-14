import { AnimationFailure, type AnimationPort, type PieceDetail } from '@lab/animation-core';
import { type Observable, map, switchMap, throwError } from 'rxjs';

import type { StepEvent } from '../execute';
import type { Plan } from '../model';

/** What the review of the song map shows. Plain data, so the flow keeps it as the step's result. */
export interface MapSummary {
  pieceId: string;
  title: string;
  seconds: number;
  bpm: number;
  sections: number;
  /** How many words the map has. */
  words: number;
  /** The word times were spread over the sections, not heard: Transcribe makes them real. */
  wordsEstimated: boolean;
  /** Why the words were not heard when they were asked for, if the server said. */
  notice?: string;
}

export const summaryOf = (piece: PieceDetail): MapSummary => ({
  pieceId: piece.id,
  title: piece.title,
  seconds: piece.songMap.duration,
  bpm: piece.songMap.bpm,
  sections: piece.songMap.sections.length,
  words: piece.songMap.words.length,
  wordsEstimated: piece.songMap.wordsEstimated,
  ...(piece.notice ? { notice: piece.notice } : {}),
});

/** The choices a piece is made with: the plan's, with the sentence as the prompt. */
export const choicesOf = (plan: Plan, prompt: string) => ({ ...plan.animation.choices, prompt: plan.animation.choices.prompt || prompt });

/** Makes the piece (and its song map) from the song the library lists as `libraryKey`. A song the library does not list is a `missing` failure. */
export function makeMap(animation: AnimationPort, libraryKey: string, plan: Plan, prompt: string): Observable<StepEvent> {
  return animation.songs().pipe(
    switchMap((list) => {
      const song = list.find((s) => s.key === libraryKey);
      return song ? animation.create(song, choicesOf(plan, prompt)) : throwError(() => new AnimationFailure('missing', `the song ${libraryKey} is not in the library`));
    }),
    map((piece): StepEvent => ({ kind: 'done', result: { ...summaryOf(piece) }, refs: { pieceId: piece.id } })),
  );
}

/** Hears the words of the song again (the server listens to it) and returns the summary with real word times. */
export function transcribePiece(animation: AnimationPort, pieceId: string): Observable<MapSummary> {
  return animation.transcribe(pieceId).pipe(map(summaryOf));
}
