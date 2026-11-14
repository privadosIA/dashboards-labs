import type { AnimationPort, Song as LibrarySong } from '@lab/animation-core';
import { EngineFailed, type EngineStatus, type GeneratorName, type SongPort, type SongRequest } from '@lab/music-studio-kit';
import { type Observable, map, of, switchMap, takeWhile, throwError, timer } from 'rxjs';

import type { StepEvent } from '../execute';
import type { Plan } from '../model';

export const LIBRARY_POLL_MS = 2000;
export const LIBRARY_TIMEOUT_MS = 60_000;

/** The animation library did not list the song within the time given: the card offers Retry. */
export class LibraryLag extends Error {
  constructor(readonly songId: string) {
    super(`the library does not list song ${songId} yet`);
    this.name = 'LibraryLag';
  }
}

export interface EnginesCheck {
  generator: GeneratorName;
  /** The chosen generator can make the song now. */
  ok: boolean;
  /** Why it cannot, as the server says it (`not_running`, `no_weights`, …), and its detail. */
  reason?: string;
  detail?: string;
  /** The other generators that can be used now. */
  others: GeneratorName[];
}

/** Which generators can be used now: the chosen one, and the ones to offer instead. */
export function checkEngines(songs: SongPort, generator: GeneratorName): Observable<EnginesCheck> {
  return songs.engines().pipe(
    map((list: readonly EngineStatus[]) => {
      const mine = list.find((e) => e.generator === generator);
      return {
        generator,
        ok: mine?.available === true,
        ...(mine?.reason ? { reason: mine.reason } : {}),
        ...(mine?.detail ? { detail: mine.detail } : {}),
        others: list.filter((e) => e.generator !== generator && e.available).map((e) => e.generator),
      };
    }),
  );
}

/** A stopped container can be started from the card (`not_running`); any other reason cannot. */
export const canStart = (check: EnginesCheck): boolean => !check.ok && check.reason === 'not_running' && check.generator !== 'ace-step';

/** The song as the studio takes it: the plan's texts, the title never empty. */
export function songRequest(song: Plan['song']): SongRequest {
  return { title: song.title.trim() || 'Untitled', lyrics: song.lyrics, style: song.style, generator: song.generator, instrumental: song.instrumental, ...(song.seconds ? { seconds: song.seconds } : {}) };
}

/** Starts the container of the chosen generator; errors with `EngineFailed` when the server says no. */
export const startEngine = (songs: SongPort, generator: GeneratorName): Observable<void> => (generator === 'ace-step' ? throwError(() => new EngineFailed('refused', 'ace-step has no container to start')) : songs.start(generator));

/** Follows a song to the end: progress as it queues and runs, then `done` with its address and length. A song that fails or is cancelled errors with the reason. */
export function followSong(songs: SongPort, id: string): Observable<StepEvent> {
  return songs.follow(id).pipe(
    map((s): StepEvent => {
      const state = s.state;
      if (state.phase === 'failed') throw new Error(state.reason);
      if (state.phase === 'cancelled') throw new Error('cancelled');
      if (state.phase === 'done') return { kind: 'done', result: { songId: s.id, title: s.title, url: state.url, seconds: state.seconds }, refs: { songId: s.id } };
      return { kind: 'progress', info: { phase: state.phase, ...(state.phase === 'queued' && state.position ? { position: state.position } : {}) } };
    }),
    takeWhile((e) => e.kind !== 'done', true),
  );
}

/** Makes the song and follows it to the end. */
export const makeSong = (songs: SongPort, song: Plan['song']): Observable<StepEvent> => songs.generate(songRequest(song)).pipe(switchMap((created) => followSong(songs, created.id)));

export type LibraryEvent = { waiting: number } | { found: LibrarySong };

/**
 * Waits until the animation library lists the song made as music project `projectId`: asks every `pollMs`, says how many seconds are left (the card counts them down) and
 * errors with `LibraryLag` when `timeoutMs` pass. In memory mode the song is added to the library first (`addSong`), as the studio's in-memory port knows nothing of it.
 */
export function waitForLibrary(
  animation: AnimationPort,
  song: { projectId: string; title: string; seconds: number; instrumental: boolean; lyrics?: string },
  options: { pollMs?: number; timeoutMs?: number; memory?: { addSong: (s: { project: string; title: string; seconds: number; instrumental: boolean; lyrics?: string }) => Observable<unknown> } } = {},
): Observable<LibraryEvent> {
  const pollMs = options.pollMs ?? LIBRARY_POLL_MS;
  const timeoutMs = options.timeoutMs ?? LIBRARY_TIMEOUT_MS;
  const added = options.memory ? options.memory.addSong({ project: song.projectId, title: song.title, seconds: song.seconds, instrumental: song.instrumental, ...(song.lyrics ? { lyrics: song.lyrics } : {}) }) : of(undefined);
  return added.pipe(
    switchMap(() => timer(0, pollMs)),
    switchMap((i) =>
      animation.songs().pipe(
        map((list): LibraryEvent => {
          const found = list.find((s) => s.project === song.projectId);
          if (found) return { found };
          if (i * pollMs >= timeoutMs) throw new LibraryLag(song.projectId);
          return { waiting: Math.max(0, Math.ceil((timeoutMs - i * pollMs) / 1000)) };
        }),
      ),
    ),
    takeWhile((e) => !('found' in e), true),
  );
}
