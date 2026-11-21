import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';

import { describeError } from '../../core/api-error.interceptor';
import { ApiErrorBody, AssistModel, DescribeAlternative } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { RoutingStore } from '../../core/routing.store';
import { EditorStore } from '../editor.store';

/** Pictures and clips the describe step accepts (the server also takes .avi, which a project cannot store as a clip). */
export const DESCRIBE_ACCEPT = '.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.mkv,image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,video/x-matroska';

const CLIP_EXT = /\.(mp4|mov|webm|mkv)$/i;

/** One shot of a split clip as shown in the proposal; the user may edit the prompt or drop it. */
export interface ProposedShot {
  start: number;
  end: number;
  prompt: string;
  motion?: string;
  /** Unchecked shots do not become scenes. */
  keep: boolean;
}

export interface DescribeProposal {
  sceneId: string;
  prompt: string;
  /** Clips only. */
  motion?: string;
  /** The vision model that wrote it. */
  model: string;
  /** The id of the provider that wrote it ('ollama' is the built-in one). */
  provider: string;
  /** Only when the clip was split: the shots that can become scenes. */
  shots?: ProposedShot[];
  /** The clip was asked to be split but has no cut: it is one scene. */
  noCuts?: boolean;
}

export type DescribeFailureKind = 'refused' | 'minor' | 'busy' | 'other';

export interface DescribeFailure {
  sceneId: string;
  kind: DescribeFailureKind;
  message: string;
  /** The model that refused or failed; '' when unknown. */
  model: string;
  /** The provider that refused, when the server says. */
  provider?: string;
  /** What to retry with after a refusal: a model at a provider (the user decides; nothing retries by itself). */
  alternatives?: DescribeAlternative[];
}

/**
 * State of "describe a reference" in the editor: upload a picture or a clip to
 * the project's sources, have a local vision model describe it, and hand the
 * text over as a PROPOSAL the user accepts or discards. The uploaded file is
 * only needed to write the text, so it is deleted when the proposal is used or
 * discarded (it is kept only while a refusal can be retried with another model).
 * Cancelling unsubscribes, which aborts the request and makes the server unload
 * the model.
 */
@Injectable({ providedIn: 'root' })
export class DescribeStore {
  private readonly api = inject(ApiService);
  private readonly routing = inject(RoutingStore);
  private readonly env = inject(EnvironmentStore);
  /** The editor the file was uploaded through (it lives with the editor page, not at the root). */
  private editor?: EditorStore;

  readonly models = signal<AssistModel[]>([]);
  readonly defaultModel = signal('');
  readonly detailModel = signal('');
  readonly modelsLoaded = signal(false);
  /** Ask for the more detailed model. */
  readonly detail = signal(false);
  /** A clip becomes one scene per shot instead of one scene. */
  readonly split = signal(false);

  readonly busy = signal<string | null>(null); // the scene id
  readonly elapsed = signal(0);
  readonly proposal = signal<DescribeProposal | null>(null);
  readonly failure = signal<DescribeFailure | null>(null);

  /** Describing runs on a provider that is not the built-in Ollama: its models are its own. */
  readonly external = computed(() => this.routing.external('describe_image') || this.routing.external('describe_video'));

  private sub?: Subscription;
  private timer?: ReturnType<typeof setInterval>;
  private source = '';

  /** Reads the installed vision models once; Ollama down leaves the list empty. */
  async load(): Promise<void> {
    if (this.modelsLoaded()) return;
    try {
      const res = await firstValueFrom(this.api.describeModels());
      this.models.set(res.models);
      this.defaultModel.set(res.default);
      this.detailModel.set(res.detail);
    } catch {
      this.models.set([]);
    } finally {
      this.modelsLoaded.set(true);
    }
  }

