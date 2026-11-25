import { Injectable, inject } from '@angular/core';
import { MODEL_PLACE_PORT, type ModelCopy, type ModelPlacePort, type PlacedFile } from '@lab/model-library-kit';
import { type Observable, catchError, map } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { libraryFailure } from '../../../core/model-library.adapter';
import { ModelLibraryAvailability } from '../../../core/model-library.availability';
import { EditorStore } from '../../editor.store';

/** The models of a project: its `.glb` sources and the pictures among its sources (what the models name), kept, added and removed by the project's own source operations. */
@Injectable()
export class ProjectModelPlace implements ModelPlacePort {
  private readonly api = inject(ApiService);
  private readonly store = inject(EditorStore);
  private readonly library = inject(ModelLibraryAvailability);

  /** A server older than the library has no models to keep: nothing is offered until its packs answer. */
  readonly available = (): boolean => this.library.available();

  list(): Observable<PlacedFile[]> {
    return this.api.listSources(this.store.projectId()).pipe(
      map(({ sources }) =>
        sources
          .filter((s) => s.kind === 'model' || s.kind === 'image')
          .map((s): PlacedFile => (s.kind === 'model' ? { name: s.name, kind: 'model', size: s.size, clips: s.clips ?? [], triangles: s.triangles ?? 0, needs: s.needs ?? [] } : { name: s.name, kind: 'picture', size: s.size })),
      ),
      catchError(libraryFailure),
    );
  }

  upload(name: string, file: Blob): Observable<void> {
    return this.api.uploadSource(this.store.projectId(), name, file).pipe(
      map(() => undefined),
      catchError(libraryFailure),
    );
  }

  remove(name: string): Observable<void> {
    return this.api.deleteSource(this.store.projectId(), name).pipe(catchError(libraryFailure));
  }

  add(from: string, name?: string): Observable<ModelCopy> {
    return this.api.copyModelToProject(this.store.projectId(), from, name).pipe(
      map((r): ModelCopy => ({ name: r.body?.name ?? name ?? '', pictures: r.body?.pictures ?? [], added: r.status === 201 })),
      catchError(libraryFailure),
    );
  }
}

/** The providers of a host that keeps the scene's models in a project's sources. */
export const provideProjectModelPlace = () => ({ provide: MODEL_PLACE_PORT, useClass: ProjectModelPlace });
