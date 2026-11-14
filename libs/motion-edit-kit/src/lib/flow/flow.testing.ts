import { DEFAULT_RESOLUTION } from '@lab/animation-core';
import type { EngineStatus, Song, SongPort, SongRequest, SongState } from '@lab/music-studio-kit';
import { BehaviorSubject, EMPTY, type Observable, of } from 'rxjs';

import { FlowStorage } from './flow.storage';
import { FlowStore } from './flow.store';
import type { Plan } from './model';

/** Helpers of the specs of the flow (not part of the library's API). */

export const testPlan = (parts: Plan['parts'] = []): Plan => ({
  song: { title: 'Night Drive', lyrics: '[verse]\nla la', style: 'synthwave', generator: 'ace-step', instrumental: false },
  animation: { choices: { style: 'typographic', level: 'simple', fps: 30, resolution: DEFAULT_RESOLUTION, prompt: 'a neon track' } },
  parts,
});

export const memoryFlowStore = (): FlowStore => {
  const data: Record<string, string> = {};
  let t = 1000;
  let n = 0;
  return new FlowStore(new FlowStorage('motion-edit', { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }), { now: () => (t += 10), newId: () => `flow-${++n}` });
};

/** A song port the spec drives: `generate` makes a song that stays queued until `finish` or `fail` says otherwise. */
export class FakeSongs {
  readonly requests: SongRequest[] = [];
  readonly started: string[] = [];
  engines$ = new BehaviorSubject<readonly EngineStatus[]>([
    { generator: 'ace-step', available: true },
    { generator: 'heartmula', available: true },
    { generator: 'diffrhythm2', available: true },
  ]);
  private readonly songs = new Map<string, BehaviorSubject<Song>>();
  private counter = 0;

  engines = (): Observable<readonly EngineStatus[]> => this.engines$.asObservable();
  start = (engine: string): Observable<void> => {
    this.started.push(engine);
    return of(undefined);
  };
  generate = (request: SongRequest): Observable<Song> => {
    this.requests.push(request);
    const song: Song = { id: `song-${++this.counter}`, title: request.title, style: request.style, lyrics: request.lyrics, instrumental: request.instrumental, generator: request.generator, createdAt: 1, state: { phase: 'queued', position: 1 } };
    this.songs.set(song.id, new BehaviorSubject(song));
    return of(song);
  };
  follow = (id: string): Observable<Song> => this.songs.get(id)?.asObservable() ?? EMPTY;
  write = (): Observable<{ title: string; lyrics: string; style: string }> => of({ title: 'Night Drive', lyrics: '[verse]\nla', style: 'synthwave' });
  set(id: string, state: SongState): void {
    const subject = this.songs.get(id);
    if (subject) subject.next({ ...subject.value, state });
  }
  finish(id: string, seconds = 90): void {
    this.set(id, { phase: 'done', url: `/audio/${id}.wav`, seconds });
  }
  port(): SongPort {
    return this as unknown as SongPort;
  }
}

/** A flow whose piece is made and whose steps up to the map are done, so the Design card has something to propose for. */
export async function flowWithPiece(store: FlowStore, animation: import('@lab/animation-core').AnimationPort, plan: Plan = testPlan()): Promise<string> {
  const { firstValueFrom } = await import('rxjs');
  const song = (await firstValueFrom(animation.songs()))[0];
  const piece = await firstValueFrom(animation.create(song, plan.animation.choices));
  store.start('a neon track', plan);
  store.setRefs({ songId: song.project, libraryKey: song.key, pieceId: piece.id });
  for (const step of ['song', 'map'] as const) {
    store.run(step);
    store.complete(step, {});
    store.continue();
  }
  return piece.id;
}

export { FAKE_BUILTIN, FAKE_ROUTER, FakeProviders, settle } from '@lab/assist-kit/testing';
