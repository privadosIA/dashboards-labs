import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { AssistModelStore } from '../editor/assist-model/assist-model.store';
import { assistErrorMessage, ASSIST_MAX_CHARS, isAssistRefusal } from '../editor/assistant.store';
import { ApiService } from '../core/api.service';
import { MusicGeneratorName } from '../core/api.models';
import { RoutingStore } from '../core/routing.store';

export interface MusicProposal {
  trackId: string;
  caption: string;
  lyrics: string;
  /** Style tags for HeartMuLa and DiffRhythm2; absent when the generator does not use them or the model gave none. */
  tags?: string;
}

export interface MusicAssistFailure {
  trackId: string;
  message: string;
  /** The model itself declined to write the text (the remedy is another model). */
  refused: boolean;
}

/**
 * State of the song assistant in the music studio. One request at a time; the
 * result is a PROPOSAL tied to a track that the user applies or discards, never
 * applied by itself. Cancelling unsubscribes, which aborts the HTTP request and
 * makes the server unload the model, without going through error handling.
 */
@Injectable({ providedIn: 'root' })
export class MusicAssistStore {
  private readonly api = inject(ApiService);
  private readonly model = inject(AssistModelStore);
  private readonly routing = inject(RoutingStore);

  /** The track whose request is in flight, if any. */
  readonly busy = signal<string | null>(null);
  /** Whole seconds since the request started. */
  readonly elapsed = signal(0);
  readonly proposal = signal<MusicProposal | null>(null);
  readonly failure = signal<MusicAssistFailure | null>(null);

  private sub?: Subscription;
  private timer?: ReturnType<typeof setInterval>;

  /** Why a description cannot be sent ('' when it can). */
  static unavailableReason(text: string | undefined): '' | 'empty' | 'tooLong' {
    const t = (text ?? '').trim();
    if (!t) return 'empty';
    return t.length > ASSIST_MAX_CHARS ? 'tooLong' : '';
  }

  /**
   * Asks for the style and lyrics of `trackId` from `text`. Returns false (and
   * does nothing) when another request is in flight or the text cannot be sent.
   */
  ask(trackId: string, text: string, instrumental: boolean, generator?: MusicGeneratorName): boolean {
    if (this.busy() || MusicAssistStore.unavailableReason(text)) return false;
    this.failure.set(null);
    this.proposal.set(null);
    this.busy.set(trackId);
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.update((s) => s + 1), 1000);
    this.sub = this.api.assistMusic(text.trim(), instrumental, this.routing.external('assistant') ? undefined : this.model.selected() || undefined, generator).subscribe({
      next: (res) => {
        this.finish();
        this.proposal.set({ trackId, caption: res.caption, lyrics: res.lyrics, ...(res.tags ? { tags: res.tags } : {}) });
      },
      error: (err: unknown) => {
        this.finish();
        this.failure.set({ trackId, message: assistErrorMessage(err), refused: isAssistRefusal(err) });
      },
    });
    return true;
  }

  /** Aborts the request in flight; no proposal and no error are shown. */
  cancel(): void {
    this.sub?.unsubscribe();
    this.finish();
  }

  /** The proposal (and clears it), or null when there is none. */
  use(): MusicProposal | null {
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

  /** Cancels anything in flight and forgets the proposal and the error (leaving the studio). */
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
