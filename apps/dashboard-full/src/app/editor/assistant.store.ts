import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { describeError } from '../core/api-error.interceptor';
import { ApiErrorBody, AssistRequest } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { RoutingStore } from '../core/routing.store';
import { AssistModelStore } from './assist-model/assist-model.store';

/** The scene field an assistance request was asked from. */
export type AssistField = 'prompt' | 'motion_prompt';

export interface AssistProposal {
  sceneId: string;
  field: AssistField;
  text: string;
}

export interface AssistFailure {
  sceneId: string;
  field: AssistField;
  message: string;
  /** The model itself declined to write the text (the remedy is another model). */
  refused: boolean;
}

export interface AssistBusy {
  sceneId: string;
  field: AssistField;
}

/** Longest text the server accepts (docs/http-api.md). */
export const ASSIST_MAX_CHARS = 2000;

const TASK_OF: Record<AssistField, AssistRequest['task']> = {
  prompt: 'image',
  motion_prompt: 'motion',
};

/**
 * State of the prompt assistant in the editor. One request at a time; the
 * result is a PROPOSAL tied to a (scene, field) that the user accepts or
 * discards, never applied by itself. Cancelling (or leaving the scene)
 * unsubscribes, which aborts the HTTP request and makes the server unload
 * the model, without going through the error handling.
 */
@Injectable({ providedIn: 'root' })
export class AssistantStore {
  private readonly api = inject(ApiService);
  private readonly model = inject(AssistModelStore);
  private readonly routing = inject(RoutingStore);

  /** The request in flight, if any. */
  readonly busy = signal<AssistBusy | null>(null);
  /** Whole seconds since the request started. */
  readonly elapsed = signal(0);
  readonly proposal = signal<AssistProposal | null>(null);
  readonly failure = signal<AssistFailure | null>(null);

  private sub?: Subscription;
  private timer?: ReturnType<typeof setInterval>;

  /** Why the action cannot run for this text ('' when it can). */
  static unavailableReason(text: string | undefined): '' | 'empty' | 'tooLong' {
    const t = (text ?? '').trim();
    if (!t) return 'empty';
    return t.length > ASSIST_MAX_CHARS ? 'tooLong' : '';
  }

  /**
   * Starts a request for `field` of `sceneId` with `text` as the description.
   * Returns false (and does nothing) when another request is in flight or the
   * text cannot be sent.
   */
  ask(sceneId: string, field: AssistField, text: string): boolean {
    if (this.busy() || AssistantStore.unavailableReason(text)) return false;
    this.failure.set(null);
    this.proposal.set(null);
    this.busy.set({ sceneId, field });
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.update((s) => s + 1), 1000);
    this.sub = this.api.assist(TASK_OF[field], text.trim(), this.routing.external('assistant') ? undefined : this.model.selected() || undefined).subscribe({
      next: (res) => {
        this.finish();
        this.proposal.set({ sceneId, field, text: res.text });
      },
      error: (err: unknown) => {
        this.finish();
        this.failure.set({ sceneId, field, message: assistErrorMessage(err), refused: isAssistRefusal(err) });
      },
    });
    return true;
  }

  /** Aborts the request in flight; no proposal and no error are shown. */
  cancel(): void {
    this.sub?.unsubscribe();
    this.finish();
  }

  /** The proposal's text (and clears it), or null when there is none. */
  use(): AssistProposal | null {
    const p = this.proposal();
    this.proposal.set(null);
    return p;
  }

  discard(): void {
    this.proposal.set(null);
  }

  dismissFailure(): void {
    this.failure.set(null);
  }

  /** Cancels anything in flight and forgets the proposal and the error (scene change, leaving the editor). */
  reset(): void {
    this.cancel();
    this.proposal.set(null);
    this.failure.set(null);
  }

  private finish(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.sub = undefined;
    this.busy.set(null);
  }
}

/** Whether the server says the model refused to write the text (`422 assist_refused`). */
export function isAssistRefusal(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 422 && (err.error as ApiErrorBody | undefined)?.error?.code === 'assist_refused';
}

/**
 * The text shown under the field. The server's message already says what to
 * do (for example `ollama pull qwen3:8b`), so it is shown as written; only a
 * 409 is rewritten, because the server speaks of a "run" and of memory
 * without saying what to do from the interface.
 */
export function assistErrorMessage(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return $localize`:@@assist.errorGeneric:Could not generate the prompt.`;
  }
  if (err.status === 409) {
    return $localize`:@@assist.errorBusy:A run is in progress: the assistant waits for it to finish so as not to compete for memory. Try again when it is done.`;
  }
  const body = err.error as ApiErrorBody | undefined;
  const msg = body?.error?.message;
  if (isAssistRefusal(err)) {
    // The server's text names the model first ("<model> refused to write this text. ..."): the notice says it with some humor.
    const model = msg?.match(/(\S+) refused to write this text/)?.[1] ?? '';
    return model
      ? $localize`:@@assist.errorRefusedNamed:“${model}:model:” refused to write it. Thinking about porn, are we? The refusal is the model's, not the application's: pick another installed model with the selector.`
      : $localize`:@@assist.errorRefused:The model refused to write it. Thinking about porn, are we? The refusal is the model's, not the application's: pick another installed model with the selector.`;
  }
  if (msg && err.status !== 401) {
    return msg;
  }
  return describeError(err);
}
