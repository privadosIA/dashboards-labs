import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  LibraryFailed,
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
  type ModelBackend,
  type ModelFileStep,
  type ModelLibraryPort,
  type ModelPack,
} from '@lab/model-library-kit';
import { type Observable, catchError, concatMap, from, map, of, switchMap, throwError } from 'rxjs';

import type { ModelInstallRequest } from './api.models';
import { ApiService } from './api.service';

/** A failed request as the library reads it: the status and the server's own words (an image request's JSON error arrives as a Blob, which is read here). */
export function libraryFailure(e: unknown): Observable<never> {
  const err = e as HttpErrorResponse;
  const said = async (): Promise<{ words: string; reason: string }> => {
    if (typeof Blob !== 'undefined' && err?.error instanceof Blob) {
      try {
        const body = JSON.parse(await err.error.text())?.error;
        return { words: body?.message ?? '', reason: body?.reason ?? '' };
      } catch {
        return { words: '', reason: '' };
      }
    }
    return { words: err?.error?.error?.message ?? err?.error?.message ?? (err?.status ? '' : (err?.message ?? '')), reason: err?.error?.error?.reason ?? '' };
  };
  return from(said()).pipe(switchMap(({ words, reason }) => throwError(() => new LibraryFailed(err?.status ?? 0, words, reason))));
}

/** The name the server labels a generation with. */
const CLIENT = 'dashboard-full';

/** The 3D model library of the server (`/api/models3d/`) for the library screens. */
@Injectable({ providedIn: 'root' })
export class ServerModelLibrary implements ModelLibraryPort {
  private readonly api = inject(ApiService);

  packs(): Observable<ModelPack[]> {
    return this.api.listModelPacks().pipe(map((r) => r.packs), catchError(libraryFailure));
  }

  pack(id: string): Observable<ModelPack> {
    return this.api.getModelPack(id).pipe(catchError(libraryFailure));
  }

  install(id: string): Observable<ModelPack> {
    return this.api.installModelPack(id).pipe(catchError(libraryFailure));
  }

  cancel(id: string): Observable<ModelPack> {
    return this.api.cancelModelPack(id).pipe(catchError(libraryFailure));
  }

  remove(id: string): Observable<void> {
    return this.api.deleteModelPack(id).pipe(catchError(libraryFailure));
  }

  importPack(request: ImportRequest): Observable<ModelPack> {
    return this.api.importModelPack({ id: request.id, licence: request.licence, name: request.name, author: request.author, source_url: request.sourceUrl }, request.file).pipe(catchError(libraryFailure));
  }

  catalog(query: CatalogQuery): Observable<CatalogPage> {
    return this.api.listLibraryModels({ q: query.q, pack: query.pack, tag: query.tag, has_clips: query.hasClips, source: query.source, engine: query.engine, project: query.project, limit: query.limit, offset: query.offset }).pipe(catchError(libraryFailure));
  }

  file(pack: string, name: string): Observable<ModelFileStep> {
    return this.api.libraryModelFile(pack, name).pipe(
      concatMap((step) => (step.body ? from(step.body.arrayBuffer()).pipe(map((bytes) => ({ loaded: step.loaded, total: step.total, bytes }))) : of({ loaded: step.loaded, total: step.total }))),
      catchError(libraryFailure),
    );
  }

  thumbnail(pack: string, name: string): Observable<Blob> {
    return this.api.libraryModelThumbnail(pack, name).pipe(catchError(libraryFailure));
  }

  engines(): Observable<Engines | null> {
    return this.api.listModelEngines().pipe(
      map((r) => r.engines as Engines),
      // a server with no 3D service answers 503: that is "no engines", not a failure
      catchError((e: HttpErrorResponse) => (e?.status === 503 ? of(null) : libraryFailure(e))),
    );
  }

  startEngine(engine: string): Observable<ContainerState> {
    return this.api.startModelEngine(engine).pipe(map((r) => r.container), catchError(libraryFailure));
  }

  stopEngine(engine: string): Observable<ContainerState> {
    return this.api.stopModelEngine(engine).pipe(map((r) => r.container), catchError(libraryFailure));
  }

  modelBackend(): Observable<ModelBackend | null> {
    return this.api.getSettings().pipe(
      map((s) => (s.model3d ? { backend: s.model3d.backend, source: s.model3d.backend_source } : null)),
      catchError(libraryFailure),
    );
  }

  setModelBackend(value: BackendId | ''): Observable<ModelBackend> {
    return this.api.putModel3dBackend(value).pipe(
      map((s) => ({ backend: s.model3d?.backend ?? 'dotnet', source: s.model3d?.backend_source ?? 'default' })),
      catchError(libraryFailure),
    );
  }

  installPlan(engine: string, options: InstallOptions = {}): Observable<InstallPlan> {
    return this.api.modelEngineInstall(engine, false, options as ModelInstallRequest).pipe(map((r) => r.plan as InstallPlan), catchError(libraryFailure));
  }

  startInstall(engine: string, options: InstallOptions = {}): Observable<InstallJob> {
    return this.api.modelEngineInstall(engine, true, options as ModelInstallRequest).pipe(map((r) => r.install as InstallJob), catchError(libraryFailure));
  }

  installJob(id: string): Observable<InstallJob> {
    return this.api.getModelInstall(id).pipe(catchError(libraryFailure));
  }

  cancelInstall(id: string): Observable<InstallJob> {
    return this.api.cancelModelInstall(id).pipe(catchError(libraryFailure));
  }

  generate(request: GenerationRequest): Observable<Generation> {
    const fields = { engine: request.engine, detail: request.detail, name: request.name, client: CLIENT, ...(request.adult ? { adult: true } : {}) };
    return this.api.createModelGeneration(request.image ? fields : { prompt: request.prompt, ...fields }, request.image).pipe(catchError(libraryFailure));
  }

  generations(): Observable<Generation[]> {
    return this.api.listModelGenerations().pipe(catchError(libraryFailure));
  }

  generation(id: string): Observable<Generation> {
    return this.api.getModelGeneration(id).pipe(catchError(libraryFailure));
  }

  cancelGeneration(id: string): Observable<Generation> {
    return this.api.cancelModelGeneration(id).pipe(catchError(libraryFailure));
  }

  deleteGeneration(id: string): Observable<void> {
    return this.api.deleteModelGeneration(id).pipe(catchError(libraryFailure));
  }
}
