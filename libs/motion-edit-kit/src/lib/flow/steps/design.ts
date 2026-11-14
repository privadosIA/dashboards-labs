import type { AnimationPort } from '@lab/animation-core';
import type { Observable } from 'rxjs';

import type { StepEvent } from '../execute';
import { propose } from './propose';

/** The Design step: the assistant (or the fixed rule) proposes the piece's design from the prompt. */
export const proposeDesign = (animation: AnimationPort, pieceId: string, prompt: string, model: string, provider = ''): Observable<StepEvent> => propose(animation, pieceId, 'design', prompt, model, provider);
