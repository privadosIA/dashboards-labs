import { AnimationFailure, type AnimationPort, type Draft, type PieceDetail } from '@lab/animation-core';
import type { Song, SongPort } from '@lab/music-studio-kit';
import { type Observable, catchError, defaultIfEmpty, forkJoin, map, of, take } from 'rxjs';

import type { FlowStore } from './flow.store';
import { type StepId, stepIndex } from './model';

export interface ResumePorts {
  songs: SongPort;
  animation: AnimationPort;
}

/** The reason a step carries when the thing it refers to is gone from the server (the card says it in the person's language). */
export const GONE = 'gone';
/** The reason a running step carries when nothing on the server says how it ended (the tab was closed during it). */
export const INTERRUPTED = 'interrupted';

type Looked<T> = { found: T } | { gone: true } | { error: string };

const look = <T>(source: Observable<T | undefined>): Observable<Looked<T>> =>
  source.pipe(
    take(1),
    defaultIfEmpty(undefined as T | undefined),
    map((value): Looked<T> => (value === undefined ? { gone: true } : { found: value })),
    catchError((e: unknown) => of<Looked<T>>(e instanceof AnimationFailure && e.kind === 'missing' ? { gone: true } : { error: e instanceof Error ? e.message : String(e) })),
  );

/**
 * Brings an open flow in line with the server: what it was doing when the tab closed is shown where it really is. A song that finished (or failed) while the tab was
 * closed is read from the studio; a piece that was drawing shows its progress, its video or its error; a draft is read again; a thing that no longer exists marks its step
 * failed (`GONE`), and a step that was running with nothing on the server to read is failed as `INTERRUPTED`, with Retry. A call that cannot be answered (the server is down)
 * changes nothing: the flow is shown as it was kept.
 */
export function resumeFlow(store: FlowStore, ports: ResumePorts): Observable<void> {
  const flow = store.flow();
  if (!flow) return of(undefined);
  const { refs } = flow;
  const running = (Object.keys(flow.steps) as StepId[]).filter((s) => flow.steps[s].status === 'running');

  const song$ = refs.songId ? look<Song>(ports.songs.follow(refs.songId)) : of(undefined);
  const piece$ = refs.pieceId ? look<PieceDetail>(ports.animation.piece(refs.pieceId)) : of(undefined);
  // an approved draft is gone from the server by design (approving makes the part), and a dropped one was removed: neither is looked for
  const settled = new Set(((flow.steps.parts.result as { items?: { name: string; status: string }[] } | undefined)?.items ?? []).filter((i) => i.status === 'approved' || i.status === 'dropped').map((i) => i.name));
  const drafts$ = Object.entries(refs.drafts)
    .filter(([name]) => !settled.has(name))
    .map(([name, id]) => look<Draft>(ports.animation.draft(id)).pipe(map((found) => ({ name, found }))));

  return forkJoin([song$, piece$, drafts$.length ? forkJoin(drafts$) : of([] as { name: string; found: Looked<Draft> }[])]).pipe(
    map(([song, piece, drafts]) => {
      const handled = new Set<StepId>();

      if (song && 'gone' in song && flow.steps.song.status !== 'pending') {
        store.fail('song', GONE);
        handled.add('song');
      } else if (song && 'found' in song && flow.steps.song.status === 'running') {
        const { state } = song.found;
        if (state.phase === 'done') store.complete('song', { ...flow.steps.song.result, url: state.url, seconds: state.seconds });
        else if (state.phase === 'failed') store.fail('song', state.reason);
        else if (state.phase === 'cancelled') store.fail('song', 'cancelled');
        handled.add('song');
      }

      if (piece && 'gone' in piece) {
        // the first step that depends on the piece and has begun
        const first = (['map', 'design', 'script', 'render'] as const).find((s) => flow.steps[s].status !== 'pending' && flow.steps[s].status !== 'stale');
        if (first) {
          store.fail(first, GONE);
          handled.add(first);
        }
      } else if (piece && 'found' in piece && flow.steps.render.status === 'running') {
        const p = piece.found;
        if (p.state === 'done') store.complete('render', { ...flow.steps.render.result, video: p.video });
        else if (p.state === 'failed') store.fail('render', p.error ?? 'failed');
        handled.add('render');
      }

      for (const { name, found } of drafts) {
        if ('gone' in found && flow.steps.parts.status !== 'pending' && !handled.has('parts')) {
          store.fail('parts', `${GONE}:${name}`);
          handled.add('parts');
        }
      }

      for (const step of running) {
        // a render still drawing, or a song still being made, is followed by its card; any other running step has nothing to read
        const alive = (step === 'render' && piece && 'found' in piece && piece.found.state !== 'done' && piece.found.state !== 'failed') || (step === 'song' && song && 'found' in song && ['queued', 'running'].includes(song.found.state.phase));
        // a lookup that could not be answered says nothing about the step: it stays as it was kept
        const unknown = (piece && 'error' in piece) || (song && 'error' in song) || drafts.some((d) => 'error' in d.found);
        if (!handled.has(step) && !alive && !unknown && stepIndex(step) > 0) store.fail(step, INTERRUPTED);
      }
    }),
  );
}
