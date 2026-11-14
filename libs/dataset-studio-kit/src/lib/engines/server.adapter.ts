import type { ApiClient } from '@lab/api-client';
import type { AnimationPort } from '@lab/animation-core';
import { type Observable, catchError, defer, forkJoin, map, of, switchMap } from 'rxjs';

import type { EnginesQuery } from '../kinds/kinds';
import type { EngineCard, EngineState, EnginesView } from './model';
import type { EnginesPort } from './port';

/** What the adapter uses of the API client (the typed paths are the contract's; the answers are read leniently, as a server may add fields). */
export type EnginesApi = Pick<ApiClient, 'get' | 'post'>;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const MUSIC_NAMES: Record<string, string> = { 'ace-step': 'ACE-Step', heartmula: 'HeartMuLa', diffrhythm2: 'DiffRhythm2' };
/** The size a picture is timed at when the catalog's preset does not say. */
const DEFAULT_RESOLUTION = '1024x1024';

/** The state of a music service from what the server says of it: running or reachable is ready; stopped and `not_running` can be started. */
export function musicState(entry: Obj): { state: EngineState; reason?: string } {
  const container = str(obj(entry['container'])['state']);
  const reason = str(entry['reason']);
  if (entry['available'] === true) return { state: 'ready' };
  if (container === 'starting') return { state: 'starting' };
  if (reason === 'not_running' || container === 'stopped') return { state: 'stopped', reason: reason || 'not_running' };
  return { state: 'unavailable', ...(reason ? { reason } : {}) };
}

/** What the studio reads of the server for its Engines panels, through the typed client and the catalog's port. Nothing here is cached or tabulated. */
export class ServerEngines implements EnginesPort {
  constructor(
    private readonly api: EnginesApi,
    private readonly animation: Pick<AnimationPort, 'catalog'>,
    /** The language the catalog's names and descriptions are asked for (it carries both). */
    private readonly lang: 'es' | 'en' = 'en',
  ) {}

  load(query: EnginesQuery): Observable<EnginesView> {
    switch (query) {
      case 'music-engines':
        return this.music();
      case 'generation-options':
        return this.video();
      case 'image-models':
        return this.images();
      case 'graphics':
        return this.graphics();
      case 'piece-catalog':
        return this.piece();
    }
  }

  startMusic(engine: string): Observable<void> {
    return defer(() => this.api.post('/api/music/engines/{engine}/start', { path: { engine } } as never)).pipe(map(() => undefined));
  }

  private music(): Observable<EnginesView> {
    return defer(() => this.api.get('/api/music/engines')).pipe(
      map((answer) => {
        const engines = obj(obj(answer)['engines']);
        // ACE-Step is the default generator and is not in the list of optional services: it is there when the music models are.
        const cards: EngineCard[] = [{ id: 'ace-step', name: MUSIC_NAMES['ace-step'], state: 'ready', source: 'none', isDefault: true }];
        for (const id of ['heartmula', 'diffrhythm2']) {
          const entry = obj(engines[id]);
          if (!Object.keys(entry).length) continue;
          const s = musicState(entry);
          cards.push({ id, name: MUSIC_NAMES[id], state: s.state, ...(s.reason ? { reason: s.reason } : {}), ...(str(entry['detail']) ? { description: str(entry['detail']) } : {}), source: 'none' });
        }
        return { kind: 'music', cards } as EnginesView;
      }),
    );
  }

  private video(): Observable<EnginesView> {
    return defer(() => this.api.get('/api/generation/options')).pipe(
      map((answer) => {
        const cards = list(obj(answer)['video']).map((o): EngineCard => {
          const seconds = num(o['estimate']);
          return {
            id: str(o['id']),
            name: str(o['name']) || str(o['id']),
            state: o['available'] === false ? 'unavailable' : 'ready',
            ...(str(o['reason']) ? { reason: str(o['reason']) } : {}),
            ...(str(o['description']) ? { description: str(o['description']) } : {}),
            audio: o['audio'] === true,
            ...(num(o['clip_seconds']) !== undefined ? { clipSeconds: num(o['clip_seconds']) } : {}),
            ...(seconds !== undefined ? { seconds } : {}),
            source: seconds !== undefined ? 'server' : 'none',
            isDefault: o['default'] === true,
          };
        });
        return { kind: 'video', cards } as EnginesView;
      }),
    );
  }

