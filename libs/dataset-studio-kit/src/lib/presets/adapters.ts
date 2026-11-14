import { ApiError, type ApiClient } from '@lab/api-client';
import { type Observable, catchError, defer, from, map, of, switchMap, throwError } from 'rxjs';

import { type ImportReport, type NewPreset, PromptsUnavailable, type Preset, type PresetBundle, type PresetList, type PresetQuery } from './model';
import { type PresetStore, MemoryPresetStore } from './own-store';
import type { PromptsPort } from './port';
import { readBundle, searchPresets } from './rank';
import sample from './sample/presets-sample.json';

const newId = (): string => `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const stamp = (): string => new Date().toISOString();

/** The sample written for this repository (CC0), as presets with ids and dates. */
export function bundledPresets(): Preset[] {
  const bundle = sample as unknown as PresetBundle;
  return readBundle(bundle, []).toAdd.map((p, i) => ({ ...p, id: `sample-${i + 1}`, own: false, created_at: '2026-11-13T00:00:00.000Z' }));
}

/** Presets with no server: the bundled sample plus what a store holds (the person's own and the imported). Every id is the store's own. What the store holds is read once and kept, so that searching a large bundle does not read it again at every key. */
export class LocalPrompts implements PromptsPort {
  private readonly bundled = bundledPresets();
  private kept: Preset[] | null = null;
  constructor(private readonly store: PresetStore = new MemoryPresetStore()) {}

  private keptPresets(): Observable<Preset[]> {
    if (this.kept) return of(this.kept);
    return defer(() => from(this.store.all())).pipe(
      map((rows) => {
        this.kept ??= rows;
        return this.kept;
      }),
    );
  }

  private all(): Observable<Preset[]> {
    return this.keptPresets().pipe(map((kept) => [...this.bundled, ...kept]));
  }

  list(query: PresetQuery): Observable<PresetList> {
    return this.all().pipe(map((all) => searchPresets(all, query)));
  }

  add(preset: NewPreset): Observable<Preset> {
    const made: Preset = { ...preset, id: newId(), own: true, created_at: stamp() };
    return this.keptPresets().pipe(
      switchMap((kept) => from(this.store.put([made])).pipe(map(() => (kept.push(made), made)))),
    );
  }

  remove(id: string): Observable<void> {
    return this.all().pipe(
      switchMap((all) => {
        const found = all.find((p) => p.id === id);
        if (!found) return throwError(() => new Error('There is no such preset.'));
        if (!found.own) return throwError(() => new Error('A bundled or imported preset is read-only: only your own can be deleted.'));
        return from(this.store.delete(id)).pipe(
          map(() => {
            if (this.kept) this.kept = this.kept.filter((p) => p.id !== id);
          }),
        );
      }),
    );
  }

  importBundle(bundle: unknown): Observable<ImportReport> {
    return this.all().pipe(
      switchMap((all) => {
        const { toAdd, report } = readBundle(bundle, all);
        const made = toAdd.map((p): Preset => ({ ...p, id: newId(), own: false, created_at: stamp() }));
        return from(this.store.put(made)).pipe(
          map(() => {
            this.kept = [...(this.kept ?? []), ...made];
            return report;
          }),
        );
      }),
    );
  }
}

/** What the adapter uses of the API client. */
export type PromptsApi = Pick<ApiClient, 'get' | 'post' | 'delete'>;

/** The most presets the server lists in one call. */
export const SERVER_MAX_LIMIT = 200;

const unavailable = (e: unknown): boolean => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

/**
 * The server's store (`/api/prompts`, requested: it is not in the contract yet). A server that lacks it answers `404`, and the adapter says `PromptsUnavailable`, so that the page can fall back
 * to the bundled sample and the person's own presets in the browser.
 */
export class ServerPrompts implements PromptsPort {
  constructor(private readonly api: PromptsApi) {}

  list(query: PresetQuery): Observable<PresetList> {
    // the server answers at most 200 and refuses more
    const params = { ...(query.kind ? { kind: query.kind } : {}), ...(query.q ? { q: query.q } : {}), ...(query.tags?.length ? { tags: query.tags.join(',') } : {}), limit: Math.min(query.limit ?? 50, SERVER_MAX_LIMIT) };
    return defer(() => (this.api as unknown as { get: (p: string, o: unknown) => Observable<unknown> }).get('/api/prompts', { query: params })).pipe(
      map((answer) => {
        const a = answer as { items?: Preset[]; total?: number };
        return { items: a.items ?? [], total: a.total ?? a.items?.length ?? 0 };
      }),
      catchError((e) => throwError(() => (unavailable(e) ? new PromptsUnavailable() : e))),
    );
  }

  add(preset: NewPreset): Observable<Preset> {
    return defer(() => (this.api as unknown as { post: (p: string, o: unknown) => Observable<unknown> }).post('/api/prompts', { body: { kind: preset.kind, title: preset.title, prompt: preset.prompt, ...(preset.negative ? { negative: preset.negative } : {}), tags: preset.tags, ...(preset.engine ? { engine: preset.engine } : {}), language: preset.language } })).pipe(
      map((a) => a as Preset),
      catchError((e) => throwError(() => (unavailable(e) ? new PromptsUnavailable() : e))),
    );
  }

  remove(id: string): Observable<void> {
    return defer(() => (this.api as unknown as { delete: (p: string, o: unknown) => Observable<unknown> }).delete('/api/prompts/{id}', { path: { id } })).pipe(
      map(() => undefined),
      // 404 on a delete is a missing preset, not a missing store: the server that has the route answers it; a bundled one is `403`
      catchError((e) => throwError(() => (e instanceof ApiError && e.status === 403 ? new Error('A bundled or imported preset is read-only: only your own can be deleted.') : unavailable(e) && !(e instanceof ApiError && e.code === 'not_found') ? new PromptsUnavailable() : e))),
    );
  }

  importBundle(bundle: unknown): Observable<ImportReport> {
    return defer(() => (this.api as unknown as { post: (p: string, o: unknown) => Observable<unknown> }).post('/api/prompts/import', { body: bundle })).pipe(
      map((a) => {
        const r = a as { added?: number; already?: number; refused?: ImportReport['refused'] };
        return { added: r.added ?? 0, already: r.already ?? 0, refused: r.refused ?? [] };
      }),
      catchError((e) => throwError(() => (unavailable(e) ? new PromptsUnavailable() : e))),
    );
  }
}

/** The server's store when it has one, else the local one: the first call that finds no `/api/prompts` settles it for the life of the page. */
export class FallbackPrompts implements PromptsPort {
  private useLocal = false;
  constructor(
    private readonly server: PromptsPort,
    private readonly local: PromptsPort,
  ) {}

  /** Whether the shared store of the server is in use (the page says so when it is not). */
  get shared(): boolean {
    return !this.useLocal;
  }

  private via<T>(call: (p: PromptsPort) => Observable<T>): Observable<T> {
    if (this.useLocal) return call(this.local);
    return call(this.server).pipe(
      catchError((e) => {
        if (!(e instanceof PromptsUnavailable)) return throwError(() => e);
        this.useLocal = true;
        return call(this.local);
      }),
    );
  }

  list(query: PresetQuery): Observable<PresetList> {
    return this.via((p) => p.list(query));
  }
  add(preset: NewPreset): Observable<Preset> {
    return this.via((p) => p.add(preset));
  }
  remove(id: string): Observable<void> {
    return this.via((p) => p.remove(id));
  }
  importBundle(bundle: unknown): Observable<ImportReport> {
    return this.via((p) => p.importBundle(bundle));
  }
}