  /** Uploads the file and describes it. Returns false when something else is in flight. */
  async run(sceneId: string, file: File, editor: EditorStore): Promise<boolean> {
    if (this.busy()) return false;
    this.reset();
    this.editor = editor;
    this.busy.set(sceneId);
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.update((s) => s + 1), 1000);
    const isClip = CLIP_EXT.test(file.name);
    const name = isClip ? await editor.uploadClip(file) : await editor.uploadSource(file);
    if (!name) {
      const message = editor.sourceError() ?? $localize`:@@describe.errorUpload:The file could not be uploaded.`;
      this.finish();
      this.failure.set({ sceneId, kind: 'other', message, model: '' });
      return true;
    }
    this.source = name;
    this.describeSource(sceneId, undefined);
    return true;
  }

  /**
   * Describes the file already uploaded again, with another model or provider (after a refusal). A
   * string is a model of the same provider; an alternative names its provider, which replaces the
   * routing for this call only. It happens only when the user asks.
   */
  retry(sceneId: string, alt: string | DescribeAlternative): void {
    if (this.busy() || !this.source) return;
    this.failure.set(null);
    this.busy.set(sceneId);
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.update((s) => s + 1), 1000);
    const a = typeof alt === 'string' ? { provider: '', model: alt } : alt;
    this.describeSource(sceneId, a.model, a.provider || undefined);
  }

  private describeSource(sceneId: string, model: string | undefined, provider?: string): void {
    this.sub = this.api.describe(this.editor?.projectId() ?? '', this.source, model, !model && this.detail() && !this.external(), this.split(), provider).subscribe({
      next: (res) => {
        this.finish();
        const by = res.provider || 'ollama';
        const shots = res.shots ?? [];
        if (shots.length > 1) {
          this.proposal.set({
            sceneId,
            prompt: res.prompt,
            model: res.model,
            provider: by,
            shots: shots.map((sh) => ({ start: sh.start, end: sh.end, prompt: sh.prompt, motion: sh.motion || undefined, keep: true })),
          });
        } else if (shots.length === 1) {
          // Asked to split but there is no cut: one scene, and the proposal says so.
          this.proposal.set({ sceneId, prompt: shots[0].prompt, motion: shots[0].motion || undefined, model: res.model, provider: by, noCuts: true });
        } else {
          this.proposal.set({ sceneId, prompt: res.prompt, motion: res.motion || undefined, model: res.model, provider: by });
        }
      },
      error: (err: unknown) => {
        this.finish();
        const f = describeFailure(sceneId, err, model || (this.detail() ? this.detailModel() : this.defaultModel()));
        if (f.kind !== 'refused') void this.dropSource(); // only a refusal can be retried with the same file
        this.failure.set(f);
      },
    });
  }

  /** Aborts the request in flight and removes the uploaded file. */
  cancel(): void {
    this.sub?.unsubscribe();
    this.finish();
    void this.dropSource();
  }

  /** Edits one shot of the proposal: its prompt, or whether it becomes a scene. */
  setShot(index: number, patch: Partial<Pick<ProposedShot, 'prompt' | 'keep'>>): void {
    this.proposal.update((p) => (p?.shots ? { ...p, shots: p.shots.map((sh, i) => (i === index ? { ...sh, ...patch } : sh)) } : p));
  }

  /** The proposal (and clears it), or null; of a split clip only the kept shots remain. The uploaded file is deleted. */
  use(): DescribeProposal | null {
    const p = this.proposal();
    this.proposal.set(null);
    void this.dropSource();
    return p?.shots ? { ...p, shots: p.shots.filter((sh) => sh.keep && sh.prompt.trim()) } : p;
  }

  discard(): void {
    this.proposal.set(null);
    void this.dropSource();
  }

  dismissFailure(): void {
    this.failure.set(null);
    void this.dropSource();
  }

  /** Cancels anything in flight and forgets the proposal and the error (scene change, leaving the editor). */
  reset(): void {
    if (this.busy()) this.cancel();
    this.proposal.set(null);
    this.failure.set(null);
    void this.dropSource();
  }

  /** The other installed vision models, offered after a refusal. */
  alternatives(model: string): string[] {
    return this.models().map((m) => m.name).filter((n) => n !== model);
  }

  /** What the user can retry with after a refusal: the server's list (models at providers), else the other installed Ollama models. */
  choices(f: DescribeFailure): DescribeAlternative[] {
    if (this.env.isPublic()) return []; // the public edition suggests nothing after a refusal
    if (f.alternatives?.length) return f.alternatives;
    return this.alternatives(f.model).map((m) => ({ provider: '', name: 'Ollama', model: m }));
  }

  private finish(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.sub = undefined;
    this.busy.set(null);
  }

  private async dropSource(): Promise<void> {
    const name = this.source;
    this.source = '';
    if (name) await this.editor?.deleteSource(name);
  }
}

/** The text shown for a failure, with its kind. The server's own message is kept for refusals so it names the model. */
export function describeFailure(sceneId: string, err: unknown, model: string): DescribeFailure {
  if (!(err instanceof HttpErrorResponse)) {
    return { sceneId, kind: 'other', model, message: $localize`:@@describe.errorGeneric:The file could not be described.` };
  }
  const body = err.error as ApiErrorBody | undefined;
  const code = body?.error?.code;
  if (err.status === 422 && code === 'describe_minor') {
    return {
      sceneId,
      kind: 'minor',
      model,
      message: $localize`:@@describe.errorMinor:Not described: someone in the picture is or looks under 18, or their age could not be confirmed. The file has been deleted.`,
    };
  }
  if (err.status === 422 && code === 'describe_refused') {
    return {
      sceneId,
      kind: 'refused',
      model,
      provider: body?.error?.provider,
      alternatives: body?.error?.alternatives,
      message: $localize`:@@describe.errorRefused:The model ${model}:model: refused to describe it or did not describe it. The refusal is the model's, not the application's: try another one.`,
    };
  }
  if (err.status === 409) {
    return {
      sceneId,
      kind: 'busy',
      model,
      message: $localize`:@@describe.errorBusy:A run is in progress: describing waits for it to finish so as not to compete for memory. Try again when it ends.`,
    };
  }
  const msg = body?.error?.message;
  return { sceneId, kind: 'other', model, message: msg && err.status !== 401 ? msg : describeError(err) };
}
