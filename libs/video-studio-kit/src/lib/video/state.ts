import { isFinished, type Generation, type GenerationState } from './model';

export class IllegalTransition extends Error {
  constructor(from: GenerationState, to: string) {
    super(`a ${from} generation cannot become ${to}`);
    this.name = 'IllegalTransition';
  }
}

/** queued -> running -> done | failed. A finished generation never changes again. Each function returns a new generation or throws. */

export function start(g: Generation): Generation {
  if (g.state !== 'queued') throw new IllegalTransition(g.state, 'running');
  return { ...g, state: 'running', progress: 0 };
}

/** Progress only grows, and only while running; it stays below 100, which is `done`. */
export function advance(g: Generation, progress: number): Generation {
  if (g.state !== 'running') throw new IllegalTransition(g.state, 'running (progress)');
  return { ...g, progress: Math.min(99, Math.max(g.progress, Math.round(progress))) };
}

export function finish(g: Generation, videoUrl: string): Generation {
  if (g.state !== 'running') throw new IllegalTransition(g.state, 'done');
  return { ...g, state: 'done', progress: 100, videoUrl };
}

export function fail(g: Generation, error: string): Generation {
  if (g.state !== 'running') throw new IllegalTransition(g.state, 'failed');
  return { ...g, state: 'failed', error };
}

export { isFinished };
