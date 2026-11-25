import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BLENDER_SCENE_PORT, type BlenderScenePort, SceneFailed, type SceneContext, type SceneDescription, type SceneWritten } from '@lab/blender-scene-kit';
import { type Observable, catchError, from, map, of, switchMap, throwError } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import { EditorStore } from '../../editor.store';

/**
 * A failed request as an `HttpErrorResponse` whose body can be read: the preview asks for an image, so the server's JSON error arrives as
 * a Blob and is read here.
 */
export async function readableError(e: unknown): Promise<unknown> {
  const err = e as HttpErrorResponse;
  if (typeof Blob === 'undefined' || !(err?.error instanceof Blob)) return e;
  try {
    return new HttpErrorResponse({ status: err.status, statusText: err.statusText, error: JSON.parse(await err.error.text()) });
  } catch {
    return new HttpErrorResponse({ status: err.status, statusText: err.statusText });
  }
}

/** What a refused call says, as the block reads it: the status and the server's own words. */
export const sceneFailure = (e: unknown): SceneFailed => {
  const err = e as HttpErrorResponse;
  return new SceneFailed(err?.status ?? 0, err?.error?.error?.message ?? err?.error?.message ?? (err?.status ? '' : (err?.message ?? '')));
};

const refused = (e: unknown): Observable<never> => from(readableError(e)).pipe(switchMap((read) => throwError(() => sceneFailure(read))));

/** The 3D scene block of a project's scene: its description is the file `scope` of the project's `sources/`, written, saved and drawn by the project's operations. */
@Injectable()
export class ProjectBlenderScene implements BlenderScenePort {
  private readonly api = inject(ApiService);
  private readonly store = inject(EditorStore);

  /** A scene whose file was never written has nothing to read: the block starts empty. */
  load(scope: string): Observable<SceneDescription | null> {
    return this.api.getBlenderDescription(this.store.projectId(), scope).pipe(
      map((found): SceneDescription => ({ description: found.description, resolved: found.resolved })),
      catchError(() => of(null)),
    );
  }

  write(context: SceneContext, idea: string, current: Record<string, unknown> | null): Observable<SceneWritten> {
    return this.api.writeBlenderDescription(this.store.projectId(), context.scope, idea, context.seconds, current !== null).pipe(
      map((a): SceneWritten => ({ description: a.description, resolved: a.resolved, provider: a.provider, model: a.model, attempts: a.attempts })),
      catchError(refused),
    );
  }

  save(context: SceneContext, description: Record<string, unknown>): Observable<SceneDescription> {
    return this.api.saveBlenderDescription(this.store.projectId(), context.scope, description, context.seconds).pipe(
      map((saved): SceneDescription => ({ description: saved.description, resolved: saved.resolved })),
      catchError(refused),
    );
  }

  /** The frame of the stored description (a project's preview reads the file, so what is drawn is what was saved). */
  preview(context: SceneContext, _description: Record<string, unknown>, t: number): Observable<Blob> {
    return this.api.previewBlenderDescription(this.store.projectId(), context.scope, t, context.seconds).pipe(catchError(refused));
  }
}

/** The providers of a host that keeps the scene in a project. */
export const provideProjectBlenderScene = () => ({ provide: BLENDER_SCENE_PORT, useClass: ProjectBlenderScene });