  /**
   * The image models the person can pick: the installed entries of the catalog that are models of a project (not the retouch editors, which have `edit`, and not their support files: text encoders, VAEs), each with the history's
   * time per picture when there is enough and, when not, the catalog's own table (the size and steps it was timed at, and whether it was measured). The catalog also tags each with its styles, which is what a look matches on.
   */
  private images(): Observable<EnginesView> {
    return forkJoin({
      catalog: defer(() => this.api.get('/api/assets/catalog')),
      environment: defer(() => this.api.get('/api/environment')).pipe(catchError(() => of({}))),
    }).pipe(
      switchMap(({ catalog, environment }) => {
        const entries = list(obj(catalog)['entries']).filter((e) => str(e['kind']) === 'model' && e['installed'] === true && e['edit'] !== true);
        const gpu = str(list(obj(environment)['gpus'])[0]?.['name']);
        if (!entries.length) return of({ kind: 'images', cards: [] } as EnginesView);
        return forkJoin(
          entries.map((entry) => {
            const files = list(entry['files']);
            const file = str((files.find((f) => str(f['role']) === 'model') ?? files[0])?.['name']);
            const timing = obj(entry['timing']);
            const preset = obj(entry['preset']);
            const resolution = str(preset['resolution']) || str(timing['resolution']) || DEFAULT_RESOLUTION;
            const english = this.lang === 'en';
            const name = (english ? str(entry['name_en']) : '') || str(entry['name']) || file;
            const description = (english ? str(entry['description_en']) : '') || str(entry['description']);
            const tableSeconds = num(timing['seconds']);
            const styles = Array.isArray(entry['styles']) ? (entry['styles'] as unknown[]).map(String) : [];
            const base: EngineCard = {
              id: file,
              name,
              state: 'ready',
              ...(description ? { description } : {}),
              ...(styles.length ? { styles } : {}),
              ...(num(entry['style_rank']) !== undefined ? { rank: num(entry['style_rank']) } : {}),
              ...(tableSeconds !== undefined ? { seconds: tableSeconds, source: 'catalog' as const, sourceNote: str(timing['resolution']), measured: timing['measured'] === true } : { source: 'none' as const }),
            };
            if (!gpu || !file) return of(base);
            return defer(() => this.api.get('/api/stats/phase-duration', { query: { phase: 'render', model: file, resolution, gpu } } as never)).pipe(
              map((d): EngineCard => {
                const median = num(obj(d)['median_seconds']);
                return obj(d)['enough'] === true && median !== undefined ? { ...base, seconds: median, source: 'history', sourceNote: undefined, measured: undefined } : base;
              }),
              catchError(() => of(base)),
            );
          }),
        ).pipe(map((cards) => ({ kind: 'images', cards }) as EnginesView));
      }),
    );
  }

  private graphics(): Observable<EnginesView> {
    return forkJoin({
      environment: defer(() => this.api.get('/api/environment')).pipe(catchError(() => of({}))),
      catalog: this.animation.catalog().pipe(catchError(() => of(null))),
    }).pipe(
      map(({ environment, catalog }) => ({
        kind: 'graphics',
        chrome: list(obj(environment)['binaries']).some((b) => /chrom/i.test(str(b['name'])) && b['present'] === true),
        parts: catalog?.parts.length ?? 0,
      }) as EnginesView),
    );
  }

  private piece(): Observable<EnginesView> {
    return this.animation.catalog().pipe(
      map((c) => ({ kind: 'piece', styles: c.styles.map((s) => String(s)), levels: c.levels.map((l) => String(l)), frameRates: c.frameRates, features: c.features }) as EnginesView),
    );
  }
}
