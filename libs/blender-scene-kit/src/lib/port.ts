import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

/** A description of a 3D scene, as the editor holds it: the JSON a person edits, and the same with every key in seconds when the server gives it. */
export interface SceneDescription {
  readonly description: Record<string, unknown>;
  readonly resolved?: Record<string, unknown>;
}

/** What the writer answers: the description and who wrote it. */
export interface SceneWritten extends SceneDescription {
  readonly provider: string;
  readonly model: string;
  readonly attempts: number;
}

/** What one call is about: the block's `scope` (the file of a project's scene; empty for a request that has no file yet), its length and the shape of its frame. */
export interface SceneContext {
  readonly scope: string;
  readonly seconds: number;
  readonly aspectRatio: string;
}

/** Why an operation was refused, told by the status the server answered with and the words it gave (the block turns it into its own sentence). */
export class SceneFailed extends Error {
  constructor(
    readonly status: number,
    /** The server's own words when it gave any. */
    readonly said = '',
  ) {
    super(said || `status ${status}`);
    this.name = 'SceneFailed';
  }
}

/**
 * What the 3D scene block needs from whoever hosts it: read the description a scene already has, write or change one with a model, store one written by hand and draw a frame of it. A host with a project (the scene's
 * file lives in `sources/`) and a host with a single request (nothing is stored until it is sent) each give their own; both refuse with `SceneFailed`.
 */
export interface BlenderScenePort {
  /** The description the scene already has, or `null` when none was ever written. */
  load(scope: string): Observable<SceneDescription | null>;
  /** Writes a description from the idea, or, with `current`, changes that one as the idea says. */
  write(context: SceneContext, idea: string, current: Record<string, unknown> | null): Observable<SceneWritten>;
  /** Keeps a description written by hand (checked as the server checks every one); answers it as kept. */
  save(context: SceneContext, description: Record<string, unknown>): Observable<SceneDescription>;
  /** One frame at second `t` of `description` (cheap and noisy: the framing and the timing are exact). */
  preview(context: SceneContext, description: Record<string, unknown>, t: number): Observable<Blob>;
}

export const BLENDER_SCENE_PORT = new InjectionToken<BlenderScenePort>('BLENDER_SCENE_PORT');
