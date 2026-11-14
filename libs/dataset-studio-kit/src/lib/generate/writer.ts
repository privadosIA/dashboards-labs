import { InjectionToken } from '@angular/core';
import { ApiError, type ApiClient } from '@lab/api-client';
import { type Observable, catchError, defer, map, of, throwError } from 'rxjs';

import type { Tuple } from './tuples';

/** A preset sent as an example of the house style: never copied by the model. */
export interface Example {
  readonly prompt: string;
  readonly negative?: string;
  readonly tags?: readonly string[];
}

/** Why the assistant did not answer: a run is going (`busy`), the model declined (`refused`), no assistant (`unavailable`), a remote provider the person has not consented to (`consent`), or no server. */
export type GenerateFailure = 'busy' | 'refused' | 'unavailable' | 'consent' | 'unreachable';

export class GenerateFailed extends Error {
  constructor(
    readonly kind: GenerateFailure,
    readonly detail = '',
  ) {
    super(detail || kind);
    this.name = 'GenerateFailed';
  }
}

export interface WriteInput {
  readonly text: string;
  readonly provider?: string;
  readonly model?: string;
  readonly examples?: readonly Example[];
}

export interface MusicInput extends WriteInput {
  readonly generator: string;
  readonly instrumental: boolean;
}

export interface MusicAnswer {
  /** The style, in English. */
  readonly caption: string;
  readonly lyrics: string;
  /** The generator's style tags (HeartMuLa, DiffRhythm2); empty when it gave none. */
  readonly tags: string;
}

export interface DatasetInput {
  readonly mode: 'video' | 'motion' | 'music';
  readonly text: string;
  readonly language: string;
  readonly engine?: string;
  readonly negative?: string;
  readonly look?: string;
  readonly images?: { readonly variants: number };
  readonly generator?: string;
  readonly examples?: readonly Example[];
  readonly model?: string;
  readonly provider?: string;
}

export interface DatasetAnswer {
  readonly entries: readonly Tuple[];
  readonly warnings: readonly string[];
}

/** What generation needs from the assistant: one prompt for a scene or a graphic, one song, and (when the server has it) a whole dataset. */
export interface WriterPort {
  image(input: WriteInput): Observable<string>;
  motion(input: WriteInput): Observable<string>;
  music(input: MusicInput): Observable<MusicAnswer>;
  /** The one-sentence writer (`POST /api/assist/dataset`, requested): only for a server that lists the `dataset` feature. */
  dataset(input: DatasetInput): Observable<DatasetAnswer>;
}

export const WRITER = new InjectionToken<WriterPort>('WRITER');

const failureOf = (e: unknown): GenerateFailed => {
  if (e instanceof GenerateFailed) return e;
  if (!(e instanceof ApiError)) return new GenerateFailed('unreachable', e instanceof Error ? e.message : String(e));
  if (e.status === 409) return new GenerateFailed('busy', e.message);
  if (e.status === 422) return new GenerateFailed('refused', e.message);
  if (e.status === 503) return new GenerateFailed('unavailable', e.message);
  if (e.status === 403 || /consent/i.test(String(e.code))) return new GenerateFailed('consent', e.message);
  return new GenerateFailed('unreachable', e.message);
};

type Post = (path: string, options: unknown) => Observable<unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The examples as the contract takes them: `tags` is one comma-separated string. */
export const wireExamples = (examples: readonly Example[] | undefined): { prompt: string; negative?: string; tags?: string }[] | undefined =>
  examples?.length ? examples.map((e) => ({ prompt: e.prompt, ...(e.negative ? { negative: e.negative } : {}), ...(e.tags?.length ? { tags: e.tags.join(', ') } : {}) })) : undefined;

/** The server's assistant, through the typed client. */
export class ServerWriter implements WriterPort {
  constructor(private readonly api: Pick<ApiClient, 'post'>) {}

  private post(path: string, body: unknown): Observable<Record<string, unknown>> {
    return defer(() => (this.api.post as unknown as Post)(path, { body })).pipe(
      map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : {})),
      catchError((e) => throwError(() => failureOf(e))),
    );
  }

  private assist(task: 'image' | 'motion', input: WriteInput): Observable<string> {
    return this.post('/api/assist', { task, text: input.text, ...(input.provider ? { provider: input.provider } : {}), ...(input.model ? { model: input.model } : {}), ...(input.examples?.length ? { examples: wireExamples(input.examples) } : {}) }).pipe(map((a) => str(a['text']).trim()));
  }

  image(input: WriteInput): Observable<string> {
    return this.assist('image', input);
  }

  motion(input: WriteInput): Observable<string> {
    return this.assist('motion', input);
  }

  music(input: MusicInput): Observable<MusicAnswer> {
    return this.post('/api/assist', { task: 'music', text: input.text, generator: input.generator, instrumental: input.instrumental, ...(input.provider ? { provider: input.provider } : {}), ...(input.model ? { model: input.model } : {}), ...(input.examples?.length ? { examples: wireExamples(input.examples) } : {}) }).pipe(
      map((a) => ({ caption: str(a['caption']).trim(), lyrics: str(a['lyrics']).trim(), tags: str(a['tags']).trim() })),
    );
  }

  dataset(input: DatasetInput): Observable<DatasetAnswer> {
    return this.post('/api/assist/dataset', { ...input, ...(input.examples?.length ? { examples: wireExamples(input.examples) } : {}) }).pipe(
      map((a) => ({ entries: (Array.isArray(a['entries']) ? a['entries'] : []) as Tuple[], warnings: Array.isArray(a['warnings']) ? (a['warnings'] as unknown[]).map(String) : [] })),
    );
  }
}

/** The assistant with no server: short, deterministic answers, so that `?adapter=memory` and the specs run every kind end to end. */
export class MemoryWriter implements WriterPort {
  image(input: WriteInput): Observable<string> {
    return of(`${input.text}, cinematic lighting, highly detailed`);
  }

  motion(input: WriteInput): Observable<string> {
    return of(`an animated graphic: ${input.text}`);
  }

  music(input: MusicInput): Observable<MusicAnswer> {
    return of({ caption: `${input.text}, upbeat, warm`, lyrics: input.instrumental ? '' : '[Verse]\nla la la\n[Chorus]\nla la la la', tags: input.generator === 'ace-step' ? '' : 'pop, upbeat, warm' });
  }

  dataset(input: DatasetInput): Observable<DatasetAnswer> {
    const parts = input.text.split(/[.;\n]+/).map((p) => p.trim()).filter(Boolean).slice(0, 5);
    const entries = (parts.length ? parts : [input.text]).map((p, i): Tuple => [`s${String(i + 1).padStart(2, '0')}`, p.slice(0, 40), '', `${input.negative ? `Negative: ${input.negative}\n` : ''}${p}`]);
    return of({ entries, warnings: [] });
  }
}
