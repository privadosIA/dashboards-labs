import { Observable, defer, of, throwError } from 'rxjs';

import type { BlenderScenePort, SceneContext, SceneDescription, SceneWritten } from './port';
import { SceneFailed } from './port';

/** The description an in-memory scene starts from: a title that spins, with a camera and a light (the shape the server's examples have). */
export const MEMORY_DESCRIPTION = (): Record<string, unknown> => ({
  version: 1,
  camera: { lens: 50, position: [0, -6, 1.5], target: [0, 0, 1] },
  lights: [{ type: 'area', position: [3, -4, 5], energy: 800 }],
  objects: [{ id: 'title', type: 'text', text: 'Hola', color: 'accent', keys: [{ t: 0, scale: 0.2 }, { t: 1, scale: 1 }] }],
});

/** A 1x1 grey picture: the placeholder frame of the in-memory preview. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** A port that keeps the descriptions in memory by scope and makes up the rest, for `?adapter=memory`, the examples build and the specs. A `[fail]` in the idea is refused as the server refuses one that never passes. */
export class InMemoryBlenderScene implements BlenderScenePort {
  private readonly kept = new Map<string, SceneDescription>();

  load(scope: string): Observable<SceneDescription | null> {
    return of(this.kept.get(scope) ?? null);
  }

  write(context: SceneContext, idea: string, current: Record<string, unknown> | null): Observable<SceneWritten> {
    return defer(() => {
      if (idea.includes('[fail]')) return throwError(() => new SceneFailed(422, 'objects[0].keys[1].t: 7 is outside the scene (simulated)'));
      const base = current ?? MEMORY_DESCRIPTION();
      const lens = Number((base['camera'] as { lens?: number } | undefined)?.lens ?? 50);
      const description = current ? { ...base, camera: { ...(base['camera'] as object), lens: Math.max(18, Math.round(lens * 0.8)) } } : base;
      const written: SceneWritten = { description, resolved: description, provider: 'memory', model: 'memory-model', attempts: 1 };
      this.kept.set(context.scope, { description, resolved: description });
      return of(written);
    });
  }

  save(context: SceneContext, description: Record<string, unknown>): Observable<SceneDescription> {
    return defer(() => {
      if (description['version'] !== 1) return throwError(() => new SceneFailed(400, 'version: must be 1'));
      const saved = { description, resolved: description };
      this.kept.set(context.scope, saved);
      return of(saved);
    });
  }

  preview(context: SceneContext, description: Record<string, unknown>, t: number): Observable<Blob> {
    return defer(() => {
      if (description['version'] !== 1) return throwError(() => new SceneFailed(400, 'version: must be 1'));
      if (t < 0 || t > context.seconds) return throwError(() => new SceneFailed(400, `t: ${t} is outside the scene (0 to ${context.seconds} s)`));
      return of(new Blob([PNG], { type: 'image/png' }));
    });
  }
}
