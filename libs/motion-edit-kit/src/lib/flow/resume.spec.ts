import { AnimationFailure, type AnimationPort, DEFAULT_RESOLUTION } from '@lab/animation-core';
import { InMemoryAnimation } from '@lab/music-motion';
import type { Song, SongPort, SongState } from '@lab/music-studio-kit';
import { EMPTY, type Observable, firstValueFrom, of, throwError } from 'rxjs';

import { FlowStorage } from './flow.storage';
import { FlowStore } from './flow.store';
import type { Plan, StepId } from './model';
import { GONE, INTERRUPTED, resumeFlow } from './resume';

const plan: Plan = {
  song: { title: 'T', lyrics: '', style: 's', generator: 'ace-step', instrumental: true },
  animation: { choices: { style: 'typographic', level: 'simple', fps: 30, resolution: DEFAULT_RESOLUTION } },
  parts: [{ name: 'year-counter', request: 'a counter' }],
};

const songState = (state: SongState | undefined): SongPort => ({ follow: (): Observable<Song> => (state ? of({ id: 's1', title: 'T', style: '', lyrics: '', instrumental: true, generator: 'ace-step', createdAt: 0, state }) : EMPTY) }) as unknown as SongPort;
const noSongs = songState(undefined);

const kv = () => {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

/** A flow kept with its steps in the states given, then opened. */
const open = (steps: Partial<Record<StepId, 'running' | 'waiting' | 'done'>>, refs: Parameters<FlowStore['setRefs']>[0]) => {
  const store = new FlowStore(new FlowStorage('motion-edit', kv()));
  store.start('x', plan);
  store.setRefs(refs);
  for (const [step, status] of Object.entries(steps) as [StepId, string][]) {
    store.run(step);
    if (status !== 'running') store.complete(step, { kept: true });
    if (status === 'done') store.continue();
  }
  return store;
};

const resume = (store: FlowStore, ports: { songs?: SongPort; animation?: AnimationPort }) => firstValueFrom(resumeFlow(store, { songs: ports.songs ?? noSongs, animation: ports.animation ?? new InMemoryAnimation() }));

describe('resumeFlow', () => {
  it('shows a song that finished while the tab was closed, with its address', async () => {
    const store = open({ song: 'running' }, { songId: 's1' });
    await resume(store, { songs: songState({ phase: 'done', url: 'a.wav', seconds: 90 }) });
    expect(store.flow()?.steps.song).toMatchObject({ status: 'waiting', result: { url: 'a.wav', seconds: 90 } });
  });

  it('shows a song that failed or was cancelled with the reason', async () => {
    const failed = open({ song: 'running' }, { songId: 's1' });
    await resume(failed, { songs: songState({ phase: 'failed', reason: 'out of memory' }) });
    expect(failed.flow()?.steps.song).toMatchObject({ status: 'failed', reason: 'out of memory' });
    const cancelled = open({ song: 'running' }, { songId: 's1' });
    await resume(cancelled, { songs: songState({ phase: 'cancelled' }) });
    expect(cancelled.flow()?.steps.song).toMatchObject({ status: 'failed', reason: 'cancelled' });
  });

  it('leaves a song that is still being made running: its card follows it', async () => {
    const store = open({ song: 'running' }, { songId: 's1' });
    await resume(store, { songs: songState({ phase: 'running' }) });
    expect(store.flow()?.steps.song.status).toBe('running');
  });

  it('fails the step of a song that is no longer on the server', async () => {
    const store = open({ song: 'waiting' }, { songId: 's1' });
    await resume(store, { songs: songState(undefined) });
    expect(store.flow()?.steps.song).toMatchObject({ status: 'failed', reason: GONE });
  });

  it('fails the step of a piece that was deleted, and offers Back through the failed state', async () => {
    const store = open({ song: 'done', map: 'done', design: 'done', script: 'waiting' }, { pieceId: 'no-such-piece' });
    await resume(store, { animation: new InMemoryAnimation() });
    expect(store.flow()?.steps.map).toMatchObject({ status: 'failed', reason: GONE });
    expect(store.flow()?.current).toBe('map');
  });

  it('shows the video of a piece that finished drawing while the tab was closed', async () => {
    const animation = new InMemoryAnimation();
    await firstValueFrom(animation.loadSample());
    const done = (await firstValueFrom(animation.pieces())).find((p) => p.state === 'done')!;
    const store = open({ render: 'running' }, { pieceId: done.id });
    await resume(store, { animation });
    expect(store.flow()?.steps.render).toMatchObject({ status: 'waiting', result: { video: done.video } });
  });

  it('shows the error of a piece whose drawing failed', async () => {
    const store = open({ render: 'running' }, { pieceId: 'p1' });
    const animation = { piece: () => of({ state: 'failed', error: 'no disk' }), draft: () => EMPTY } as unknown as AnimationPort;
    await resume(store, { animation });
    expect(store.flow()?.steps.render).toMatchObject({ status: 'failed', reason: 'no disk' });
  });

  it('leaves a piece that is still drawing running', async () => {
    const store = open({ render: 'running' }, { pieceId: 'p1' });
    const animation = { piece: () => of({ state: 'running', progress: 0.4 }) } as unknown as AnimationPort;
    await resume(store, { animation });
    expect(store.flow()?.steps.render.status).toBe('running');
  });

  it('fails Parts when a draft is gone', async () => {
    const store = open({ song: 'done', map: 'done', design: 'done', script: 'done', parts: 'waiting' }, { drafts: { 'year-counter': 'd1' } });
    await resume(store, { animation: { draft: () => throwError(() => new AnimationFailure('missing', 'gone')) } as unknown as AnimationPort });
    expect(store.flow()?.steps.parts).toMatchObject({ status: 'failed', reason: `${GONE}:year-counter` });
  });

  it('does not look for the draft of a part that was approved or dropped: it is gone from the server by design', async () => {
    const store = open({ song: 'done', map: 'done', design: 'done', script: 'done', parts: 'waiting' }, { drafts: { 'year-counter': 'd1', other: 'd2' } });
    store.setResult('parts', { items: [{ name: 'year-counter', request: 'r', status: 'approved', preview: [] }, { name: 'other', request: 'r', status: 'dropped', preview: [] }] });
    const draft = vi.fn(() => throwError(() => new AnimationFailure('missing', 'gone')));
    await resume(store, { animation: { draft } as unknown as AnimationPort });
    expect(draft).not.toHaveBeenCalled();
    expect(store.flow()?.steps.parts.status).toBe('waiting');
  });

  it('fails a step that was running with nothing on the server to read, as interrupted', async () => {
    const store = open({ song: 'done', map: 'done', design: 'running' }, { pieceId: undefined });
    store.setRefs({});
    await resume(store, {});
    expect(store.flow()?.steps.design).toMatchObject({ status: 'failed', reason: INTERRUPTED });
  });

  it('changes nothing when the server cannot answer', async () => {
    const store = open({ render: 'running' }, { pieceId: 'p1' });
    const before = JSON.stringify(store.flow()?.steps);
    await resume(store, { animation: { piece: () => throwError(() => new AnimationFailure('unavailable', 'down')) } as unknown as AnimationPort });
    expect(JSON.stringify(store.flow()?.steps)).toBe(before);
  });

  it('does nothing without an open flow', async () => {
    const store = new FlowStore(new FlowStorage('motion-edit', kv()));
    await expect(resume(store, {})).resolves.toBeUndefined();
  });
});
