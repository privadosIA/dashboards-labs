import { AnimationFailure } from '@lab/animation-core';
import { AssistFailed, SongRefused } from '@lab/music-studio-kit';
import { Subject, of, throwError } from 'rxjs';

import { type StepEvent, execute, failureOf } from './execute';
import { FlowStorage } from './flow.storage';
import { FlowStore } from './flow.store';
import type { Plan } from './model';

const plan: Plan = { song: { title: 'T', lyrics: '', style: '', generator: 'ace-step', instrumental: true }, animation: { choices: { style: 'typographic', level: 'simple', fps: 30, resolution: '1280x720' } }, parts: [] };
const store = () => {
  const s = new FlowStore(new FlowStorage('motion-edit', { getItem: () => null, setItem: () => undefined }));
  s.start('x', plan);
  return s;
};

describe('execute', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the step, reports progress, and ends in review with the result and the ids it made', () => {
    const s = store();
    const progress: unknown[] = [];
    const events = new Subject<StepEvent>();
    execute(s, 'song', () => events, { onProgress: (i) => progress.push(i) });
    expect(s.flow()?.steps.song.status).toBe('running');
    events.next({ kind: 'progress', info: { phase: 'queued' } });
    events.next({ kind: 'done', result: { url: 'a.wav' }, refs: { songId: 'song-1' } });
    expect(progress).toEqual([{ phase: 'queued' }]);
    expect(s.flow()?.steps.song).toMatchObject({ status: 'waiting', result: { url: 'a.wav' } });
    expect(s.flow()?.refs.songId).toBe('song-1');
  });

  it('fails the step with the reason of an error', () => {
    const s = store();
    execute(s, 'design', () => throwError(() => new AnimationFailure('refused', 'the model refused')));
    expect(s.flow()?.steps.design).toMatchObject({ status: 'failed', reason: 'the model refused' });
  });

  it('fails a step that ends without a result', () => {
    const s = store();
    execute(s, 'design', () => of<StepEvent>({ kind: 'progress', info: {} }));
    expect(s.flow()?.steps.design).toMatchObject({ status: 'failed', reason: 'no-result' });
  });

  it('waits when the server is busy and tries again every 10 seconds until it is accepted', () => {
    const s = store();
    let calls = 0;
    const busy: boolean[] = [];
    execute(s, 'design', () => (++calls < 3 ? throwError(() => new AnimationFailure('busy', 'drawing')) : of<StepEvent>({ kind: 'done', result: { ok: true } })), { onBusy: (b) => busy.push(b) });
    expect(calls).toBe(1);
    expect(s.flow()?.steps.design.status).toBe('running');
    vi.advanceTimersByTime(9_999);
    expect(calls).toBe(1);
    vi.advanceTimersByTime(1);
    expect(calls).toBe(2);
    vi.advanceTimersByTime(10_000);
    expect(calls).toBe(3);
    expect(s.flow()?.steps.design.status).toBe('waiting');
    expect(busy).toEqual([true, true, false]);
  });

  it('stops waiting when the card leaves the screen', () => {
    const s = store();
    let calls = 0;
    const sub = execute(s, 'design', () => (++calls, throwError(() => new AnimationFailure('busy', 'drawing'))));
    sub.unsubscribe();
    vi.advanceTimersByTime(60_000);
    expect(calls).toBe(1);
  });

  it('says what went wrong in the words it came with', () => {
    expect(failureOf(new AnimationFailure('busy', 'x'))).toEqual({ reason: 'x', busy: true });
    expect(failureOf(new AssistFailed('refused', 'too big'))).toEqual({ reason: 'refused: too big', busy: false });
    expect(failureOf(new SongRefused(['title.required']))).toEqual({ reason: 'title.required', busy: false });
    expect(failureOf('plain')).toEqual({ reason: 'plain', busy: false });
  });
});
