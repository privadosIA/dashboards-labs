import type { ApiClient } from '@lab/api-client';
import { ApiError } from '@lab/api-client';
import { type Observable, catchError, concatMap, from, map, of, throwError } from 'rxjs';

import {
  type BackendId,
  type CatalogPage,
  type CatalogQuery,
  type ContainerState,
  type Engines,
  type Generation,
  type GenerationRequest,
  type ImportRequest,
  type InstallJob,
  type InstallOptions,
  type InstallPlan,
  LibraryFailed,
  type ModelBackend,
  type ModelLibraryPort,
  type ModelFileStep,
  type ModelPack,
} from './port';

/** What the adapter uses of the API client. */
export type LibraryApi = Pick<ApiClient, 'get' | 'getBlob' | 'post' | 'postForm' | 'put' | 'delete' | 'downloadAt'>;

/** A refusal as the library's views read it: the status and the server's words. */
const failing = <T>() =>
  catchError<T, Observable<never>>((e) => throwError(() => (e instanceof LibraryFailed ? e : e instanceof ApiError ? new LibraryFailed(e.status, e.message, e.reason ?? '') : new LibraryFailed(0, e instanceof Error ? e.message : String(e)))));

/** The server's 3D model library (`/api/models3d/`) through the typed client, for the dashboards that talk to the server with it (the animation windows). */
export class ApiModelLibrary implements ModelLibraryPort {
  /** `client` is the name the server labels a generation with (the dashboard that asks). */
  constructor(
    private readonly api: LibraryApi,
    private readonly client?: string,
  ) {}

  packs(): Observable<ModelPack[]> {
    return this.api.get('/api/models3d/packs').pipe(map((r) => r.packs as ModelPack[]), failing());
  }

  pack(id: string): Observable<ModelPack> {
    return this.api.get('/api/models3d/packs/{id}', { path: { id } }).pipe(map((p) => p as ModelPack), failing());
  }

  install(id: string): Observable<ModelPack> {
    return this.api.post('/api/models3d/packs/{id}/install', { path: { id } }).pipe(map((p) => p as ModelPack), failing());
  }

  cancel(id: string): Observable<ModelPack> {
    return this.api.post('/api/models3d/packs/{id}/cancel', { path: { id } }).pipe(map((p) => p as ModelPack), failing());
  }

  remove(id: string): Observable<void> {
    return this.api.delete('/api/models3d/packs/{id}', { path: { id } }).pipe(map(() => undefined), failing());
  }

  importPack(request: ImportRequest): Observable<ModelPack> {
    const query = { id: request.id, licence: request.licence, ...(request.name ? { name: request.name } : {}), ...(request.author ? { author: request.author } : {}), ...(request.sourceUrl ? { source_url: request.sourceUrl } : {}) };
    // the body is the zip as it is; the typed client sends it untouched
    return this.api.post('/api/models3d/packs/import', { query, body: request.file } as never).pipe(map((p) => p as ModelPack), failing());
  }

  catalog(query: CatalogQuery): Observable<CatalogPage> {
    const q = { ...(query.q ? { q: query.q } : {}), ...(query.pack ? { pack: query.pack } : {}), ...(query.tag ? { tag: query.tag } : {}), ...(query.hasClips ? { has_clips: true } : {}), ...(query.source ? { source: query.source } : {}), ...(query.engine ? { engine: query.engine } : {}), ...(query.project ? { project: query.project } : {}), ...(query.limit ? { limit: query.limit } : {}), ...(query.offset ? { offset: query.offset } : {}) };
    return this.api.get('/api/models3d/models', { query: q } as never).pipe(map((r) => r as unknown as CatalogPage), failing());
  }

  thumbnail(pack: string, name: string): Observable<Blob> {
    return this.api.getBlob('/api/models3d/models/{pack}/{name}/thumbnail', { path: { pack, name } }).pipe(map((r) => r.body), failing());
  }

  file(pack: string, name: string): Observable<ModelFileStep> {
    // read by address, not by the typed client: its blob read says nothing of how far the download has got
    const address = `/api/models3d/models/${encodeURIComponent(pack)}/${encodeURIComponent(name)}/file`;
    return this.api.downloadAt(address).pipe(
      concatMap((step) => (step.body ? from(step.body.arrayBuffer()).pipe(map((bytes) => ({ loaded: step.loaded, total: step.total, bytes }))) : of({ loaded: step.loaded, total: step.total }))),
      failing(),
    );
  }

