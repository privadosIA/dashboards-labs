import type { AnimationPort, Piece } from '@lab/animation-core';
import { type Observable, map, switchMap, takeWhile } from 'rxjs';

import type { StepEvent } from '../execute';

/** What the Render card shows before anything is drawn: the server's estimate (an estimate: it can be wrong) with the frame rate and size. */
export interface RenderEstimate {
  seconds: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
}

export const estimateOf = (piece: Pick<Piece, 'estimate' | 'fps' | 'width' | 'height'>): RenderEstimate => ({ seconds: piece.estimate.seconds, frames: piece.estimate.frames, fps: piece.fps, width: piece.width, height: piece.height });

/** Reads the piece's estimate. */
export function readEstimate(animation: AnimationPort, pieceId: string): Observable<RenderEstimate> {
  return animation.piece(pieceId).pipe(map(estimateOf));
}

/** Follows a piece being drawn: progress (0 to 100), then `done` with the address of the video, or an error with the server's reason. */
export function followRender(animation: AnimationPort, pieceId: string): Observable<StepEvent> {
  return animation.follow(pieceId).pipe(
    map((piece): StepEvent => {
      if (piece.state === 'failed') throw new Error(piece.error ?? 'the render failed');
      if (piece.state === 'done') return { kind: 'done', result: { video: piece.video ?? '', sizeBytes: piece.sizeBytes, ...estimateOf(piece) } };
      return { kind: 'progress', info: { state: piece.state, progress: piece.progress } };
    }),
    takeWhile((e) => e.kind !== 'done', true),
  );
}

/** Asks the server to draw the piece and follows it. Never called by itself: Draw is a button. */
export const drawPiece = (animation: AnimationPort, pieceId: string): Observable<StepEvent> => animation.render(pieceId).pipe(switchMap(() => followRender(animation, pieceId)));
