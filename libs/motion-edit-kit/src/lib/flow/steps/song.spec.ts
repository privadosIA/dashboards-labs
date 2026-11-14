import type { AnimationPort } from '@lab/animation-core';
import { EngineFailed, type EngineStatus, type Song, type SongPort, type SongState } from '@lab/music-studio-kit';
import { BehaviorSubject, EMPTY, type Observable, firstValueFrom, lastValueFrom, of, toArray } from 'rxjs';

import { LibraryLag, canStart, checkEngines, makeSong, songRequest, startEngine, waitForLibrary } from './song';

const song = (state: SongState): Song => ({ id: 'song-1', title: 'Night Drive', style: 's', lyrics: '', instrumental: true, generator: 'ace-step', createdAt: 1, state });
const plan = { title: ' Night Drive ', lyrics: '', style: 'synthwave', generator: 'ace-step', instrumental: true } as const;

describe('the song step', () => {
  describe('the engines', () => {
    const engines = (list: EngineStatus[]) => ({ engines: () => of(list) }) as unknown as SongPort;

    it('says the chosen generator can be used and which others can', async () => {
      const check = await firstValueFrom(checkEngines(engines([{ generator: 'ace-step', available: true }, { generator: 'heartmula', available: true }, { generator: 'diffrhythm2', available: false, reason: 'not_running' }]), 'ace-step'));
      expect(check).toEqual({ generator: 'ace-step', ok: true, others: ['heartmula'] });
    });

    it('says why a generator cannot be used and whether the card can start it', async () => {
      const stopped = await firstValueFrom(checkEngines(engines([{ generator: 'ace-step', available: true }, { generator: 'heartmula', available: false, reason: 'not_running', detail: 'container is stopped' }]), 'heartmula'));
      expect(stopped).toMatchObject({ ok: false, reason: 'not_running', detail: 'container is stopped', others: ['ace-step'] });
      expect(canStart(stopped)).toBe(true);
      const noWeights = await firstValueFrom(checkEngines(engines([{ generator: 'heartmula', available: false, reason: 'no_weights' }]), 'heartmula'));
      expect(canStart(noWeights)).toBe(false);
    });

    it('starts a container through the port, and refuses to start ACE-Step, which has none', async () => {
      const start = vi.fn(() => of(undefined));
      await firstValueFrom(startEngine({ start } as unknown as SongPort, 'heartmula'));
      expect(start).toHaveBeenCalledWith('heartmula');
      await expect(firstValueFrom(startEngine({ start } as unknown as SongPort, 'ace-step'))).rejects.toBeInstanceOf(EngineFailed);
    });
  });

  it('asks for the song with the plan texts and a title that is never empty', () => {
    expect(songRequest(plan)).toEqual({ title: 'Night Drive', lyrics: '', style: 'synthwave', generator: 'ace-step', instrumental: true });
    expect(songRequest({ ...plan, title: '  ' }).title).toBe('Untitled');
    expect(songRequest({ ...plan, seconds: 45 }).seconds).toBe(45);
    expect('seconds' in songRequest(plan)).toBe(false);
  });

  describe('making the song', () => {
    const port = (states: SongState[]) => ({ generate: () => of(song({ phase: 'queued' })), follow: () => of(...states.map(song)) }) as unknown as SongPort;

    it('reports the song queued and running and ends with its address, length and id', async () => {
      const events = await lastValueFrom(makeSong(port([{ phase: 'queued', position: 2 }, { phase: 'running' }, { phase: 'done', url: 'a.wav', seconds: 90 }]), plan).pipe(toArray()));
      expect(events).toEqual([
        { kind: 'progress', info: { phase: 'queued', position: 2 } },
        { kind: 'progress', info: { phase: 'running' } },
        { kind: 'done', result: { songId: 'song-1', title: 'Night Drive', url: 'a.wav', seconds: 90 }, refs: { songId: 'song-1' } },
      ]);
    });

    it('errors with the reason when the song fails, and when it is cancelled', async () => {
      await expect(lastValueFrom(makeSong(port([{ phase: 'running' }, { phase: 'failed', reason: 'out of memory' }]), plan))).rejects.toThrow('out of memory');
      await expect(lastValueFrom(makeSong(port([{ phase: 'cancelled' }]), plan))).rejects.toThrow('cancelled');
    });
  });

  describe('waiting for the library', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const info = { projectId: 'song-1', title: 'Night Drive', seconds: 90, instrumental: true };
    const library = (list: BehaviorSubject<readonly { project: string }[]>) => ({ songs: () => list.asObservable() }) as unknown as AnimationPort;
    const collect = (source: Observable<unknown>) => {
      const seen: unknown[] = [];
      const done = { complete: false, error: undefined as unknown };
      source.subscribe({ next: (e) => seen.push(e), complete: () => (done.complete = true), error: (e) => (done.error = e) });
      return { seen, done };
    };

    it('counts down while the song is not listed, then ends with it', async () => {
      const list = new BehaviorSubject<readonly { project: string }[]>([]);
      const run = collect(waitForLibrary(library(list), info));
      await vi.advanceTimersByTimeAsync(4000);
      expect(run.seen).toEqual([{ waiting: 60 }, { waiting: 58 }, { waiting: 56 }]);
      list.next([{ project: 'song-1' }]);
      await vi.advanceTimersByTimeAsync(2000);
      expect(run.seen.at(-1)).toEqual({ found: { project: 'song-1' } });
      expect(run.done.complete).toBe(true);
    });

    it('says the library lags after the time given, so the card can offer Retry', async () => {
      const run = collect(waitForLibrary(library(new BehaviorSubject<readonly { project: string }[]>([])), info, { pollMs: 1000, timeoutMs: 3000 }));
      await vi.advanceTimersByTimeAsync(5000);
      expect(run.done.error).toBeInstanceOf(LibraryLag);
    });

    it('adds the song to the library first when the host is in memory mode', async () => {
      const list = new BehaviorSubject<readonly { project: string }[]>([]);
      const addSong = vi.fn(() => {
        list.next([{ project: 'song-1' }]);
        return of(undefined);
      });
      const run = collect(waitForLibrary(library(list), info, { memory: { addSong } }));
      await vi.advanceTimersByTimeAsync(10);
      expect(addSong).toHaveBeenCalledWith({ project: 'song-1', title: 'Night Drive', seconds: 90, instrumental: true });
      expect(run.done.complete).toBe(true);
    });

    it('does not turn a failed library read into a lag', async () => {
      const run = collect(waitForLibrary({ songs: () => EMPTY } as unknown as AnimationPort, info, { pollMs: 1000, timeoutMs: 2000 }));
      await vi.advanceTimersByTimeAsync(5000);
      expect(run.done.error).toBeUndefined();
    });
  });
});
