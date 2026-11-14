import type { ApiClient, components } from '@lab/api-client';
import { Observable, catchError, defer, forkJoin, from, last, map, of, shareReplay, switchMap, takeWhile, throwError, timer } from 'rxjs';

import { STUDIO_CLIENT } from '../core/client';
import { blobToDataUrl, dataUrlToBlob, pictureFileName } from '../shared/data-url';
import type { EditRequest, EditResult, ImageModel } from './model';
import type { ImageEditPort } from './port';
import { EditRefused, validateEdit } from './validate';

/** What the adapter uses of the API client: the options, the form, the reading of the edit and its pictures, and the delete. */
export type EditApi = Pick<ApiClient, 'get' | 'postForm' | 'delete' | 'getBlobAt'>;

export interface ServerEditOptions {
  /** Milliseconds between two reads of the edit while it is unfinished. */
  pollMs?: number;
  /** The name the host gives itself to the server (`client` in the API); the studio's own when left out. */
  client?: string;
}

type GenerationOptions = components['schemas']['GenerationOptions'];
type ServerModel = components['schemas']['ImageModel'];
type ServerEditRequest = components['schemas']['ImageEditRequest'];

/** The request in the server's words: the strength and the negative prompt only for a model that takes them, the variants no more than it makes. */
export function toEditRequest(request: EditRequest, model: ServerModel, client = STUDIO_CLIENT): ServerEditRequest {
  const out: ServerEditRequest = { model: request.model, prompt: request.prompt.trim(), variants: Math.min(request.variants, model.max_variants), client };
  if (model.strength) out.strength = request.strength;
  if (model.negative_prompt && request.negativePrompt.trim()) out.negative_prompt = request.negativePrompt.trim();
  return out;
}

const toPortModel = (m: ServerModel): ImageModel => ({
  id: m.id,
  name: m.name,
  description: m.description,
  available: m.available,
  ...(m.reason ? { reason: m.reason } : {}),
  strength: m.strength,
  negativePrompt: m.negative_prompt,
  maxVariants: m.max_variants,
});

/**
 * An image edit port that retouches through the server (`/api/image-edits`). The server keeps an edit until it is deleted
 * and the studio keeps nothing of it, so the adapter reads the pictures, deletes the edit and gives the pictures as data URLs.
 */
export class ServerImageEdit implements ImageEditPort {
  private readonly pollMs: number;
  private readonly client?: string;
  private readonly options$: Observable<GenerationOptions>;

  constructor(
    private readonly api: EditApi,
    { pollMs = 1000, client }: ServerEditOptions = {},
  ) {
    this.pollMs = pollMs;
    this.client = client;
    this.options$ = defer(() => this.api.get('/api/generation/options')).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  models(): Observable<readonly ImageModel[]> {
    return this.options$.pipe(map((o) => o.image_models.map(toPortModel)));
  }

  edit(request: EditRequest): Observable<readonly EditResult[]> {
    return this.options$.pipe(
      switchMap((options) => {
        const models = options.image_models;
        const chosen = models.find((m) => m.id === request.model && m.available);
        const problems = validateEdit(request, models.map(toPortModel));
        if (problems.length || !chosen) return throwError(() => new EditRefused(problems, chosen?.max_variants));
        return this.run(request, chosen);
      }),
    );
  }

  private run(request: EditRequest, model: ServerModel): Observable<readonly EditResult[]> {
    const blob = dataUrlToBlob(request.image.dataUrl);
    const form = new FormData();
    form.set('request', JSON.stringify(toEditRequest(request, model, this.client)));
    form.set('image', blob, pictureFileName(request.image.name, blob.type));
    return this.api.postForm('/api/image-edits', form).pipe(
      switchMap((made) =>
        timer(0, this.pollMs).pipe(
          switchMap(() => this.api.get('/api/image-edits/{id}', { path: { id: made.id } })),
          takeWhile((e) => e.state !== 'done' && e.state !== 'failed', true),
          last(),
          switchMap((edit) => {
            const finish = <T>(value: Observable<T>) =>
              this.api.delete('/api/image-edits/{id}', { path: { id: edit.id } }).pipe(
                catchError(() => of(undefined)),
                switchMap(() => value),
              );
            if (edit.state === 'failed') return finish(throwError(() => new Error(edit.error ?? 'the edit failed')));
            const pictures = (edit.results ?? []).map((r) =>
              this.api.getBlobAt(r.image).pipe(
                switchMap(({ body }) => from(blobToDataUrl(body))),
                map((dataUrl): EditResult => ({ seed: r.seed, image: { name: `result-${r.variant}.png`, dataUrl } })),
              ),
            );
            // The pictures are read before the edit is deleted; if one cannot be read the edit is still removed.
            return forkJoin(pictures).pipe(
              switchMap((results) => finish(of(results as readonly EditResult[]))),
              catchError((e) => finish(throwError(() => e))),
            );
          }),
        ),
      ),
    );
  }
}