  engines(): Observable<Engines | null> {
    return this.api.get('/api/models3d/engines').pipe(
      map((r) => r.engines as Engines),
      // a server with no 3D service answers 503: that is "no engines", not a failure
      catchError((e) => (e instanceof ApiError && e.status === 503 ? of(null) : throwError(() => e))),
      failing(),
    );
  }

  startEngine(engine: string): Observable<ContainerState> {
    return this.api.post('/api/models3d/engines/{engine}/start', { path: { engine } } as never).pipe(map((r) => (r as { container: ContainerState }).container), failing());
  }

  stopEngine(engine: string): Observable<ContainerState> {
    return this.api.post('/api/models3d/engines/{engine}/stop', { path: { engine } } as never).pipe(map((r) => (r as { container: ContainerState }).container), failing());
  }

  modelBackend(): Observable<ModelBackend | null> {
    // an older server has no `model3d` block: that is "not said", not a failure
    return this.api.get('/api/settings').pipe(
      map((s) => {
        const block = (s as { model3d?: { backend: string; backend_source: 'setting' | 'default' } }).model3d;
        return block ? { backend: block.backend, source: block.backend_source } : null;
      }),
      failing(),
    );
  }

  setModelBackend(value: BackendId | ''): Observable<ModelBackend> {
    return this.api.put('/api/settings', { body: { model3d_backend: value } } as never).pipe(
      map((s) => {
        const block = (s as { model3d: { backend: string; backend_source: 'setting' | 'default' } }).model3d;
        return { backend: block.backend, source: block.backend_source };
      }),
      failing(),
    );
  }

  installPlan(engine: string, options: InstallOptions = {}): Observable<InstallPlan> {
    return this.api.post('/api/models3d/engines/{engine}/install', { path: { engine }, body: this.installBody(options, false) } as never).pipe(map((r) => (r as { plan: InstallPlan }).plan), failing());
  }

  startInstall(engine: string, options: InstallOptions = {}): Observable<InstallJob> {
    return this.api.post('/api/models3d/engines/{engine}/install', { path: { engine }, body: this.installBody(options, true) } as never).pipe(map((r) => (r as { install: InstallJob }).install), failing());
  }

  private installBody(options: InstallOptions, confirm: boolean): Record<string, unknown> {
    return { ...(options.backend ? { backend: options.backend } : {}), ...(options.parts ? { parts: options.parts } : {}), ...(confirm ? { confirm: true } : {}) };
  }

  installJob(id: string): Observable<InstallJob> {
    return this.api.get('/api/models3d/installs/{id}', { path: { id } }).pipe(map((j) => j as InstallJob), failing());
  }

  cancelInstall(id: string): Observable<InstallJob> {
    return this.api.post('/api/models3d/installs/{id}/cancel', { path: { id } }).pipe(map((j) => j as InstallJob), failing());
  }

  generate(request: GenerationRequest): Observable<Generation> {
    const fields = { ...(request.engine ? { engine: request.engine } : {}), ...(request.detail ? { detail: request.detail } : {}), ...(request.name ? { name: request.name } : {}), ...(this.client ? { client: this.client } : {}), ...(request.adult ? { adult: request.adult } : {}) };
    if (request.image) {
      // a picture goes as multipart, with the other fields as text
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
      form.append('image', request.image, request.image.name);
      return this.api.postForm('/api/models3d/generations', form).pipe(map((g) => g as Generation), failing());
    }
    return this.api.post('/api/models3d/generations', { body: { prompt: request.prompt, ...fields } } as never).pipe(map((g) => g as Generation), failing());
  }

  generations(): Observable<Generation[]> {
    return this.api.get('/api/models3d/generations').pipe(map((r) => r as unknown as Generation[]), failing());
  }

  generation(id: string): Observable<Generation> {
    return this.api.get('/api/models3d/generations/{id}', { path: { id } }).pipe(map((g) => g as Generation), failing());
  }

  cancelGeneration(id: string): Observable<Generation> {
    return this.api.post('/api/models3d/generations/{id}/cancel', { path: { id } }).pipe(map((g) => g as Generation), failing());
  }

  deleteGeneration(id: string): Observable<void> {
    return this.api.delete('/api/models3d/generations/{id}', { path: { id } }).pipe(map(() => undefined), failing());
  }
}
