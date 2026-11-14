import type { AnimationPort } from '@lab/animation-core';
import type { Observable } from 'rxjs';

import type { StepEvent } from '../execute';
import { propose } from './propose';

/** The Script step: the assistant (or the fixed rule) proposes the piece's script from the prompt; its review is the editor itself. */
export const proposeScript = (animation: AnimationPort, pieceId: string, prompt: string, model: string, provider = ''): Observable<StepEvent> => propose(animation, pieceId, 'script', prompt, model, provider);
