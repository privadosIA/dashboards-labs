import { DEFAULT_SETTINGS, type Generation, type GenerationState } from './model';
import { IllegalTransition, advance, fail, finish, start } from './state';

const g = (state: GenerationState, progress = 0): Generation => ({ id: 'g1', settings: DEFAULT_SETTINGS, state, progress });
const moves = { start, finish: (x: Generation) => finish(x, 'v.mp4'), fail: (x: Generation) => fail(x, 'boom'), advance: (x: Generation) => advance(x, 50) };

describe('the state of a generation', () => {
  it('goes queued, running, done with a video', () => {
    const running = start(g('queued'));
    expect(running).toMatchObject({ state: 'running', progress: 0 });
    expect(finish(advance(running, 40), 'v.mp4')).toMatchObject({ state: 'done', progress: 100, videoUrl: 'v.mp4' });
  });

  it('can fail while running, with a message and no video', () => {
    const failed = fail(advance(start(g('queued')), 30), 'boom');
    expect(failed).toMatchObject({ state: 'failed', error: 'boom' });
    expect(failed.videoUrl).toBeUndefined();
  });

  it('keeps progress growing and below 100 while running', () => {
    const running = advance(start(g('queued')), 60);
    expect(advance(running, 20).progress).toBe(60);
    expect(advance(running, 250).progress).toBe(99);
  });

  const legal: Record<GenerationState, (keyof typeof moves)[]> = {
    queued: ['start'],
    running: ['finish', 'fail', 'advance'],
    done: [],
    failed: [],
  };
  for (const state of Object.keys(legal) as GenerationState[]) {
    for (const move of Object.keys(moves) as (keyof typeof moves)[]) {
      if (legal[state].includes(move)) continue;
      it(`refuses ${move} on a ${state} generation`, () => {
        expect(() => moves[move](g(state))).toThrow(IllegalTransition);
      });
    }
  }

  it('does not change the generation it is given', () => {
    const queued = g('queued');
    start(queued);
    expect(queued.state).toBe('queued');
  });
});
